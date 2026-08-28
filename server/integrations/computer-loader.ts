import {
  createNativeComputerMcp,
  createNativeComputerTools,
} from "../computer/native-tools.js";
import { getComputerSettings } from "../computer/security.js";
import { registerIntegration } from "./registry.js";

export function registerComputerIntegration(): void {
  registerIntegration({
    name: "computer",
    description:
      "Paired native OpenAI Computer Use handoff for scoped Mac GUI tasks, with app approvals, action-time confirmations, Locked Use support, emergency stop, and an optional always-on host mode.",
    isEnabled: async () => {
      if (process.platform !== "darwin") return false;
      const settings = await getComputerSettings();
      return settings.enabled && settings.paired;
    },
    createServer: async (ctx) => createNativeComputerMcp(ctx.conversationId),
    createTools: async (ctx) => createNativeComputerTools(ctx.conversationId),
  });
  console.log("[computer] registered paired native Computer Use integration");
}
