import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function source(relativePath: string): string {
  return readFileSync(`${projectRoot}${relativePath}`, "utf8");
}

const securedLegacyModules = [
  "convex/agents.ts",
  "convex/automations.ts",
  "convex/consolidation.ts",
  "convex/conversations.ts",
  "convex/dashboard.ts",
  "convex/demo.ts",
  "convex/drafts.ts",
  "convex/memoryEvents.ts",
  "convex/memoryRecords.ts",
  "convex/messages.ts",
  "convex/sendblueDedup.ts",
  "convex/settings.ts",
  "convex/usageRecords.ts",
];

const dashboardDataConsumers = [
  "debug/src/App.tsx",
  "debug/src/components/AgentsPanel.tsx",
  "debug/src/components/AutomationsPanel.tsx",
  "debug/src/components/BrowserSection.tsx",
  "debug/src/components/ComposioSection.tsx",
  "debug/src/components/ConsolidationPanel.tsx",
  "debug/src/components/DashboardPanel.tsx",
  "debug/src/components/EventsPanel.tsx",
  "debug/src/components/MemoryPanel.tsx",
  "debug/src/components/SettingsPanel.tsx",
];

describe("legacy Convex data boundary", () => {
  it("routes every legacy public data module through the shared secret guard", () => {
    for (const file of securedLegacyModules) {
      expect(source(file), file).toContain('from "./securedFunctions"');
    }
  });

  it("removes the credential before a protected handler can persist its args", () => {
    const securedFunctions = source("convex/securedFunctions.ts");
    expect(securedFunctions).toContain("requireLumiWorkspaceSecret(args.workspaceSecret)");
    expect(securedFunctions).toContain("delete authorizedArgs.workspaceSecret");
  });

  it(
    "keeps legacy dashboard access behind the local server bridge",
    () => {
      for (const file of dashboardDataConsumers) {
        const contents = source(file);
        expect(contents, file).not.toContain('from "convex/react"');
        expect(contents, file).toContain("localConvex.js");
      }
      expect(source("debug/src/main.tsx")).not.toContain("ConvexProvider");
      expect(source("server/legacy-data-routes.ts")).toContain("queryOperations");
      expect(source("server/legacy-data-routes.ts")).toContain("mutationOperations");
    },
    60_000,
  );
});
