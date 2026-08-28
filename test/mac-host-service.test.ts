import { describe, expect, it } from "vitest";
import {
  buildMacHostLaunchAgent,
  isPackagedLumiExecutable,
  MAC_HOST_SERVICE_LABEL,
} from "../server/computer/host-service.js";

describe("dedicated Mac host service", () => {
  it("accepts only an installed Lumi app executable", () => {
    expect(
      isPackagedLumiExecutable(
        "/Applications/Lumi Assistant.app/Contents/MacOS/Lumi Assistant",
      ),
    ).toBe(true);
    expect(isPackagedLumiExecutable("/usr/bin/node")).toBe(false);
    expect(isPackagedLumiExecutable("Lumi Assistant.app/Contents/MacOS/Lumi Assistant")).toBe(
      false,
    );
  });

  it("starts after login and restarts only after an unexpected exit", () => {
    const plist = buildMacHostLaunchAgent({
      appExecutable: "/Applications/Lumi & Assistant.app/Contents/MacOS/Lumi Assistant",
      stdoutPath: "/Users/lumi/Library/Logs/Lumi Assistant/host.log",
      stderrPath: "/Users/lumi/Library/Logs/Lumi Assistant/host-error.log",
    });

    expect(plist).toContain(`<string>${MAC_HOST_SERVICE_LABEL}</string>`);
    expect(plist).toContain("<string>--lumi-host</string>");
    expect(plist).toContain("<key>RunAtLoad</key>\n  <true/>");
    expect(plist).toContain("<key>SuccessfulExit</key>\n    <false/>");
    expect(plist).toContain("<string>Aqua</string>");
    expect(plist).toContain("Lumi &amp; Assistant.app");
  });
});
