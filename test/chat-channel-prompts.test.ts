import { describe, expect, it } from "vitest";
import { buildExecutionSystemPrompt } from "../server/execution-agent.js";
import { buildInteractionSystemPrompt } from "../server/interaction-agent.js";

describe("desktop chat channel prompts", () => {
  it("uses rich desktop formatting and skips SMS acknowledgements", () => {
    const prompt = buildInteractionSystemPrompt("desktop:test-thread", [
      "gmail",
      "lumi-codebase",
    ]);

    expect(prompt).toContain("Native desktop chat");
    expect(prompt).toContain("do not apply SMS length limits");
    expect(prompt).toContain("Do NOT call send_ack");
    expect(prompt).toContain("gmail, lumi-codebase");
    expect(prompt).not.toContain("BEFORE every spawn_agent call");
    expect(prompt).not.toContain("{{CHANNEL_FORMAT}}");
  });

  it("preserves the concise acknowledgement flow for iMessage", () => {
    const prompt = buildInteractionSystemPrompt("sms:test-thread", ["gmail"]);

    expect(prompt).toContain("Acknowledgment rule (iMessage UX)");
    expect(prompt).toContain("BEFORE every spawn_agent call");
    expect(prompt).toContain("Plain iMessage-friendly text");
  });

  it("gives execution agents the correct channel style", () => {
    const desktop = buildExecutionSystemPrompt("desktop:test-thread");
    const sms = buildExecutionSystemPrompt("sms:test-thread");

    expect(desktop).toContain("native desktop chat with clear Markdown");
    expect(desktop).toContain("tables");
    expect(desktop).not.toContain("Under 500 words");
    expect(sms).toContain("Optimize for iMessage delivery");
  });
});
