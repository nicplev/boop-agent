export type LumiProjectStatus = "planned" | "active" | "paused" | "completed" | "archived";
export type LumiPriority = "low" | "medium" | "high" | "critical";
export type LumiWorkItemKind =
  | "decision"
  | "commitment"
  | "task"
  | "idea"
  | "waiting_on"
  | "blocker"
  | "risk"
  | "question"
  | "opportunity";
export type LumiWorkItemStatus =
  | "proposed"
  | "open"
  | "in_progress"
  | "completed"
  | "resolved"
  | "rejected"
  | "superseded";
export type LumiSensitivity = "internal" | "confidential" | "restricted";

export interface LumiProject {
  _id: string;
  name: string;
  summary?: string;
  status: LumiProjectStatus;
  priority: LumiPriority;
  targetAt?: number;
  createdAt: number;
  updatedAt: number;
}
export interface LumiWorkItem {
  _id: string;
  projectId?: string;
  kind: LumiWorkItemKind;
  title: string;
  detail?: string;
  status: LumiWorkItemStatus;
  priority: LumiPriority;
  ownerName?: string;
  waitingOnName?: string;
  dueAt?: number;
  confidence?: number;
  needsReview: boolean;
  sourceCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface LumiSource {
  _id: string;
  sourceType: "manual" | "plaud" | "gmail" | "drive" | "github" | "conversation" | "web";
  title: string;
  summary?: string;
  uri?: string;
  sensitivity: LumiSensitivity;
  status: "pending" | "indexed" | "failed";
  occurredAt?: number;
  importedAt: number;
}

export interface LumiProposal {
  _id: string;
  proposalType: "create_project" | "update_project" | "create_work_item" | "update_work_item";
  title: string;
  summary: string;
  status: "pending" | "accepted" | "rejected";
  sourceId?: string;
  targetId?: string;
  confidence?: number;
  createdAt: number;
  decidedAt?: number;
}

export interface LumiSnapshot {
  projects: LumiProject[];
  workItems: LumiWorkItem[];
  sources: LumiSource[];
  proposals: LumiProposal[];
}
