import { describe, expect, it } from "vitest";
import {
  buildNativeCodexArgs,
  configuredMcpServerIds,
  configuredPluginEnabled,
  configuredPluginIds,
  nativeComputerPrompt,
  parseNativeCodexEvent,
} from "../server/computer/native.js";
import {
  parsePmsetNumber,
  parsePowerSource,
} from "../server/computer/power.js";

describe("native Computer Use handoff", () => {
  const config = `
[plugins."computer-use@openai-bundled"]
enabled = true

[plugins."slack@openai-curated"]
enabled = true

[mcp_servers.node_repl]
command = "node"

[mcp_servers.aws-mcp]
command = "uvx"
`;

  it("isolates a native turn to the official Computer Use plugin", () => {
    expect(configuredPluginIds(config)).toEqual([
      "computer-use@openai-bundled",
      "slack@openai-curated",
    ]);
    expect(configuredMcpServerIds(config)).toEqual(["node_repl", "aws-mcp"]);
    expect(configuredPluginEnabled(config, "computer-use@openai-bundled")).toBe(true);
    expect(configuredPluginEnabled(config, "missing@openai-bundled")).toBe(false);

    const args = buildNativeCodexArgs(config);
    expect(args).not.toContain("--approve-for-me");
    expect(args).toContain("computer_use");
    expect(args).toContain("prevent_idle_sleep");
    expect(args).toContain('plugins."computer-use@openai-bundled".enabled=true');
    expect(args).toContain('plugins."slack@openai-curated".enabled=false');
    expect(args).toContain("mcp_servers.node_repl.enabled=false");
    expect(args).toContain("mcp_servers.aws-mcp.enabled=false");
    expect(args.at(-1)).toBe("-");
  });

  it("keeps the paired task scoped and names real lock/sleep boundaries", () => {
    const prompt = nativeComputerPrompt("Open Safari and load the Lumi dashboard.");
    expect(prompt).toContain("official OpenAI Computer Use plugin");
    expect(prompt).toContain("<lumi_mac_task>");
    expect(prompt).toContain("Open Safari and load the Lumi dashboard.");
    expect(prompt).toContain("truly asleep/offline");
    expect(prompt).toContain("Never bypass the macOS lock screen");
  });

  it("extracts only final agent messages from Codex JSON events", () => {
    expect(
      parseNativeCodexEvent(
        JSON.stringify({
          type: "item.completed",
          item: { id: "item_1", type: "agent_message", text: "Safari is open." },
        }),
      ),
    ).toBe("Safari is open.");
    expect(parseNativeCodexEvent('{"type":"turn.started"}')).toBeNull();
    expect(parseNativeCodexEvent("not json")).toBeNull();
  });

  it("reads Mac mini power readiness without preventing display sleep", () => {
    const ac = `AC Power:
 sleep                0
 displaysleep         20
 womp                 1`;
    expect(parsePmsetNumber(ac, "sleep")).toBe(0);
    expect(parsePmsetNumber(ac, "displaysleep")).toBe(20);
    expect(parsePmsetNumber(ac, "womp")).toBe(1);
    expect(parsePowerSource("Now drawing from 'AC Power'")).toBe("ac");
    expect(parsePowerSource("Now drawing from 'Battery Power'")).toBe("battery");
  });
});
