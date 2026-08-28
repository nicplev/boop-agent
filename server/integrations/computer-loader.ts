import { createComputerMcp, createComputerTools } from "../computer/tools.js";
import { getComputerSettings } from "../computer/security.js";
import { registerIntegration } from "./registry.js";

export function registerComputerIntegration(): void {
  registerIntegration({
    name: "computer",
    description:
      "Paired, time-limited local Mac screen and input control. Supports screenshots, visible apps, app launch/focus, clicking, text entry, and non-submitting keyboard shortcuts. Protected apps and dangerous submission keys are blocked.",
    isEnabled: async () => {
      if (process.platform !== "darwin") return false;
      const settings = await getComputerSettings();
      return settings.enabled && settings.paired;
    },
    createServer: async (ctx) => createComputerMcp(ctx.conversationId),
    createTools: async (ctx) => createComputerTools(ctx.conversationId),
  });
  console.log("[computer] registered paired Mac computer integration");
}
