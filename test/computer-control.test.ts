import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redactToolInputForLog } from "../server/execution-agent.js";
import {
  isBlockedMacApp,
  normalizeKeyName,
  normalizeModifiers,
  validateAppName,
  validateTypedText,
} from "../server/computer/macos.js";
import {
  getComputerSession,
  maskPhoneNumber,
  normalizePhoneNumber,
  requireComputerSession,
  senderFingerprint,
  senderFromConversationId,
  startComputerSession,
  stopAllComputerSessions,
} from "../server/computer/security.js";

describe("paired Mac computer control", () => {
  const previousSecret = process.env.LUMI_WORKSPACE_SECRET;

  beforeEach(() => {
    process.env.LUMI_WORKSPACE_SECRET = "test-workspace-secret-that-is-at-least-32-characters";
    stopAllComputerSessions();
  });

  afterEach(() => {
    stopAllComputerSessions();
    if (previousSecret === undefined) delete process.env.LUMI_WORKSPACE_SECRET;
    else process.env.LUMI_WORKSPACE_SECRET = previousSecret;
  });

  it("normalizes and masks paired phone numbers without retaining the full value", () => {
    expect(normalizePhoneNumber("+61 412 345 678")).toBe("+61412345678");
    expect(normalizePhoneNumber("16452437121")).toBe("+16452437121");
    expect(normalizePhoneNumber("not-a-phone")).toBeNull();
    expect(maskPhoneNumber("+61412345678")).toBe("••••5678");
    expect(senderFromConversationId("sms:+61 412 345 678")).toBe("+61412345678");
    expect(senderFromConversationId("local:dashboard")).toBeNull();
  });

  it("creates a stable keyed sender fingerprint without exposing the number", () => {
    const first = senderFingerprint("+61412345678");
    const second = senderFingerprint("+61 412 345 678");
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(first).not.toContain("412345678");
  });

  it("clamps sessions, expires them, and separates observe from control", () => {
    const now = 1_000_000;
    const conversationId = "sms:+61412345678";
    const session = startComputerSession(conversationId, "observe", 1, now);
    expect(session.expiresAt).toBe(now + 5 * 60_000);
    expect(getComputerSession(conversationId, now + 1)).toMatchObject({ mode: "observe" });
    expect(() => requireComputerSession(conversationId, "control", now + 1)).toThrow(
      /observe-only/,
    );
    expect(getComputerSession(conversationId, session.expiresAt)).toBeNull();
  });

  it("blocks sensitive apps, submitting keys, multiline typing, and invalid modifiers", () => {
    expect(isBlockedMacApp("Terminal")).toBe(true);
    expect(isBlockedMacApp("1Password.app")).toBe(true);
    expect(isBlockedMacApp("Xcode")).toBe(false);
    expect(() => validateAppName("bad\napp")).toThrow();
    expect(() => validateTypedText("send this\nnow")).toThrow(/newline/);
    expect(() => normalizeKeyName("Return")).toThrow(/protected/);
    expect(normalizeKeyName("Page Down")).toBe("pagedown");
    expect(normalizeModifiers(["command", "shift", "command"])).toEqual([
      "command",
      "shift",
    ]);
    expect(() => normalizeModifiers(["hyper"])).toThrow(/Unsupported modifier/);
  });

  it("redacts desktop text input before agent log persistence", () => {
    expect(
      redactToolInputForLog("mcp__computer__computer_type_text", {
        text: "private draft text",
        purpose: "fill a draft field",
      }),
    ).toEqual({
      text: "[redacted]",
      purpose: "fill a draft field",
    });
  });
});
