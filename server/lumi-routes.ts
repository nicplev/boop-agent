import { Router, type Response } from "express";
import { z, ZodError } from "zod";
import {
  createLumiProject,
  createLumiWorkItem,
  createManualLumiSource,
  createWebLumiSource,
  decideLumiProposal,
  getLumiSnapshot,
  reviewLumiWorkItem,
  setLumiWorkItemStatus,
  updateLumiProject,
} from "./lumi-workspace-client.js";
import { importPublicWebSource, WebSourceImportError } from "./web-source-import.js";

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
const sensitivity = z.enum(["internal", "confidential", "restricted"]);
const id = z.string().min(10).max(128);

const createProjectInput = z.object({
  name: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(2_000).optional(),
  status: projectStatus.optional(),
  priority: priority.optional(),
  targetAt: z.number().finite().optional(),
});

const updateProjectInput = createProjectInput.partial().extend({ projectId: id });

const createWorkItemInput = z.object({
  projectId: id.optional(),
  kind: workItemKind,
  title: z.string().trim().min(1).max(240),
  detail: z.string().trim().max(5_000).optional(),
  status: workItemStatus.optional(),
  priority: priority.optional(),
  ownerName: z.string().trim().max(160).optional(),
  waitingOnName: z.string().trim().max(160).optional(),
  dueAt: z.number().finite().optional(),
  confidence: z.number().min(0).max(1).optional(),
  needsReview: z.boolean().optional(),
  sourceCount: z.number().int().min(0).max(10_000).optional(),
});

const manualSourceInput = z.object({
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().max(1_000).optional(),
  content: z.string().trim().min(1).max(50_000),
  sensitivity: sensitivity.optional(),
  occurredAt: z.number().finite().optional(),
});

const importUrlInput = z.object({
  url: z.string().trim().min(1).max(2_048),
  sensitivity: sensitivity.optional(),
});

const importAttempts: number[] = [];

function enforceImportRateLimit(): void {
  const now = Date.now();
  const windowStart = now - 5 * 60_000;
  while (importAttempts[0] !== undefined && importAttempts[0] < windowStart) {
    importAttempts.shift();
  }
  if (importAttempts.length >= 5) {
    throw new WebSourceImportError("Import limit reached. Try again in a few minutes.");
  }
  importAttempts.push(now);
}
function sendError(response: Response, error: unknown): void {
  if (error instanceof ZodError) {
    response.status(400).json({ error: error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  if (error instanceof WebSourceImportError) {
    response.status(400).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Lumi workspace request failed";
  const status = message.includes("not found") ? 404 : message.includes("not configured") ? 503 : 500;
  response.status(status).json({ error: message });
}

export function createLumiRouter() {
  const router = Router();

  router.get("/snapshot", async (_request, response) => {
    try {
      response.json(await getLumiSnapshot());
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/projects", async (request, response) => {
    try {
      const input = createProjectInput.parse(request.body);
      const projectId = await createLumiProject(input);
      response.status(201).json({ id: String(projectId) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.patch("/projects/:projectId", async (request, response) => {
    try {
      const input = updateProjectInput.parse({ ...request.body, projectId: request.params.projectId });
      const projectId = await updateLumiProject(input);
      response.json({ id: String(projectId) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/work-items", async (request, response) => {
    try {
      const input = createWorkItemInput.parse(request.body);
      const workItemId = await createLumiWorkItem(input);
      response.status(201).json({ id: String(workItemId) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/work-items/:workItemId/status", async (request, response) => {
    try {
      const input = z
        .object({ workItemId: id, status: workItemStatus })
        .parse({ ...request.body, workItemId: request.params.workItemId });
      const workItemId = await setLumiWorkItemStatus(input);
      response.json({ id: String(workItemId) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/work-items/:workItemId/review", async (request, response) => {
    try {
      const input = z
        .object({ workItemId: id, decision: z.enum(["accept", "reject"]) })
        .parse({ ...request.body, workItemId: request.params.workItemId });
      const workItemId = await reviewLumiWorkItem(input);
      response.json({ id: String(workItemId) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/sources/manual", async (request, response) => {
    try {
      const input = manualSourceInput.parse(request.body);
      const sourceId = await createManualLumiSource(input);
      response.status(201).json({ id: String(sourceId) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/sources/import-url", async (request, response) => {
    try {
      const input = importUrlInput.parse(request.body);
      enforceImportRateLimit();
      const imported = await importPublicWebSource(input.url);
      const sourceId = await createWebLumiSource({
        ...imported,
        sensitivity: input.sensitivity,
      });
      response.status(201).json({ id: String(sourceId), title: imported.title });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/proposals/:proposalId/decision", async (request, response) => {
    try {
      const input = z
        .object({ proposalId: id, decision: z.enum(["accept", "reject"]) })
        .parse({ ...request.body, proposalId: request.params.proposalId });
      const result = await decideLumiProposal(input);
      response.json(result);
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}
