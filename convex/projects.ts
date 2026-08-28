import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLumiWorkspaceSecret } from "./lumiAuth";

const projectStatus = v.union(
  v.literal("planned"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("archived"),
);

const priority = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

export const listForDashboard = query({
  args: {
    workspaceSecret: v.string(),
    status: v.optional(projectStatus),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireLumiWorkspaceSecret(args.workspaceSecret);
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    if (args.status) {
      return await ctx.db
        .query("projects")
        .withIndex("by_status_and_updated_at", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("projects")
      .withIndex("by_updated_at")
      .order("desc")
      .take(limit);
  },
});

export const get = query({
  args: { workspaceSecret: v.string(), projectId: v.id("projects") },
  handler: async (ctx, args) => {
    requireLumiWorkspaceSecret(args.workspaceSecret);
    return await ctx.db.get(args.projectId);
  },
});

export const create = mutation({
  args: {
    workspaceSecret: v.string(),
    name: v.string(),
    summary: v.optional(v.string()),
    status: v.optional(projectStatus),
    priority: v.optional(priority),
    targetAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireLumiWorkspaceSecret(args.workspaceSecret);
    const name = args.name.trim();
    if (!name) throw new Error("Project name is required");
    const now = Date.now();
    return await ctx.db.insert("projects", {
      name,
      summary: args.summary?.trim() || undefined,
      status: args.status ?? "planned",
      priority: args.priority ?? "medium",
      targetAt: args.targetAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    workspaceSecret: v.string(),
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    summary: v.optional(v.string()),
    status: v.optional(projectStatus),
    priority: v.optional(priority),
    targetAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    requireLumiWorkspaceSecret(args.workspaceSecret);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const { workspaceSecret: _workspaceSecret, projectId: _projectId, targetAt, ...changes } =
      args;
    const name = changes.name?.trim();
    if (changes.name !== undefined && !name) throw new Error("Project name is required");
    await ctx.db.patch(args.projectId, {
      ...changes,
      ...(name ? { name } : {}),
      ...(targetAt === null
        ? { targetAt: undefined }
        : targetAt !== undefined
          ? { targetAt }
          : {}),
      updatedAt: Date.now(),
    });
    return args.projectId;
  },
});
