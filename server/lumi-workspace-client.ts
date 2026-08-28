import "./env-setup.js";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { convex } from "./convex-client.js";
import type {
  LumiPriority,
  LumiProjectStatus,
  LumiSensitivity,
  LumiSnapshot,
  LumiWorkItemKind,
  LumiWorkItemStatus,
} from "./lumi-types.js";

function projectId(value: string): Id<"projects"> {
  return value as Id<"projects">;
}

function workItemId(value: string): Id<"workItems"> {
  return value as Id<"workItems">;
}

function sourceId(value: string): Id<"sources"> {
  return value as Id<"sources">;
}

function proposalId(value: string): Id<"proposals"> {
  return value as Id<"proposals">;
}

export async function getLumiSnapshot(): Promise<LumiSnapshot> {
  const [projects, workItems, sources, proposals] = await Promise.all([
    convex.query(api.projects.listForDashboard, { limit: 200 }),
    convex.query(api.workItems.listForDashboard, { limit: 500 }),
    convex.query(api.sources.listForDashboard, { limit: 200 }),
    convex.query(api.proposals.listPending, { limit: 200 }),
  ]);

  return {
    projects: projects.map((project) => ({
      _id: String(project._id),
      name: project.name,
      summary: project.summary,
      status: project.status,
      priority: project.priority,
      targetAt: project.targetAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })),
    workItems: workItems.map((item) => ({
      _id: String(item._id),
      projectId: item.projectId ? String(item.projectId) : undefined,
      kind: item.kind,
      title: item.title,
      detail: item.detail,
      status: item.status,
      priority: item.priority,
      ownerName: item.ownerName,
      waitingOnName: item.waitingOnName,
      dueAt: item.dueAt,
      confidence: item.confidence,
      needsReview: item.needsReview,
      sourceCount: item.sourceCount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    sources: sources.map((source) => ({
      _id: String(source._id),
      sourceType: source.sourceType,
      title: source.title,
      summary: source.summary,
      uri: source.uri,
      sensitivity: source.sensitivity,
      status: source.status,
      occurredAt: source.occurredAt,
      importedAt: source.importedAt,
    })),
    proposals: proposals.map((proposal) => ({
      _id: String(proposal._id),
      proposalType: proposal.proposalType,
      title: proposal.title,
      summary: proposal.summary,
      status: proposal.status,
      sourceId: proposal.sourceId ? String(proposal.sourceId) : undefined,
      targetId: proposal.targetId,
      confidence: proposal.confidence,
      createdAt: proposal.createdAt,
      decidedAt: proposal.decidedAt,
    })),
  };
}

export async function listLumiProjects(args: {
  status?: LumiProjectStatus;
  limit?: number;
}) {
  return await convex.query(api.projects.listForDashboard, {
    ...args,
  });
}

export async function createLumiProject(args: {
  name: string;
  summary?: string;
  status?: LumiProjectStatus;
  priority?: LumiPriority;
  targetAt?: number;
}) {
  return await convex.mutation(api.projects.create, {
    ...args,
  });
}

export async function updateLumiProject(args: {
  projectId: string;
  name?: string;
  summary?: string;
  status?: LumiProjectStatus;
  priority?: LumiPriority;
  targetAt?: number | null;
}) {
  const { projectId: rawProjectId, ...changes } = args;
  return await convex.mutation(api.projects.update, {
    projectId: projectId(rawProjectId),
    ...changes,
  });
}

export async function listLumiWorkItems(args: {
  projectId?: string;
  kind?: LumiWorkItemKind;
  status?: LumiWorkItemStatus;
  needsReview?: boolean;
  limit?: number;
}) {
  const { projectId: rawProjectId, ...filters } = args;
  return await convex.query(api.workItems.listForDashboard, {
    ...filters,
    ...(rawProjectId ? { projectId: projectId(rawProjectId) } : {}),
  });
}

export async function createLumiWorkItem(args: {
  projectId?: string;
  kind: LumiWorkItemKind;
  title: string;
  detail?: string;
  status?: LumiWorkItemStatus;
  priority?: LumiPriority;
  ownerName?: string;
  waitingOnName?: string;
  dueAt?: number;
  confidence?: number;
  needsReview?: boolean;
  sourceCount?: number;
}) {
  const { projectId: rawProjectId, ...item } = args;
  return await convex.mutation(api.workItems.create, {
    ...item,
    ...(rawProjectId ? { projectId: projectId(rawProjectId) } : {}),
  });
}

export async function setLumiWorkItemStatus(args: {
  workItemId: string;
  status: LumiWorkItemStatus;
}) {
  return await convex.mutation(api.workItems.setStatus, {
    workItemId: workItemId(args.workItemId),
    status: args.status,
  });
}

export async function reviewLumiWorkItem(args: {
  workItemId: string;
  decision: "accept" | "reject";
}) {
  return await convex.mutation(api.workItems.review, {
    workItemId: workItemId(args.workItemId),
    decision: args.decision,
  });
}

export async function listLumiSources(args: { limit?: number }) {
  return await convex.query(api.sources.listForDashboard, {
    ...args,
  });
}

export async function readLumiSource(rawSourceId: string) {
  return await convex.query(api.sources.getWithChunks, {
    sourceId: sourceId(rawSourceId),
  });
}

export async function createManualLumiSource(args: {
  title: string;
  summary?: string;
  content: string;
  sensitivity?: LumiSensitivity;
  occurredAt?: number;
}) {
  return await convex.mutation(api.sources.createManual, {
    ...args,
  });
}

export async function createWebLumiSource(args: {
  title: string;
  summary?: string;
  content: string;
  uri: string;
  externalId: string;
  sensitivity?: LumiSensitivity;
  occurredAt?: number;
  metadata?: string;
}) {
  return await convex.mutation(api.sources.createWeb, {
    ...args,
  });
}

export async function proposeLumiWorkItem(args: {
  sourceId: string;
  projectId?: string;
  kind: LumiWorkItemKind;
  title: string;
  detail?: string;
  priority?: LumiPriority;
  ownerName?: string;
  confidence?: number;
  quote?: string;
}) {
  const { sourceId: rawSourceId, projectId: rawProjectId, ...proposal } = args;
  return await convex.mutation(api.proposals.proposeWorkItem, {
    sourceId: sourceId(rawSourceId),
    ...(rawProjectId ? { projectId: projectId(rawProjectId) } : {}),
    ...proposal,
  });
}

export async function decideLumiProposal(args: {
  proposalId: string;
  decision: "accept" | "reject";
}) {
  return await convex.mutation(api.proposals.decide, {
    proposalId: proposalId(args.proposalId),
    decision: args.decision,
  });
}
