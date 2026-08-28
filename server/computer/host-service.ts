import { execFile } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MAC_HOST_SERVICE_LABEL = "com.lumi.assistant.host";

export interface MacHostServiceStatus {
  supported: boolean;
  installed: boolean;
  loaded: boolean;
  canInstall: boolean;
  launchedAsHost: boolean;
  appPath: string;
  launchAgentPath: string;
  startsAfterLogin: boolean;
  restartsAfterCrash: boolean;
  requiresLoginAfterRestart: boolean;
  detail: string;
}

function launchAgentPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${MAC_HOST_SERVICE_LABEL}.plist`);
}

function logsRoot(): string {
  return join(homedir(), "Library", "Logs", "Lumi Assistant");
}

function desktopExecutable(): string {
  return process.env.LUMI_DESKTOP_EXECUTABLE?.trim() ?? "";
}

export function isPackagedLumiExecutable(value: string): boolean {
  if (!value || !isAbsolute(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  return (
    normalized.endsWith(".app/Contents/MacOS/Lumi Assistant") &&
    basename(value) === "Lumi Assistant"
  );
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildMacHostLaunchAgent(options: {
  appExecutable: string;
  stdoutPath: string;
  stderrPath: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${MAC_HOST_SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(options.appExecutable)}</string>
    <string>--lumi-host</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>StandardOutPath</key>
  <string>${xml(options.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(options.stderrPath)}</string>
</dict>
</plist>
`;
}

function launchDomain(): string | null {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  return uid === null ? null : `gui/${uid}`;
}

async function launchctl(args: string[]): Promise<{ ok: boolean; detail: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("/bin/launchctl", args, {
      timeout: 10_000,
      maxBuffer: 256 * 1024,
    });
    return { ok: true, detail: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const detail =
      typeof error === "object" && error && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "").trim()
        : "";
    return {
      ok: false,
      detail: detail || (error instanceof Error ? error.message : String(error)),
    };
  }
}

async function isLoaded(): Promise<boolean> {
  const domain = launchDomain();
  if (!domain) return false;
  return (await launchctl(["print", `${domain}/${MAC_HOST_SERVICE_LABEL}`])).ok;
}

export async function macHostServiceStatus(): Promise<MacHostServiceStatus> {
  const supported = process.platform === "darwin";
  const path = launchAgentPath();
  const appPath = desktopExecutable();
  const installed = supported && existsSync(path);
  const loaded = installed ? await isLoaded() : false;
  const canInstall =
    supported && isPackagedLumiExecutable(appPath) && existsSync(appPath);

  let detail = "Dedicated host startup is available only on macOS.";
  if (supported && installed && loaded) {
    detail = "Lumi will start after login and launchd will restart it after an unexpected exit.";
  } else if (supported && installed) {
    detail = "Host startup is installed and will load at the next macOS login.";
  } else if (supported && canInstall) {
    detail = "Ready to install automatic startup for this Mac.";
  } else if (supported) {
    detail = "Install and open the packaged Lumi Assistant app before enabling host startup.";
  }

  return {
    supported,
    installed,
    loaded,
    canInstall,
    launchedAsHost: process.env.LUMI_HOST_MODE === "1",
    appPath,
    launchAgentPath: path,
    startsAfterLogin: installed,
    restartsAfterCrash: installed,
    // This is deliberately a user LaunchAgent. It preserves FileVault and
    // cannot run GUI automation in the pre-login session after a full reboot.
    requiresLoginAfterRestart: true,
    detail,
  };
}

export async function installMacHostService(): Promise<MacHostServiceStatus> {
  if (process.platform !== "darwin") {
    throw new Error("Dedicated host startup is available only on macOS.");
  }
  const appPath = desktopExecutable();
  if (!isPackagedLumiExecutable(appPath) || !existsSync(appPath)) {
    throw new Error("Open the installed Lumi Assistant app from Applications, then try again.");
  }
  const domain = launchDomain();
  if (!domain) throw new Error("Could not identify the current macOS login session.");

  const path = launchAgentPath();
  const logRoot = logsRoot();
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(logRoot, { recursive: true });
  const plist = buildMacHostLaunchAgent({
    appExecutable: appPath,
    stdoutPath: join(logRoot, "host.log"),
    stderrPath: join(logRoot, "host-error.log"),
  });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, plist, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, path);

  await launchctl(["bootout", `${domain}/${MAC_HOST_SERVICE_LABEL}`]);
  const loaded = await launchctl(["bootstrap", domain, path]);
  if (!loaded.ok) {
    throw new Error(`Host startup was saved but macOS could not load it: ${loaded.detail}`);
  }
  await launchctl(["enable", `${domain}/${MAC_HOST_SERVICE_LABEL}`]);
  return await macHostServiceStatus();
}

export async function removeMacHostService(): Promise<MacHostServiceStatus> {
  if (process.platform !== "darwin") {
    throw new Error("Dedicated host startup is available only on macOS.");
  }
  const domain = launchDomain();
  if (domain) await launchctl(["bootout", `${domain}/${MAC_HOST_SERVICE_LABEL}`]);
  rmSync(launchAgentPath(), { force: true });
  return await macHostServiceStatus();
}
