import { describe, expect, it } from "vitest";
import {
  isSensitiveRelativePath,
  normalizeGitHubRepo,
  redactSensitiveText,
} from "../server/codebase/local.js";

describe("Lumi codebase safety helpers", () => {
  it("normalizes GitHub slugs from supported remote formats", () => {
    expect(normalizeGitHubRepo("nicplev/Lumi_Reading_Diary")).toBe(
      "nicplev/Lumi_Reading_Diary",
    );
    expect(normalizeGitHubRepo("https://github.com/nicplev/Lumi_Reading_Diary.git")).toBe(
      "nicplev/Lumi_Reading_Diary",
    );
    expect(normalizeGitHubRepo("git@github.com:nicplev/Lumi_Reading_Diary.git")).toBe(
      "nicplev/Lumi_Reading_Diary",
    );
    expect(normalizeGitHubRepo("https://example.com/not-github")).toBeNull();
  });

  it("blocks common credential-bearing paths", () => {
    expect(isSensitiveRelativePath(".env.local")).toBe(true);
    expect(isSensitiveRelativePath("android/app/google-services.json")).toBe(true);
    expect(isSensitiveRelativePath("certs/distribution.p12")).toBe(true);
    expect(isSensitiveRelativePath("lib/screens/home_screen.dart")).toBe(false);
  });

  it("redacts common inline credentials from otherwise safe files", () => {
    expect(redactSensitiveText('api_key="super-secret-value"')).toBe(
      'api_key="[redacted]"',
    );
    expect(redactSensitiveText("const title = 'Lumi';")).toBe("const title = 'Lumi';");
  });
});
