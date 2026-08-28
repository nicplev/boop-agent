import { getCodebaseConfig } from "../codebase/local.js";
import { createCodebaseMcp, createCodebaseTools } from "../codebase/tools.js";
import { registerIntegration } from "./registry.js";

export function registerCodebaseIntegration(): void {
  registerIntegration({
    name: "lumi-codebase",
    description:
      "Read-only live access to the local Lumi Reading Diary repository, its current GitHub pull requests, commit context, code search, source-file reading, and configured design/marketing assets.",
    isEnabled: async () => getCodebaseConfig() !== null,
    createServer: async () => createCodebaseMcp(),
    createTools: async () => createCodebaseTools(),
  });
  console.log("[codebase] registered Lumi repository and asset integration");
}
