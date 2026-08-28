import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { spawn, type ChildProcess } from "node:child_process";
import { getComputerSettings } from "./security.js";

const execFileAsync = promisify(execFile);

export interface MacHostPowerStatus {
  supported: boolean;
  onAcPower: boolean;
  powerSource: "ac" | "battery" | "unknown";
  displaySleepMinutes: number | null;
  systemSleepMinutes: number | null;
  wakeOnNetworkAccess: boolean | null;
  assertionActive: boolean;
  alwaysOnReady: boolean;
}

let assertion: ChildProcess | null = null;

function isAssertionActive(): boolean {
  return Boolean(assertion && assertion.exitCode === null && !assertion.killed);
}

export function parsePmsetNumber(config: string, key: string): number | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = config.match(new RegExp(`^\\s*${escaped}\\s+(\\d+)\\s*$`, "m"));
  return match ? Number(match[1]) : null;
}

export function parsePowerSource(output: string): "ac" | "battery" | "unknown" {
  if (/Now drawing from ['"]AC Power['"]/i.test(output)) return "ac";
  if (/Now drawing from ['"]Battery Power['"]/i.test(output)) return "battery";
  return "unknown";
}

async function pmset(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/pmset", args, {
      timeout: 5_000,
      maxBuffer: 256 * 1024,
    });
    return stdout;
  } catch {
    return "";
  }
}

function startAssertion(): void {
  if (process.platform !== "darwin" || isAssertionActive()) return;
  // -i prevents idle system sleep; -s keeps the assertion scoped to AC power;
  // -w guarantees it disappears if the Lumi server exits. Display sleep and
  // the normal macOS lock screen remain enabled.
  assertion = spawn("/usr/bin/caffeinate", ["-i", "-s", "-w", String(process.pid)], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  assertion.once("exit", () => {
    assertion = null;
  });
  assertion.once("error", () => {
    assertion = null;
  });
}

export function stopMacAwakeAssertion(): boolean {
  if (!assertion) return false;
  const child = assertion;
  assertion = null;
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  return true;
}

export async function syncMacAwakeAssertion(): Promise<void> {
  if (process.platform !== "darwin") return;
  const settings = await getComputerSettings();
  if (settings.alwaysOnHost) startAssertion();
  else stopMacAwakeAssertion();
}

export async function macHostPowerStatus(): Promise<MacHostPowerStatus> {
  if (process.platform !== "darwin") {
    return {
      supported: false,
      onAcPower: false,
      powerSource: "unknown",
      displaySleepMinutes: null,
      systemSleepMinutes: null,
      wakeOnNetworkAccess: null,
      assertionActive: false,
      alwaysOnReady: false,
    };
  }
  const [battery, custom] = await Promise.all([pmset(["-g", "batt"]), pmset(["-g", "custom"])]);
  const powerSource = parsePowerSource(battery);
  const acBlock = custom.match(/AC Power:\s*([\s\S]*?)(?=\n\S[^\n]*Power:|$)/)?.[1] ?? custom;
  const displaySleepMinutes = parsePmsetNumber(acBlock, "displaysleep");
  const systemSleepMinutes = parsePmsetNumber(acBlock, "sleep");
  const wakeOnNetwork = parsePmsetNumber(acBlock, "womp");
  const assertionActive = isAssertionActive();
  return {
    supported: true,
    onAcPower: powerSource === "ac",
    powerSource,
    displaySleepMinutes,
    systemSleepMinutes,
    wakeOnNetworkAccess: wakeOnNetwork === null ? null : wakeOnNetwork === 1,
    assertionActive,
    alwaysOnReady: assertionActive && powerSource === "ac",
  };
}
