import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const workItemKind = v.union(
  v.literal("decision"),
  v.literal("commitment"),
  v.literal("task"),
  v.literal("idea"),
  v.literal("waiting_on"),
  v.literal("blocker"),
  v.literal("risk"),
  v.literal("question"),
  v.literal("opportunity"),
);

const priority = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

type WorkItemPayload = {
  projectId?: string;
  kind:
    | "decision"
    | "commitment"
    | "task"
    | "idea"
    | "waiting_on"
    | "blocker"
    | "risk"
    | "question"
    | "opportunity";
  title: string;
  detail?: string;
  priority: "low" | "medium" | "high" | "critical";
  ownerName?: string;
  quote?: string;
};

export const listPending = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    return await ctx.db
      .query("proposals")
      .withIndex("by_status_and_created_at", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(limit);
  },
});

export const proposeWorkItem = mutation({
  args: {
    sourceId: v.id("sources"),
    projectId: v.optional(v.id("projects")),
    kind: workItemKind,
    title: v.string(),
    detail: v.optional(v.string()),
    priority: v.optional(priority),
    ownerName: v.optional(v.string()),
    confidence: v.optional(v.number()),
    quote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) throw new Error("Source not found");
    if (args.projectId && !(await ctx.db.get(args.projectId))) {
      throw new Error("Project not found");
    }
    const title = args.title.trim();
    if (!title) throw new Error("Proposal title is required");
    const payload: WorkItemPayload = {
      projectId: args.projectId,
      kind: args.kind,
      title,
      detail: args.detail?.trim() || undefined,
      priority: args.priority ?? "medium",
      ownerName: args.ownerName?.trim() || undefined,
      quote: args.quote?.trim() || undefined,
    };
    return await ctx.db.insert("proposals", {
      proposalType: "create_work_item",
      title,
      summary: `${args.kind.replaceAll("_", " ")} proposed from ${source.title}`,
      payload: JSON.stringify(payload),
      status: "pending",
      sourceId: args.sourceId,
      confidence:
        args.confidence === undefined ? undefined : Math.max(0, Math.min(args.confidence, 1)),
      createdAt: Date.now(),
    });
  },
});

export const decide = mutation({
  args: {
    proposalId: v.id("proposals"),
    decision: v.union(v.literal("accept"), v.literal("reject")),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.status !== "pending") return { proposalId: args.proposalId };
    const now = Date.now();
    if (args.decision === "reject") {
      await ctx.db.patch(args.proposalId, { status: "rejected", decidedAt: now });
      return { proposalId: args.proposalId };
    }
    if (proposal.proposalType !== "create_work_item" || !proposal.sourceId) {
      throw new Error("Unsupported proposal type");
    }

    const payload = JSON.parse(proposal.payload) as WorkItemPayload;
    const linkedProjectId = payload.projectId
      ? ctx.db.normalizeId("projects", payload.projectId)
      : null;
    if (payload.projectId && !linkedProjectId) throw new Error("Invalid project link");

    const newWorkItemId = await ctx.db.insert("workItems", {
      projectId: linkedProjectId ?? undefined,
      kind: payload.kind,
      title: payload.title,
      detail: payload.detail,
      status: "open",
      priority: payload.priority,
      ownerName: payload.ownerName,
      needsReview: false,
      confidence: proposal.confidence,
      sourceCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("evidenceLinks", {
      targetType: "work_item",
      targetId: String(newWorkItemId),
      sourceId: proposal.sourceId,
      quote: payload.quote,
      createdAt: now,
    });
    await ctx.db.patch(args.proposalId, {
      status: "accepted",
      targetId: String(newWorkItemId),
      decidedAt: now,
    });
    return { proposalId: args.proposalId, workItemId: newWorkItemId };
  },
});
