#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "") : fallback;
}

function directory(name, value) {
  if (!value || !isAbsolute(value) || !existsSync(value)) {
    throw new Error(`${name} must be an existing absolute directory.`);
  }
  const real = realpathSync(value);
  if (!statSync(real).isDirectory()) throw new Error(`${name} must be a directory.`);
  return real;
}

function repoSlug(value) {
  const clean = value.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const ssh = clean.match(/^git@github\.com:([^/]+\/[^/]+)$/i);
  const https = clean.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  const slug = ssh?.[1] ?? https?.[1] ?? clean;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug)) {
    throw new Error("--repo must be an owner/repository GitHub slug or URL.");
  }
  return slug;
}

function setEnv(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`;
}

const codebase = directory("--codebase", argument("--codebase"));
const assets = directory("--assets", argument("--assets", resolve(codebase, "assets")));
const repo = repoSlug(argument("--repo"));
const envPath = resolve(argument("--env-file", resolve(root, ".env.local")));
const interval = argument("--interval-ms", "300000");
if (!/^\d+$/.test(interval) || Number(interval) < 60_000) {
  throw new Error("--interval-ms must be at least 60000.");
}
if (!existsSync(envPath)) throw new Error(`Environment file not found: ${envPath}`);

let content = readFileSync(envPath, "utf8");
content = setEnv(content, "LUMI_CODEBASE_PATH", codebase);
content = setEnv(content, "LUMI_ASSETS_PATH", assets);
content = setEnv(content, "LUMI_GITHUB_REPO", repo);
content = setEnv(content, "LUMI_CODEBASE_SYNC_INTERVAL_MS", interval);
writeFileSync(envPath, content, { mode: 0o600 });

console.log(`Configured Lumi codebase: ${repo}`);
console.log(`Code:   ${codebase}`);
console.log(`Assets: ${assets}`);
console.log(`Env:    ${envPath}`);
