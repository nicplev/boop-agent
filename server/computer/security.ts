import { createHmac, timingSafeEqual } from "node:crypto";
import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";

const ENABLED_KEY = "computer_enabled";
const AUTHORIZED_SENDER_HASH_KEY = "computer_authorized_sender_hash";
const AUTHORIZED_SENDER_LABEL_KEY = "computer_authorized_sender_label";
const MIN_SESSION_MINUTES = 5;
const MAX_SESSION_MINUTES = 30;

export type ComputerSessionMode = "observe" | "control";

export interface ComputerSettings {
  enabled: boolean;
  paired: boolean;
  pairedLabel: string;
}

export interface ComputerSession {
  principal: string;
  mode: ComputerSessionMode;
  startedAt: number;
  expiresAt: number;
}

const sessions = new Map<string, ComputerSession>();

function workspaceSecret(): string {
  const value = process.env.LUMI_WORKSPACE_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error("Lumi workspace security is not configured.");
  }
  return value;
}

export function normalizePhoneNumber(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (!compact) return null;
  const normalized = compact.startsWith("+") ? compact : `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function maskPhoneNumber(value: string): string {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return "paired phone";
  return `••••${normalized.slice(-4)}`;
}

export function senderFromConversationId(conversationId: string | undefined): string | null {
  if (!conversationId?.startsWith("sms:")) return null;
  return normalizePhoneNumber(conversationId.slice("sms:".length));
}

export function senderFingerprint(sender: string): string {
  const normalized = normalizePhoneNumber(sender);
  if (!normalized) throw new Error("Enter a valid phone number including country code.");
  return createHmac("sha256", workspaceSecret())
    .update(`lumi-computer-sender:${normalized}`)
    .digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

async function setting(key: string): Promise<string | null> {
  return await convex.query(api.settings.get, { key });
}

export async function getComputerSettings(): Promise<ComputerSettings> {
  const [enabled, senderHash, senderLabel] = await Promise.all([
    setting(ENABLED_KEY),
    setting(AUTHORIZED_SENDER_HASH_KEY),
    setting(AUTHORIZED_SENDER_LABEL_KEY),
  ]);
  return {
    enabled: enabled === "true",
    paired: Boolean(senderHash),
    pairedLabel: senderLabel ?? "",
  };
}

export async function setComputerEnabled(enabled: boolean): Promise<void> {
  await convex.mutation(api.settings.set, {
    key: ENABLED_KEY,
    value: enabled ? "true" : "false",
  });
  if (!enabled) stopAllComputerSessions();
}

export async function pairComputerSender(phoneNumber: string): Promise<string> {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) throw new Error("Enter a valid phone number including country code.");
  const label = maskPhoneNumber(normalized);
  await convex.mutation(api.settings.set, {
    key: AUTHORIZED_SENDER_HASH_KEY,
    value: senderFingerprint(normalized),
  });
  await convex.mutation(api.settings.set, {
    key: AUTHORIZED_SENDER_LABEL_KEY,
    value: label,
  });
  stopAllComputerSessions();
  return label;
}

export async function unpairComputerSender(): Promise<void> {
  await setComputerEnabled(false);
  await convex.mutation(api.settings.clear, { key: AUTHORIZED_SENDER_HASH_KEY });
  await convex.mutation(api.settings.clear, { key: AUTHORIZED_SENDER_LABEL_KEY });
  stopAllComputerSessions();
}

export function isLocalConversation(conversationId: string | undefined): boolean {
  return !conversationId?.startsWith("sms:");
}

export async function isAuthorizedComputerConversation(
  conversationId: string | undefined,
): Promise<boolean> {
  if (isLocalConversation(conversationId)) return true;
  const sender = senderFromConversationId(conversationId);
  if (!sender) return false;
  const expected = await setting(AUTHORIZED_SENDER_HASH_KEY);
  if (!expected) return false;
  return constantTimeEqual(senderFingerprint(sender), expected);
}

export async function assertAuthorizedComputerConversation(
  conversationId: string | undefined,
): Promise<void> {
  if (!(await isAuthorizedComputerConversation(conversationId))) {
    throw new Error(
      "This phone is not paired for local computer control. Pair it from Lumi Settings on the Mac.",
    );
  }
}

export function principalForConversation(conversationId: string | undefined): string {
  const sender = senderFromConversationId(conversationId);
  if (sender) return `sms:${senderFingerprint(sender)}`;
  return `local:${conversationId?.trim() || "dashboard"}`;
}

function pruneExpiredSessions(now = Date.now()): void {
  for (const [principal, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(principal);
  }
}

export function startComputerSession(
  conversationId: string | undefined,
  mode: ComputerSessionMode,
  durationMinutes: number,
  now = Date.now(),
): ComputerSession {
  const duration = Math.max(
    MIN_SESSION_MINUTES,
    Math.min(MAX_SESSION_MINUTES, Math.floor(durationMinutes)),
  );
  const principal = principalForConversation(conversationId);
  const session = {
    principal,
    mode,
    startedAt: now,
    expiresAt: now + duration * 60_000,
  };
  sessions.set(principal, session);
  return session;
}

export function getComputerSession(
  conversationId: string | undefined,
  now = Date.now(),
): ComputerSession | null {
  pruneExpiredSessions(now);
  return sessions.get(principalForConversation(conversationId)) ?? null;
}

export function requireComputerSession(
  conversationId: string | undefined,
  requiredMode: ComputerSessionMode,
  now = Date.now(),
): ComputerSession {
  const session = getComputerSession(conversationId, now);
  if (!session) {
    throw new Error(
      "Computer mode is not active. Ask Lumi to start an observe or control session first.",
    );
  }
  if (requiredMode === "control" && session.mode !== "control") {
    throw new Error("This is an observe-only session. Start control mode before changing the Mac.");
  }
  return session;
}

export function stopComputerSession(conversationId: string | undefined): boolean {
  return sessions.delete(principalForConversation(conversationId));
}

export function stopAllComputerSessions(): number {
  const count = sessions.size;
  sessions.clear();
  return count;
}

export function activeComputerSessions(now = Date.now()): ComputerSession[] {
  pruneExpiredSessions(now);
  return [...sessions.values()];
}

export const computerSettingKeys = {
  enabled: ENABLED_KEY,
  authorizedSenderHash: AUTHORIZED_SENDER_HASH_KEY,
  authorizedSenderLabel: AUTHORIZED_SENDER_LABEL_KEY,
} as const;
