import { z } from "zod";
import {
  createLumiProject,
  createLumiWorkItem,
  listLumiProjects,
  listLumiSources,
  listLumiWorkItems,
  proposeLumiWorkItem,
  readLumiSource,
  setLumiWorkItemStatus,
  updateLumiProject,
} from "./lumi-workspace-client.js";
import { defineRuntimeTool } from "./runtimes/tool.js";
import { runtimeText, type RuntimeTool } from "./runtimes/types.js";

const NAMESPACE = "lumi-workspace";

const projectStatus = z.enum(["planned", "active", "paused", "completed", "archived"]);
const priority = z.enum(["low", "medium", "high", "critical"]);
const workItemKind = z.enum([
  "decision",
  "commitment",
  "task",
  "idea",
  "waiting_on",
  "blocker",
  "risk",
  "question",
  "opportunity",
]);
const workItemStatus = z.enum([
  "proposed",
  "open",
  "in_progress",
  "completed",
  "resolved",
  "rejected",
  "superseded",
]);

export function createLumiWorkspaceTools(): RuntimeTool[] {
  return [
    defineRuntimeTool(
      NAMESPACE,
      "list_projects",
      "Read Lumi's canonical projects. Call this before answering questions about current project status, priority, or outcomes.",
      {
        status: projectStatus.optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      },
      async (args) => {
        const projects = await listLumiProjects({
          limit: args.limit,
          ...(args.status ? { status: args.status } : {}),
        });
        if (projects.length === 0) return runtimeText("No matching projects.");
        return runtimeText(
          projects
            .map(
              (project) =>
                `• [${project._id}] ${project.name} — ${project.status}, ${project.priority} priority${project.summary ? `\n  ${project.summary}` : ""}`,
            )
            .join("\n"),
        );
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "create_project",
      "Create a canonical Lumi project only when the user explicitly asks to start or track it as a project.",
      {
        name: z.string().min(1),
        summary: z.string().optional(),
        status: projectStatus.optional().default("planned"),
        priority: priority.optional().default("medium"),
        targetAt: z
          .number()
          .optional()
          .describe("Optional target timestamp in Unix milliseconds."),
      },
      async (args) => {
        const id = await createLumiProject(args);
        return runtimeText(`Created project [${id}] ${args.name}.`);
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "update_project",
      "Update a canonical project after the user explicitly changes its outcome, status, priority, or target date.",
      {
        projectId: z.string(),
        name: z.string().optional(),
        summary: z.string().optional(),
        status: projectStatus.optional(),
        priority: priority.optional(),
        targetAt: z
          .number()
          .nullable()
          .optional()
          .describe("Unix milliseconds, or null to clear the target date."),
      },
      async (args) => {
        await updateLumiProject(args);
        return runtimeText(`Updated project [${args.projectId}].`);
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "list_work_items",
      "Read canonical decisions, commitments, tasks, ideas, blockers, risks, questions, and opportunities. Use projectId when discussing one project.",
      {
        projectId: z.string().optional(),
        kind: workItemKind.optional(),
        status: workItemStatus.optional(),
        needsReview: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional().default(100),
      },
      async (args) => {
        const items = await listLumiWorkItems(args);
        if (items.length === 0) return runtimeText("No matching work items.");
        return runtimeText(
          items
            .map(
              (item) =>
                `• [${item._id}] ${item.kind}: ${item.title} — ${item.status}, ${item.priority} priority${item.needsReview ? " (awaiting review)" : ""}${item.ownerName ? `; owner: ${item.ownerName}` : ""}`,
            )
            .join("\n"),
        );
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "create_work_item",
      `Record a Lumi decision, commitment, task, idea, blocker, risk, question, waiting-on item, or opportunity.

Set needsReview=false only when the user explicitly stated or confirmed the item. Set needsReview=true for anything inferred from a meeting, email, document, transcript, or agent analysis; inferred items must remain proposed until reviewed.`,
      {
        projectId: z.string().optional(),
        kind: workItemKind,
        title: z.string().min(1),
        detail: z.string().optional(),
        priority: priority.optional().default("medium"),
        ownerName: z.string().optional(),
        waitingOnName: z.string().optional(),
        dueAt: z.number().optional().describe("Optional due timestamp in Unix milliseconds."),
        confidence: z.number().min(0).max(1).optional(),
        needsReview: z.boolean(),
        sourceCount: z.number().int().min(0).optional().default(0),
      },
      async (args) => {
        const id = await createLumiWorkItem({
          ...args,
          status: args.needsReview ? "proposed" : "open",
        });
        return runtimeText(
          args.needsReview
            ? `Proposed ${args.kind} [${id}] for human review.`
            : `Recorded ${args.kind} [${id}].`,
        );
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "set_work_item_status",
      "Change a work item's status only when the user explicitly completes, resolves, rejects, pauses, or reopens it.",
      {
        workItemId: z.string(),
        status: workItemStatus,
      },
      async (args) => {
        await setLumiWorkItemStatus(args);
        return runtimeText(`Set work item [${args.workItemId}] to ${args.status}.`);
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "list_sources",
      "List Lumi's captured evidence sources. Use this to find the stable sourceId before reading or proposing from a source.",
      { limit: z.number().int().min(1).max(100).optional().default(50) },
      async (args) => {
        const sources = await listLumiSources(args);
        if (sources.length === 0) return runtimeText("No sources captured yet.");
        return runtimeText(
          sources
            .map(
              (source) =>
                `• [${source._id}] ${source.title} — ${source.sourceType}, ${source.sensitivity}, ${source.status}${source.summary ? `\n  ${source.summary}` : ""}`,
            )
            .join("\n"),
        );
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "read_source",
      "Read one captured Lumi source and its content chunks. Use only when the source is relevant to the user's request.",
      { sourceId: z.string() },
      async (args) => {
        const result = await readLumiSource(args.sourceId);
        if (!result) return runtimeText("Source not found.", false);
        return runtimeText(
          `Source: ${result.source.title}\nSensitivity: ${result.source.sensitivity}\nSummary: ${result.source.summary ?? "(none)"}\n\n${result.chunks.map((chunk) => chunk.content).join("\n\n")}`,
        );
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "propose_work_item_from_source",
      "Create an evidence-linked proposal from a captured source. This never creates accepted business state directly; it appears in Review for a human decision.",
      {
        sourceId: z.string(),
        projectId: z.string().optional(),
        kind: workItemKind,
        title: z.string().min(1),
        detail: z.string().optional(),
        priority: priority.optional().default("medium"),
        ownerName: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
        quote: z.string().optional().describe("Short supporting excerpt from the source."),
      },
      async (args) => {
        const id = await proposeLumiWorkItem(args);
        return runtimeText(`Created evidence-linked proposal [${id}] for human review.`);
      },
    ),
  ];
}
