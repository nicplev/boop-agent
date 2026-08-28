import { execFile } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const COMMAND_TIMEOUT_MS = 15_000;
const COMMAND_MAX_BUFFER = 1024 * 1024;
const TOOL_TEXT_LIMIT = 40_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const SENSITIVE_PATH =
  /(^|\/)(?:\.git|\.env(?:\..*)?|auth\.json|credentials?(?:\..*)?|secrets?(?:\..*)?|service[-_]?account(?:\..*)?|google-services\.json|GoogleService-Info\.plist|[^/]+\.(?:pem|key|p12|pfx|keystore))($|\/)/i;

const SEARCH_GLOBS = [
  "!.git/**",
  "!node_modules/**",
  "!build/**",
  "!dist/**",
  "!.dart_tool/**",
  "!.firebase/**",
  "!.idea/**",
  "!.vscode/**",
  "!.env*",
  "!**/*.pem",
  "!**/*.key",
  "!**/*.p12",
  "!**/*.pfx",
  "!**/google-services.json",
  "!**/GoogleService-Info.plist",
];

const IMAGE_MEDIA_TYPES = new Map<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp">([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
]);

export interface CodebaseConfig {
  root: string;
  assetsRoot: string | null;
  githubRepo: string | null;
}

function existingDirectory(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !isAbsolute(trimmed) || !existsSync(trimmed)) return null;
  const real = realpathSync(trimmed);
  return statSync(real).isDirectory() ? real : null;
}

export function getCodebaseConfig(): CodebaseConfig | null {
  const root = existingDirectory(process.env.LUMI_CODEBASE_PATH);
  if (!root) return null;
  const configuredAssets = existingDirectory(process.env.LUMI_ASSETS_PATH);
  const fallbackAssets = existingDirectory(resolve(root, "assets"));
  return {
    root,
    assetsRoot: configuredAssets ?? fallbackAssets,
    githubRepo: normalizeGitHubRepo(process.env.LUMI_GITHUB_REPO ?? ""),
  };
}

export function normalizeGitHubRepo(value: string): string | null {
  const trimmed = value.trim().replace(/\.git$/, "").replace(/\/$/, "");
  if (!trimmed) return null;
  const ssh = trimmed.match(/^git@github\.com:([^/]+\/[^/]+)$/i);
  if (ssh) return ssh[1];
  const https = trimmed.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  if (https) return https[1];
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : null;
}

function truncate(value: string, limit = TOOL_TEXT_LIMIT): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n\n[truncated at ${limit.toLocaleString()} characters]`;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[redacted-token]")
    .replace(/\b(?:sk|sb)[-_][A-Za-z0-9_-]{20,}\b/g, "[redacted-key]")
    .replace(
      /((?:api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["']?)[^\s"']{8,}/gi,
      "$1[redacted]",
    );
}

export function isSensitiveRelativePath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  return SENSITIVE_PATH.test(normalized);
}

function resolveContainedPath(root: string, requested: string): string {
  const normalized = requested.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.includes("\0") || isAbsolute(normalized)) {
    throw new Error("Use a non-empty path relative to the configured folder.");
  }
  if (isSensitiveRelativePath(normalized)) {
    throw new Error("That path is intentionally blocked because it may contain credentials.");
  }
  const candidate = resolve(root, normalized);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw new Error("The requested path is outside the configured folder.");
  }
  const real = realpathSync(candidate);
  if (real !== root && !real.startsWith(`${root}${sep}`)) {
    throw new Error("The requested path resolves outside the configured folder.");
  }
  if (lstatSync(real).isSymbolicLink()) {
    throw new Error("Symbolic links are not readable through Lumi codebase tools.");
  }
  return real;
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  allowExitCodeOne = false,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: COMMAND_MAX_BUFFER,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        const code = (error as NodeJS.ErrnoException & { code?: number })?.code;
        if (error && !(allowExitCodeOne && code === 1)) {
          reject(new Error(redactSensitiveText(stderr.trim() || error.message)));
          return;
        }
        resolvePromise(redactSensitiveText(stdout.trim()));
      },
    );
  });
}

async function git(root: string, args: string[], allowExitCodeOne = false): Promise<string> {
  return await runCommand("git", args, root, allowExitCodeOne);
}

async function resolveRepoSlug(config: CodebaseConfig): Promise<string | null> {
  if (config.githubRepo) return config.githubRepo;
  try {
    return normalizeGitHubRepo(await git(config.root, ["remote", "get-url", "origin"]));
  } catch {
    return null;
  }
}

async function pullRequestSummary(repo: string | null): Promise<string> {
  if (!repo) return "GitHub PRs: repository slug is not configured.";
  try {
    const json = await runCommand(
      "gh",
      [
        "pr",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--limit",
        "50",
        "--json",
        "number,title,author,headRefName,baseRefName,isDraft,updatedAt,url,reviewDecision",
      ],
      configDirectory(configuredRootOrThrow()),
    );
    const pullRequests = JSON.parse(json) as Array<Record<string, unknown>>;
    if (pullRequests.length === 0) return "Open GitHub PRs: none.";
    return [
      `Open GitHub PRs (${pullRequests.length}):`,
      ...pullRequests.map((pr) => {
        const author =
          pr.author && typeof pr.author === "object"
            ? String((pr.author as Record<string, unknown>).login ?? "unknown")
            : "unknown";
        return `- #${pr.number} ${pr.title} [${pr.isDraft ? "draft" : "open"}; ${pr.headRefName} → ${pr.baseRefName}; author ${author}; updated ${pr.updatedAt}; review ${pr.reviewDecision || "pending"}] ${pr.url}`;
      }),
    ].join("\n");
  } catch (error) {
    return `GitHub PR status unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function configuredRootOrThrow(): CodebaseConfig {
  const config = getCodebaseConfig();
  if (!config) throw new Error("LUMI_CODEBASE_PATH is not configured or is unavailable.");
  return config;
}

function configDirectory(config: CodebaseConfig): string {
  return config.root;
}

export async function buildRepositoryContext(): Promise<{
  content: string;
  repo: string | null;
  branch: string;
  head: string;
}> {
  const config = configuredRootOrThrow();
  const repo = await resolveRepoSlug(config);
  const [branch, head, status, commits, trackedFiles, prs] = await Promise.all([
    git(config.root, ["branch", "--show-current"]),
    git(config.root, ["rev-parse", "HEAD"]),
    git(config.root, ["status", "--short"]),
    git(config.root, [
      "log",
      "-10",
      "--date=iso-strict",
      "--pretty=format:%h %ad %an — %s",
    ]),
    git(config.root, ["ls-files"]),
    pullRequestSummary(repo),
  ]);
  const safeFiles = trackedFiles
    .split("\n")
    .filter(Boolean)
    .filter((file) => !isSensitiveRelativePath(file));
  const topLevel = [...new Set(safeFiles.map((file) => file.split("/")[0]))].sort();
  const content = [
    "Lumi Reading Diary live repository context",
    `Repository: ${repo ?? "local-only"}`,
    `Local root: ${config.root}`,
    `Assets root: ${config.assetsRoot ?? "not configured"}`,
    `Branch: ${branch || "detached"}`,
    `HEAD: ${head}`,
    `Tracked files: ${safeFiles.length}`,
    `Top-level areas: ${topLevel.join(", ") || "(none)"}`,
    "",
    "Working tree:",
    status || "clean",
    "",
    "Recent commits:",
    commits || "none",
    "",
    prs,
    "",
    "Tracked file manifest:",
    safeFiles.slice(0, 2_000).join("\n"),
  ].join("\n");
  return { content: truncate(content, 49_000), repo, branch, head };
}

export async function searchCode(args: {
  query: string;
  glob?: string;
  limit?: number;
}): Promise<string> {
  const config = configuredRootOrThrow();
  const query = args.query.trim();
  if (!query) throw new Error("Search query is required.");
  const limit = Math.max(1, Math.min(args.limit ?? 100, 300));
  const commandArgs = ["--line-number", "--column", "--no-heading", "--color", "never", "--smart-case"];
  for (const glob of SEARCH_GLOBS) commandArgs.push("--glob", glob);
  if (args.glob) {
    const glob = args.glob.trim();
    if (!glob || glob.includes("..") || isAbsolute(glob)) {
      throw new Error("The optional glob must stay within the configured repository.");
    }
    commandArgs.push("--glob", glob);
  }
  commandArgs.push("--", query, ".");
  const output = await runCommand("rg", commandArgs, config.root, true);
  const lines = output
    .split("\n")
    .filter(Boolean)
    .filter((line) => !isSensitiveRelativePath(line.split(":", 1)[0]))
    .slice(0, limit);
  return lines.length > 0 ? truncate(lines.join("\n")) : "No matching code found.";
}

export function readCodeFile(args: {
  path: string;
  startLine?: number;
  endLine?: number;
}): string {
  const config = configuredRootOrThrow();
  const file = resolveContainedPath(config.root, args.path);
  if (!statSync(file).isFile()) throw new Error("The requested path is not a file.");
  const bytes = readFileSync(file);
  if (bytes.includes(0)) throw new Error("Binary files must be opened with the asset viewer.");
  const lines = bytes.toString("utf8").split("\n");
  const start = Math.max(1, Math.min(args.startLine ?? 1, lines.length || 1));
  const requestedEnd = args.endLine ?? start + 299;
  const end = Math.max(start, Math.min(requestedEnd, start + 399, lines.length));
  const body = lines
    .slice(start - 1, end)
    .map((line, index) => `${String(start + index).padStart(5, " ")}  ${line}`)
    .join("\n");
  return truncate(`File: ${relative(config.root, file)}\nLines ${start}-${end} of ${lines.length}\n\n${redactSensitiveText(body)}`);
}

function walkAssets(root: string, dir: string, out: Array<{ path: string; bytes: number }>): void {
  if (out.length >= 5_000) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const absolute = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walkAssets(root, absolute, out);
    } else if (entry.isFile()) {
      out.push({ path: relative(root, absolute), bytes: statSync(absolute).size });
    }
    if (out.length >= 5_000) return;
  }
}

export function listAssets(args: { query?: string; limit?: number }): string {
  const config = configuredRootOrThrow();
  if (!config.assetsRoot) throw new Error("LUMI_ASSETS_PATH is not configured or unavailable.");
  const all: Array<{ path: string; bytes: number }> = [];
  walkAssets(config.assetsRoot, config.assetsRoot, all);
  const query = args.query?.trim().toLowerCase();
  const limit = Math.max(1, Math.min(args.limit ?? 200, 500));
  const matches = all
    .filter((asset) => !query || asset.path.toLowerCase().includes(query))
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, limit);
  if (matches.length === 0) return "No matching assets found.";
  return [
    `Assets root: ${config.assetsRoot}`,
    `Showing ${matches.length}${matches.length < all.length ? ` of ${all.length}` : ""}:`,
    ...matches.map((asset) => `- ${asset.path} (${asset.bytes.toLocaleString()} bytes)`),
  ].join("\n");
}

export function readAssetImage(path: string): {
  path: string;
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
} {
  const config = configuredRootOrThrow();
  if (!config.assetsRoot) throw new Error("LUMI_ASSETS_PATH is not configured or unavailable.");
  const file = resolveContainedPath(config.assetsRoot, path);
  if (!statSync(file).isFile()) throw new Error("The requested asset is not a file.");
  const mediaType = IMAGE_MEDIA_TYPES.get(extname(file).toLowerCase());
  if (!mediaType) {
    throw new Error("Preview supports PNG, JPEG, GIF, and WebP. Use read_file for text-based assets such as SVG.");
  }
  const bytes = readFileSync(file);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Asset is too large to preview (maximum ${MAX_IMAGE_BYTES.toLocaleString()} bytes).`);
  }
  return { path: relative(config.assetsRoot, file), data: bytes.toString("base64"), mediaType };
}
