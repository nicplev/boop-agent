import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COMMAND_TIMEOUT_MS = 12_000;
const MAX_OUTPUT_BYTES = 256_000;
const MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024;

const BLOCKED_APPS = [
  "1password",
  "automator",
  "iterm",
  "keychain access",
  "passwords",
  "script editor",
  "system settings",
  "terminal",
  "warp",
];

const KEY_CODES: Record<string, number> = {
  backspace: 51,
  delete: 117,
  down: 125,
  end: 119,
  escape: 53,
  home: 115,
  left: 123,
  pagedown: 121,
  pageup: 116,
  right: 124,
  space: 49,
  tab: 48,
  up: 126,
};

const MODIFIERS: Record<string, string> = {
  command: "command down",
  control: "control down",
  option: "option down",
  shift: "shift down",
};

export interface MacComputerStatus {
  platformSupported: boolean;
  accessibilityEnabled: boolean;
  frontmostApp: string;
  blockedFrontmostApp: boolean;
}

export interface MacScreenshot {
  data: string;
  mediaType: "image/png";
  frontmostApp: string;
}

function commandError(command: string, output: string): Error {
  const detail = output.trim().slice(0, 500);
  return new Error(detail ? `${command} failed: ${detail}` : `${command} failed.`);
}

async function run(
  command: string,
  args: string[],
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, LANG: "en_US.UTF-8" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const collect = (current: string, chunk: Buffer) =>
      (current + chunk.toString("utf8")).slice(0, MAX_OUTPUT_BYTES);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = collect(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = collect(stderr, chunk);
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("exit", (code) =>
      finish(() => {
        if (code === 0) resolve(stdout.trim());
        else reject(commandError(command, stderr || stdout));
      }),
    );

    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error(`${command} timed out.`)));
    }, timeoutMs);
  });
}

async function appleScript(
  lines: string[],
  args: string[] = [],
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<string> {
  const scriptArgs = lines.flatMap((line) => ["-e", line]);
  return await run("/usr/bin/osascript", [...scriptArgs, ...args], timeoutMs);
}

export function validateAppName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 120 || /[\0\r\n]/.test(name)) {
    throw new Error("Enter a valid application name.");
  }
  return name;
}

export function isBlockedMacApp(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return BLOCKED_APPS.some(
    (blocked) => normalized === blocked || normalized.includes(`${blocked}.app`),
  );
}

function assertSafeMacApp(value: string): void {
  if (isBlockedMacApp(value)) {
    throw new Error(
      `${value} is protected from remote control. Use that app directly on the Mac.`,
    );
  }
}

export async function frontmostMacApp(timeoutMs = COMMAND_TIMEOUT_MS): Promise<string> {
  if (process.platform !== "darwin") return "Unsupported platform";
  return await appleScript(
    [
      'tell application "System Events"',
      "set frontProcess to first application process whose frontmost is true",
      "return name of frontProcess",
      "end tell",
    ],
    [],
    timeoutMs,
  );
}

async function assertSafeFrontmostApp(): Promise<string> {
  const appName = await frontmostMacApp();
  assertSafeMacApp(appName);
  return appName;
}

export async function macComputerStatus(): Promise<MacComputerStatus> {
  if (process.platform !== "darwin") {
    return {
      platformSupported: false,
      accessibilityEnabled: false,
      frontmostApp: "Unsupported platform",
      blockedFrontmostApp: false,
    };
  }
  const [accessibility, frontmost] = await Promise.all([
    appleScript(
      [
        'tell application "System Events"',
        "if not UI elements enabled then return false",
        "set frontProcess to first application process whose frontmost is true",
        "try",
        "set frontProcessRole to role of frontProcess",
        "return frontProcessRole is not missing value",
        "on error",
        "return false",
        "end try",
        "end tell",
      ],
      [],
      2_500,
    )
      .then((value) => value.trim().toLowerCase() === "true")
      .catch(() => false),
    frontmostMacApp(2_500).catch(() => "Unavailable"),
  ]);
  return {
    platformSupported: true,
    accessibilityEnabled: accessibility,
    frontmostApp: frontmost,
    blockedFrontmostApp: isBlockedMacApp(frontmost),
  };
}

async function rawVisibleMacApps(): Promise<string[]> {
  if (process.platform !== "darwin") throw new Error("Mac computer control requires macOS.");
  const output = await appleScript([
    'tell application "System Events"',
    "set appNames to name of every application process whose background only is false and visible is true",
    'set AppleScript\'s text item delimiters to linefeed',
    "return appNames as text",
    "end tell",
  ]);
  return output
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export async function listVisibleMacApps(): Promise<string[]> {
  return (await rawVisibleMacApps()).filter((name) => !isBlockedMacApp(name));
}

export async function captureMacScreenshot(): Promise<MacScreenshot> {
  if (process.platform !== "darwin") throw new Error("Mac computer control requires macOS.");
  const frontmostApp = await assertSafeFrontmostApp();
  const protectedVisibleApps = (await rawVisibleMacApps()).filter(isBlockedMacApp);
  if (protectedVisibleApps.length > 0) {
    throw new Error(
      "A protected application is visible. Hide or close protected apps before screen capture.",
    );
  }
  const directory = await mkdtemp(join(tmpdir(), "lumi-computer-"));
  const path = join(directory, "screen.png");
  try {
    await run("/usr/sbin/screencapture", ["-x", "-t", "png", path]);
    const bytes = await readFile(path);
    if (bytes.length === 0) throw new Error("Screen capture returned an empty image.");
    if (bytes.length > MAX_SCREENSHOT_BYTES) {
      throw new Error("Screen capture is too large to send to the agent safely.");
    }
    return {
      data: bytes.toString("base64"),
      mediaType: "image/png",
      frontmostApp,
    };
  } finally {
    await rm(directory, { force: true, recursive: true }).catch(() => undefined);
  }
}

export async function openMacApp(appName: string): Promise<void> {
  if (process.platform !== "darwin") throw new Error("Mac computer control requires macOS.");
  const name = validateAppName(appName);
  assertSafeMacApp(name);
  await run("/usr/bin/open", ["-a", name]);
}

export async function focusMacApp(appName: string): Promise<void> {
  if (process.platform !== "darwin") throw new Error("Mac computer control requires macOS.");
  const name = validateAppName(appName);
  assertSafeMacApp(name);
  await appleScript(
    [
      "on run argv",
      "set appName to item 1 of argv",
      'tell application "System Events"',
      "if not (exists application process appName) then error \"Application is not running.\"",
      "set frontmost of application process appName to true",
      "end tell",
      "end run",
    ],
    [name],
  );
}

export async function clickMacScreen(x: number, y: number): Promise<void> {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 16_384 || y > 16_384) {
    throw new Error("Click coordinates are outside the supported screen range.");
  }
  await assertSafeFrontmostApp();
  await appleScript(
    [
      "on run argv",
      "set clickX to (item 1 of argv) as integer",
      "set clickY to (item 2 of argv) as integer",
      'tell application "System Events" to click at {clickX, clickY}',
      "end run",
    ],
    [String(x), String(y)],
  );
}

export function validateTypedText(value: string): string {
  if (!value || value.length > 4_000 || /[\r\n]/.test(value)) {
    throw new Error("Typed text must be 1–4000 characters and cannot contain Return/newline.");
  }
  return value;
}

export async function typeMacText(value: string): Promise<void> {
  const text = validateTypedText(value);
  await assertSafeFrontmostApp();
  await appleScript(
    [
      "on run argv",
      "set typedText to item 1 of argv",
      'tell application "System Events" to keystroke typedText',
      "end run",
    ],
    [text],
  );
}

export function normalizeKeyName(value: string): string {
  const key = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "enter" || key === "return") {
    throw new Error(
      "Return/Enter is protected because it can submit forms or send messages. Complete that step directly on the Mac.",
    );
  }
  if (!(key in KEY_CODES)) {
    throw new Error(`Unsupported key. Allowed: ${Object.keys(KEY_CODES).join(", ")}.`);
  }
  return key;
}

export function normalizeModifiers(values: string[]): string[] {
  const normalized = [...new Set(values.map((value) => value.trim().toLowerCase()))];
  for (const modifier of normalized) {
    if (!(modifier in MODIFIERS)) {
      throw new Error("Unsupported modifier. Allowed: command, control, option, shift.");
    }
  }
  return normalized;
}

export async function pressMacKey(keyValue: string, modifierValues: string[]): Promise<void> {
  const key = normalizeKeyName(keyValue);
  const modifiers = normalizeModifiers(modifierValues);
  await assertSafeFrontmostApp();
  const modifierClause = modifiers.length
    ? ` using {${modifiers.map((modifier) => MODIFIERS[modifier]).join(", ")}}`
    : "";
  await appleScript([
    `tell application "System Events" to key code ${KEY_CODES[key]}${modifierClause}`,
  ]);
}
