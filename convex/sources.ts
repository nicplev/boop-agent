import { query } from "./_generated/server";
import { v } from "convex/values";

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
