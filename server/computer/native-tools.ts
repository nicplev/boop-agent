import { z } from "zod";
import { createClaudeMcpServer } from "../runtimes/claude.js";
import { defineRuntimeTool } from "../runtimes/tool.js";
import { runtimeText, type RuntimeTool } from "../runtimes/types.js";
import {
  nativeComputerDiagnostics,
  runNativeComputerTask,
  stopNativeComputerRun,
} from "./native.js";
import {
  assertAuthorizedComputerConversation,
  getComputerSettings,
} from "./security.js";
import { macHostPowerStatus } from "./power.js";
import { COMPUTER_TOOL_NAMESPACE } from "./tools.js";

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return runtimeText(`[computer error] ${message}`, false);
}

export function createNativeComputerTools(conversationId?: string): RuntimeTool[] {
  return [
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_status",
      "Check the paired native OpenAI Computer Use integration, locked-use installation, current Mac task, and always-on host state.",
      {},
      async () => {
        try {
          await assertAuthorizedComputerConversation(conversationId);
          const [settings, native, power] = await Promise.all([
            getComputerSettings(),
            Promise.resolve(nativeComputerDiagnostics()),
            macHostPowerStatus(),
          ]);
          return runtimeText(
            [
              `Native Computer Use: ${native.ready ? "ready" : "setup needed"}`,
              `Locked use component: ${native.lockedUseInstalled ? "installed" : "not installed"}`,
              `Always-on host: ${settings.alwaysOnHost ? (power.alwaysOnReady ? "active" : "enabled but not ready") : "off"}`,
              `Current task: ${native.activeRun ? `${native.activeRun.elapsedSeconds}s elapsed` : "inactive"}`,
            ].join("\n"),
          );
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_run_native_task",
      "Hand one explicit, scoped Mac GUI request from the paired user to the official OpenAI Computer Use plugin. Call exactly once with the complete requested task, then relay its verified result. Native Computer Use enforces app approvals and action-time confirmations. It can use Locked Use when configured, but it cannot run while the Mac is truly asleep or offline.",
      {
        task: z
          .string()
          .min(1)
          .max(16_000)
          .describe("The user's exact scoped Mac GUI task, preserving relevant app and outcome details."),
      },
      async ({ task }) => {
        try {
          return runtimeText(await runNativeComputerTask(conversationId, task));
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_stop_native_task",
      "Emergency-stop the currently running native Computer Use task.",
      {},
      async () =>
        runtimeText(
          stopNativeComputerRun()
            ? "Native Computer Use stopped."
            : "No native Computer Use task is running.",
        ),
    ),
  ];
}

export function createNativeComputerMcp(conversationId?: string) {
  return createClaudeMcpServer(
    COMPUTER_TOOL_NAMESPACE,
    createNativeComputerTools(conversationId),
  );
}
