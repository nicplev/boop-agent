import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const sensitivity = v.union(
  v.literal("internal"),
  v.literal("confidential"),
  v.literal("restricted"),
);

function fingerprint(value: string): string {
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

export const listForDashboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    return await ctx.db
      .query("sources")
      .withIndex("by_imported_at")
      .order("desc")
      .take(limit);
  },
});

export const getWithChunks = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return null;
    const chunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source_id_and_sequence", (q) => q.eq("sourceId", args.sourceId))
      .order("asc")
      .take(100);
    return { source, chunks };
  },
});

export const createManual = mutation({
  args: {
    title: v.string(),
    summary: v.optional(v.string()),
    content: v.string(),
    sensitivity: v.optional(sensitivity),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    const content = args.content.trim();
    if (!title) throw new Error("Source title is required");
    if (!content) throw new Error("Source content is required");
    if (content.length > 50_000) {
      throw new Error("Manual sources are limited to 50,000 characters");
    }

    const contentHash = fingerprint(`${title}\n${content}`);
    const existing = await ctx.db
      .query("sources")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", contentHash))
      .first();
    if (existing) return existing._id;

    const now = Date.now();
    const sourceId = await ctx.db.insert("sources", {
      sourceType: "manual",
      title,
      summary: args.summary?.trim() || undefined,
      contentHash,
      sensitivity: args.sensitivity ?? "internal",
      status: "indexed",
      occurredAt: args.occurredAt,
      importedAt: now,
    });
    await ctx.db.insert("sourceChunks", {
      sourceId,
      sequence: 0,
      content,
      locator: "Manual capture",
      createdAt: now,
    });
    return sourceId;
  },
});
