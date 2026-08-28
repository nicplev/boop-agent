import { Router } from "express";
import type { FunctionReference } from "convex/server";
import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";

const queryOperations = {
  "agents:listForDashboard": api.agents.listForDashboard,
  "agents:getForDashboard": api.agents.getForDashboard,
  "agents:getLogsForDashboard": api.agents.getLogsForDashboard,
  "automations:listForDashboard": api.automations.listForDashboard,
  "automations:getForDashboard": api.automations.getForDashboard,
  "automations:recentRunsForDashboard": api.automations.recentRunsForDashboard,
  "consolidation:listRunsForDashboard": api.consolidation.listRunsForDashboard,
  "dashboard:metrics": api.dashboard.metrics,
  "demo:status": api.demo.status,
  "memoryEvents:recentForDashboard": api.memoryEvents.recentForDashboard,
  "memoryRecords:countsByTier": api.memoryRecords.countsByTier,
  "memoryRecords:listForDashboard": api.memoryRecords.listForDashboard,
  "messages:getStorageUrl": api.messages.getStorageUrl,
  "settings:get": api.settings.get,
} satisfies Record<string, FunctionReference<"query">>;

const mutationOperations = {
  "automations:remove": api.automations.remove,
  "automations:setEnabled": api.automations.setEnabled,
  "demo:setMode": api.demo.setMode,
  "memoryRecords:remove": api.memoryRecords.remove,
  "settings:clear": api.settings.clear,
  "settings:set": api.settings.set,
} satisfies Record<string, FunctionReference<"mutation">>;

const requestInput = z
  .object({
    operation: z.string().min(1).max(160),
    args: z.record(z.unknown()).default({}),
  })
  .strict();

function safeArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (Object.hasOwn(args, "workspaceSecret")) {
    throw new Error("Reserved request field");
  }
  return args;
}

export function createLegacyDataRouter() {
  const router = Router();

  router.post("/query", async (request, response) => {
    try {
      const input = requestInput.parse(request.body);
      const reference = queryOperations[input.operation as keyof typeof queryOperations];
      if (!reference) {
        response.status(400).json({ error: "Unsupported data query" });
        return;
      }
      const value = await convex.query(
        reference as FunctionReference<"query">,
        safeArgs(input.args),
      );
      response.setHeader("Cache-Control", "no-store");
      response.json({ value });
    } catch (error) {
      console.error("[legacy-data] query failed", error);
      response.status(400).json({ error: "Legacy data query failed" });
    }
  });

  router.post("/mutation", async (request, response) => {
    try {
      const input = requestInput.parse(request.body);
      const reference = mutationOperations[input.operation as keyof typeof mutationOperations];
      if (!reference) {
        response.status(400).json({ error: "Unsupported data mutation" });
        return;
      }
      const value = await convex.mutation(
        reference as FunctionReference<"mutation">,
        safeArgs(input.args),
      );
      response.setHeader("Cache-Control", "no-store");
      response.json({ value });
    } catch (error) {
      console.error("[legacy-data] mutation failed", error);
      response.status(400).json({ error: "Legacy data mutation failed" });
    }
  });

  return router;
}
