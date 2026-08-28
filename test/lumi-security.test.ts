import { afterEach, describe, expect, it } from "vitest";
import { requireLumiWorkspaceSecret } from "../convex/lumiAuth.js";

const originalSecret = process.env.LUMI_WORKSPACE_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.LUMI_WORKSPACE_SECRET;
  else process.env.LUMI_WORKSPACE_SECRET = originalSecret;
});
describe("Lumi workspace credential", () => {
  it("fails closed when the deployment secret is missing", () => {
    delete process.env.LUMI_WORKSPACE_SECRET;
    expect(() => requireLumiWorkspaceSecret("attacker-value")).toThrow("not configured");
  });

  it("rejects an incorrect credential", () => {
    process.env.LUMI_WORKSPACE_SECRET = "correct-secret-that-is-at-least-32-characters";
    expect(() => requireLumiWorkspaceSecret("incorrect-secret-that-is-at-least-32-chars")).toThrow(
      "Unauthorized",
    );
  });

  it("accepts the configured credential", () => {
    const secret = "correct-secret-that-is-at-least-32-characters";
    process.env.LUMI_WORKSPACE_SECRET = secret;
    expect(() => requireLumiWorkspaceSecret(secret)).not.toThrow();
  });
});
