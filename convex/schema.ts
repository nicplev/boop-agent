import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

export default defineSchema({
  // Lumi's structured business state. These records are deliberately
  // separate from conversational memory: they are canonical, reviewable,
  // and can be linked back to original evidence.
  projects: defineTable({
    name: v.string(),
    summary: v.optional(v.string()),
    status: projectStatus,
    priority,
    targetAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_and_updated_at", ["status", "updatedAt"])
    .index("by_updated_at", ["updatedAt"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["status"] }),

  workItems: defineTable({
    projectId: v.optional(v.id("projects")),
    kind: workItemKind,
    title: v.string(),
    detail: v.optional(v.string()),
    status: workItemStatus,
    priority,
    ownerName: v.optional(v.string()),
    waitingOnName: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    confidence: v.optional(v.number()),
    needsReview: v.boolean(),
    sourceCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project_id_and_status", ["projectId", "status"])
    .index("by_kind_and_status", ["kind", "status"])
    .index("by_needs_review_and_updated_at", ["needsReview", "updatedAt"])
    .index("by_updated_at", ["updatedAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["kind", "status"],
    }),

  sources: defineTable({
    sourceType: v.union(
      v.literal("manual"),
      v.literal("plaud"),
      v.literal("gmail"),
      v.literal("drive"),
      v.literal("github"),
      v.literal("conversation"),
      v.literal("web"),
    ),
    externalId: v.optional(v.string()),
    title: v.string(),
    summary: v.optional(v.string()),
    uri: v.optional(v.string()),
    contentHash: v.string(),
    sensitivity: v.union(
      v.literal("internal"),
      v.literal("confidential"),
      v.literal("restricted"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("indexed"),
      v.literal("failed"),
    ),
    occurredAt: v.optional(v.number()),
    importedAt: v.number(),
    metadata: v.optional(v.string()),
  })
    .index("by_source_type_and_external_id", ["sourceType", "externalId"])
    .index("by_content_hash", ["contentHash"])
    .index("by_status_and_imported_at", ["status", "importedAt"])
    .index("by_imported_at", ["importedAt"]),

  sourceChunks: defineTable({
    sourceId: v.id("sources"),
    sequence: v.number(),
    content: v.string(),
    locator: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
  })
    .index("by_source_id_and_sequence", ["sourceId", "sequence"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
      filterFields: ["sourceId"],
    }),

  evidenceLinks: defineTable({
    targetType: v.union(v.literal("project"), v.literal("work_item")),
    targetId: v.string(),
    sourceId: v.id("sources"),
    chunkId: v.optional(v.id("sourceChunks")),
    quote: v.optional(v.string()),
    locator: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_target_type_and_target_id", ["targetType", "targetId"])
    .index("by_source_id", ["sourceId"]),

  proposals: defineTable({
    proposalType: v.union(
      v.literal("create_project"),
      v.literal("update_project"),
      v.literal("create_work_item"),
      v.literal("update_work_item"),
    ),
    title: v.string(),
    summary: v.string(),
    payload: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
    ),
    sourceId: v.optional(v.id("sources")),
    targetId: v.optional(v.string()),
    confidence: v.optional(v.number()),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_status_and_created_at", ["status", "createdAt"])
    .index("by_source_id", ["sourceId"]),

  messages: defineTable({
    conversationId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    agentId: v.optional(v.string()),
    turnId: v.optional(v.string()),
    createdAt: v.number(),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    mediaError: v.optional(v.string()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_turn", ["conversationId", "turnId"])
    .index("by_createdAt", ["createdAt"]),

  conversations: defineTable({
    conversationId: v.string(),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    messageCount: v.number(),
    lastActivityAt: v.number(),
  }).index("by_conversation", ["conversationId"]),

  memoryRecords: defineTable({
    memoryId: v.string(),
    content: v.string(),
    tier: v.union(v.literal("short"), v.literal("long"), v.literal("permanent")),
    segment: v.union(
      v.literal("identity"),
      v.literal("preference"),
      v.literal("correction"),
      v.literal("relationship"),
      v.literal("project"),
      v.literal("knowledge"),
      v.literal("context"),
    ),
    importance: v.number(),
    decayRate: v.number(),
    accessCount: v.number(),
    lastAccessedAt: v.number(),
    sourceTurn: v.optional(v.string()),
    lifecycle: v.union(v.literal("active"), v.literal("archived"), v.literal("pruned")),
    supersedes: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
    // Structured sidecar data (JSON blob). Currently used to carry
    // `corrects` text on correction-segment memories. Intentionally loose
    // so extraction prompts can stash provider-specific hints without
    // schema churn.
    metadata: v.optional(v.string()),
    createdAt: v.number(),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
  })
    .index("by_memory_id", ["memoryId"])
    .index("by_tier", ["tier"])
    .index("by_segment", ["segment"])
    .index("by_lifecycle", ["lifecycle"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
      filterFields: ["lifecycle"],
    }),

  executionAgents: defineTable({
    agentId: v.string(),
    conversationId: v.optional(v.string()),
    name: v.string(),
    task: v.string(),
    runtime: v.optional(v.union(v.literal("claude"), v.literal("codex"))),
    model: v.optional(v.string()),
    reasoningEffort: v.optional(v.string()),
    billingMode: v.optional(v.union(v.literal("api"), v.literal("codex-subscription"))),
    status: v.union(
      v.literal("spawned"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("paused"),
    ),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    mcpServers: v.array(v.string()),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.optional(v.number()),
    cacheCreationTokens: v.optional(v.number()),
    costUsd: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_agent_id", ["agentId"])
    .index("by_status", ["status"])
    .index("by_conversation", ["conversationId"]),

  // Append-only LLM usage log. Every model call (dispatcher, execution,
  // extract, consolidation) writes a row here so you can query total cost
  // by source, conversation, or time range.
  usageRecords: defineTable({
    source: v.union(
      v.literal("dispatcher"),
      v.literal("execution"),
      v.literal("extract"),
      v.literal("consolidation-proposer"),
      v.literal("consolidation-adversary"),
      v.literal("consolidation-judge"),
      v.literal("proactive"),
    ),
    conversationId: v.optional(v.string()),
    turnId: v.optional(v.string()),
    agentId: v.optional(v.string()),
    runId: v.optional(v.string()),
    runtime: v.optional(v.union(v.literal("claude"), v.literal("codex"))),
    billingMode: v.optional(v.union(v.literal("api"), v.literal("codex-subscription"))),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.number(),
    cacheCreationTokens: v.number(),
    costUsd: v.number(),
    durationMs: v.number(),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_agent", ["agentId"])
    .index("by_source", ["source"]),

  agentLogs: defineTable({
    agentId: v.string(),
    logType: v.union(
      v.literal("thinking"),
      v.literal("tool_use"),
      v.literal("tool_result"),
      v.literal("text"),
      v.literal("error"),
    ),
    toolName: v.optional(v.string()),
    // Composio account aliases targeted by this tool call (e.g. ["gmail_charry-fusc"]).
    // Populated when the input names a specific connected account, so multi-account
    // toolkits make it visible which inbox / workspace was actually hit.
    accounts: v.optional(v.array(v.string())),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_agent", ["agentId"]),

  memoryEvents: defineTable({
    eventType: v.string(),
    conversationId: v.optional(v.string()),
    memoryId: v.optional(v.string()),
    agentId: v.optional(v.string()),
    data: v.string(),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_type", ["eventType"]),

  automations: defineTable({
    automationId: v.string(),
    name: v.string(),
    task: v.string(),
    integrations: v.array(v.string()),
    schedule: v.string(),
    // IANA timezone the cron expression is evaluated in. Stored at create
    // time so changing the user's global timezone later doesn't shift
    // existing automations. Optional for backwards compatibility — pre-TZ
    // automations fall back to the user's current setting at run time.
    timezone: v.optional(v.string()),
    enabled: v.boolean(),
    conversationId: v.optional(v.string()),
    notifyConversationId: v.optional(v.string()),
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_automation_id", ["automationId"])
    .index("by_enabled", ["enabled"]),

  sendblueDedup: defineTable({
    handle: v.string(),
    claimedAt: v.number(),
  }).index("by_handle", ["handle"]),

  drafts: defineTable({
    draftId: v.string(),
    conversationId: v.string(),
    kind: v.string(),
    summary: v.string(),
    payload: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("rejected"),
      v.literal("expired"),
    ),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_draft_id", ["draftId"])
    .index("by_conversation_status", ["conversationId", "status"]),

  consolidationRuns: defineTable({
    runId: v.string(),
    trigger: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    proposalsCount: v.number(),
    mergedCount: v.number(),
    prunedCount: v.number(),
    notes: v.optional(v.string()),
    // JSON blob: { proposals: [...], decisions: [...], applied: [...] }
    // Captured so you can inspect the reasoning for any historical run.
    details: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_run_id", ["runId"])
    .index("by_status", ["status"]),

  // Runtime overrides for things normally pinned by env vars (e.g. the Claude
  // model). Lets the user say "use opus" via iMessage and have the next agent
  // run respect it without a redeploy.
  settings: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  automationRuns: defineTable({
    runId: v.string(),
    automationId: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    agentId: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_automation", ["automationId"])
    .index("by_run_id", ["runId"]),
});
