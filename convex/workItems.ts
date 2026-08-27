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

const workItemStatus = v.union(
  v.literal("proposed"),
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("resolved"),
  v.literal("rejected"),
  v.literal("superseded"),
);

const priority = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

export const listForDashboard = query({
  args: {
    projectId: v.optional(v.id("projects")),
    kind: v.optional(workItemKind),
    status: v.optional(workItemStatus),
    needsReview: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 200, 500));
    const scanLimit = Math.min(1000, Math.max(limit * 4, 100));
    const rows = args.projectId
      ? await ctx.db
          .query("workItems")
          .withIndex("by_project_id_and_status", (q) => q.eq("projectId", args.projectId!))
          .order("desc")
          .take(scanLimit)
      : args.needsReview !== undefined
        ? await ctx.db
            .query("workItems")
            .withIndex("by_needs_review_and_updated_at", (q) =>
              q.eq("needsReview", args.needsReview!),
            )
            .order("desc")
            .take(scanLimit)
        : await ctx.db
            .query("workItems")
            .withIndex("by_updated_at")
            .order("desc")
            .take(scanLimit);

    return rows
      .filter((item) => args.kind === undefined || item.kind === args.kind)
      .filter((item) => args.status === undefined || item.status === args.status)
      .filter(
        (item) => args.needsReview === undefined || item.needsReview === args.needsReview,
      )
      .slice(0, limit);
  },
});

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    kind: workItemKind,
    title: v.string(),
    detail: v.optional(v.string()),
    status: v.optional(workItemStatus),
    priority: v.optional(priority),
    ownerName: v.optional(v.string()),
    waitingOnName: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    confidence: v.optional(v.number()),
    needsReview: v.optional(v.boolean()),
    sourceCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (!title) throw new Error("Work item title is required");
    if (args.projectId && !(await ctx.db.get(args.projectId))) {
      throw new Error("Project not found");
    }
    const now = Date.now();
    const needsReview = args.needsReview ?? false;
    return await ctx.db.insert("workItems", {
      projectId: args.projectId,
      kind: args.kind,
      title,
      detail: args.detail?.trim() || undefined,
      status: args.status ?? (needsReview ? "proposed" : "open"),
      priority: args.priority ?? "medium",
      ownerName: args.ownerName?.trim() || undefined,
      waitingOnName: args.waitingOnName?.trim() || undefined,
      dueAt: args.dueAt,
      confidence:
        args.confidence === undefined ? undefined : Math.max(0, Math.min(args.confidence, 1)),
      needsReview,
      sourceCount: Math.max(0, Math.floor(args.sourceCount ?? 0)),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setStatus = mutation({
  args: {
    workItemId: v.id("workItems"),
    status: workItemStatus,
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.workItemId);
    if (!item) throw new Error("Work item not found");
    await ctx.db.patch(args.workItemId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return args.workItemId;
  },
});

export const review = mutation({
  args: {
    workItemId: v.id("workItems"),
    decision: v.union(v.literal("accept"), v.literal("reject")),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.workItemId);
    if (!item) throw new Error("Work item not found");
    if (!item.needsReview) return args.workItemId;
    await ctx.db.patch(args.workItemId, {
      needsReview: false,
      status:
        args.decision === "reject"
          ? "rejected"
          : item.status === "proposed"
            ? "open"
            : item.status,
      updatedAt: Date.now(),
    });
    return args.workItemId;
  },
});
