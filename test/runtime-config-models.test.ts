import { describe, expect, it } from "vitest";
import {
  KNOWN_CODEX_MODELS,
  KNOWN_MODELS,
  resolveModelInput,
} from "../server/runtime-config.js";

describe("current runtime models", () => {
  it("accepts the current Claude 5 model IDs and friendly aliases", () => {
    expect(KNOWN_MODELS.has("claude-fable-5")).toBe(true);
    expect(resolveModelInput("Sonnet 5", "claude")).toBe("claude-sonnet-5");
    expect(resolveModelInput("Opus 5", "claude")).toBe("claude-opus-5");
  });

  it("accepts every GPT-5.6 tier exposed by the signed-in Codex catalog", () => {
    expect(KNOWN_CODEX_MODELS.has("gpt-5.6-sol")).toBe(true);
    expect(KNOWN_CODEX_MODELS.has("gpt-5.6-terra")).toBe(true);
    expect(KNOWN_CODEX_MODELS.has("gpt-5.6-luna")).toBe(true);
    expect(resolveModelInput("GPT 5.6", "codex")).toBe("gpt-5.6-sol");
    expect(resolveModelInput("Terra", "codex")).toBe("gpt-5.6-terra");
    expect(resolveModelInput("Luna", "codex")).toBe("gpt-5.6-luna");
    expect(resolveModelInput("Codex", "codex")).toBe("gpt-5.6-sol");
    expect(resolveModelInput("Mini", "codex")).toBe("gpt-5.6-luna");
  });
});
