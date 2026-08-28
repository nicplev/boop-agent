import { z } from "zod";
import { createClaudeMcpServer } from "../runtimes/claude.js";
import { defineRuntimeTool } from "../runtimes/tool.js";
import { runtimeImage, runtimeText, type RuntimeTool } from "../runtimes/types.js";
import {
  captureMacScreenshot,
  clickMacScreen,
  focusMacApp,
  listVisibleMacApps,
  macComputerStatus,
  openMacApp,
  pressMacKey,
  typeMacText,
} from "./macos.js";
import {
  assertAuthorizedComputerConversation,
  getComputerSession,
  getComputerSettings,
  requireComputerSession,
  startComputerSession,
  stopComputerSession,
  type ComputerSessionMode,
} from "./security.js";

// `computer` is reserved by the OpenAI Responses API for its built-in
// computer-use tool. Keep the user-facing integration name as `computer`, but
// give Lumi's dynamic tools their own namespace so Codex can register them.
export const COMPUTER_TOOL_NAMESPACE = "lumi-computer";

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return runtimeText(`[computer error] ${message}`, false);
}

async function authorized<T>(
  conversationId: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  await assertAuthorizedComputerConversation(conversationId);
  return await operation();
}

async function active<T>(
  conversationId: string | undefined,
  mode: ComputerSessionMode,
  operation: () => Promise<T>,
): Promise<T> {
  await assertAuthorizedComputerConversation(conversationId);
  requireComputerSession(conversationId, mode);
  return await operation();
}

function sessionSummary(session: ReturnType<typeof getComputerSession>): string {
  if (!session) return "inactive";
  const remainingMinutes = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 60_000));
  return `${session.mode} mode, ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"} remaining`;
}

export function createComputerTools(conversationId?: string): RuntimeTool[] {
  return [
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_status",
      "Check whether this conversation is paired for Mac control, whether computer mode is active, and whether macOS Accessibility permission is available.",
      {},
      async () => {
        try {
          return await authorized(conversationId, async () => {
            const [settings, status] = await Promise.all([
              getComputerSettings(),
              macComputerStatus(),
            ]);
            return runtimeText(
              [
                `Computer integration: ${settings.enabled ? "enabled" : "disabled"}`,
                `Paired controller: ${settings.pairedLabel || "not paired"}`,
                `Session: ${sessionSummary(getComputerSession(conversationId))}`,
                `Accessibility: ${status.accessibilityEnabled ? "ready" : "permission needed"}`,
                `Frontmost app: ${status.blockedFrontmostApp ? "protected app" : status.frontmostApp}`,
              ].join("\n"),
            );
          });
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_start_session",
      `Start a short-lived Mac session for this paired conversation. Use "observe" for screenshots/app lists. Use "control" only when the user explicitly asks to operate their Mac. Never infer control permission from an unrelated request. Sessions automatically expire after at most 30 minutes.`,
      {
        mode: z.enum(["observe", "control"]),
        durationMinutes: z.number().int().min(5).max(30).default(15),
      },
      async ({ mode, durationMinutes }) => {
        try {
          return await authorized(conversationId, async () => {
            const settings = await getComputerSettings();
            if (!settings.enabled) {
              throw new Error("Remote Mac control is disabled in Lumi Settings.");
            }
            const session = startComputerSession(conversationId, mode, durationMinutes);
            return runtimeText(
              `${mode === "control" ? "Control" : "Observe"} mode started. It expires at ${new Date(session.expiresAt).toLocaleTimeString()}. Protected apps and Return/Enter remain blocked.`,
            );
          });
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_stop_session",
      "Immediately stop computer mode for this conversation.",
      {},
      async () => {
        try {
          return await authorized(conversationId, async () =>
            runtimeText(
              stopComputerSession(conversationId)
                ? "Computer mode stopped."
                : "Computer mode was already inactive.",
            ),
          );
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_snapshot",
      "Capture the current Mac screen for visual reasoning. Requires an active observe or control session. Refuses protected apps such as password managers, Terminal, Keychain Access, and System Settings.",
      {},
      async () => {
        try {
          return await active(conversationId, "observe", async () => {
            const screenshot = await captureMacScreenshot();
            return runtimeImage(`Current Mac screen. Frontmost app: ${screenshot.frontmostApp}.`, {
              data: screenshot.data,
              mediaType: screenshot.mediaType,
            });
          });
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_list_apps",
      "List visible applications currently running on the Mac. Protected applications are omitted.",
      {},
      async () => {
        try {
          return await active(conversationId, "observe", async () => {
            const apps = await listVisibleMacApps();
            return runtimeText(apps.length ? apps.join("\n") : "No visible applications found.");
          });
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_open_app",
      "Open a named Mac application. Requires active control mode. Protected apps, shells, password managers, and security settings are blocked.",
      { appName: z.string().min(1).max(120) },
      async ({ appName }) => {
        try {
          return await active(conversationId, "control", async () => {
            await openMacApp(appName);
            return runtimeText(`Opened ${appName}.`);
          });
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_focus_app",
      "Bring a running Mac application to the front. Requires active control mode. Protected apps are blocked.",
      { appName: z.string().min(1).max(120) },
      async ({ appName }) => {
        try {
          return await active(conversationId, "control", async () => {
            await focusMacApp(appName);
            return runtimeText(`Focused ${appName}.`);
          });
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_click",
      "Click screen coordinates after inspecting a fresh computer_snapshot. Requires active control mode. Never click Send, Buy, Delete, permission, password, security, or legal-confirmation controls.",
      {
        x: z.number().int().min(0).max(16_384),
        y: z.number().int().min(0).max(16_384),
        target: z.string().min(1).max(200).describe("Plain-language element being clicked for the audit log."),
      },
      async ({ x, y, target }) => {
        try {
          return await active(conversationId, "control", async () => {
            await clickMacScreen(x, y);
            return runtimeText(`Clicked ${target} at (${x}, ${y}).`);
          });
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_type_text",
      "Type non-sensitive text into the focused Mac control. Requires active control mode. Never type passwords, authentication codes, payment information, private keys, government identifiers, or text that sends/accepts/commits an external action. Newlines are blocked.",
      {
        text: z.string().min(1).max(4_000),
        purpose: z.string().min(1).max(200).describe("Non-sensitive reason for typing; do not repeat the text."),
      },
      async ({ text, purpose }) => {
        try {
          return await active(conversationId, "control", async () => {
            await typeMacText(text);
            return runtimeText(`Typed ${text.length} characters for: ${purpose}.`);
          });
        } catch (error) {
          return safeError(error);
        }
      },
    ),
    defineRuntimeTool(
      COMPUTER_TOOL_NAMESPACE,
      "computer_press_key",
      "Press a non-submitting keyboard key on the Mac. Requires active control mode. Return/Enter is always blocked to prevent accidental sends, purchases, or confirmations.",
      {
        key: z.string().min(1).max(30),
        modifiers: z.array(z.enum(["command", "control", "option", "shift"])).max(4).default([]),
      },
      async ({ key, modifiers }) => {
        try {
          return await active(conversationId, "control", async () => {
            await pressMacKey(key, modifiers);
            return runtimeText(`Pressed ${[...modifiers, key].join("+")}.`);
          });
        } catch (error) {
          return safeError(error);
        }
      },
    ),
  ];
}

export function createComputerMcp(conversationId?: string) {
  return createClaudeMcpServer(COMPUTER_TOOL_NAMESPACE, createComputerTools(conversationId));
}
