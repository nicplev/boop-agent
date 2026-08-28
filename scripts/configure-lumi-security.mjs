#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
const variableName = "LUMI_WORKSPACE_SECRET";
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const existing = current.match(/^LUMI_WORKSPACE_SECRET=([^\r\n]+)$/m)?.[1]?.trim();
const secret = existing && existing.length >= 32 ? existing : randomBytes(32).toString("base64url");
const line = `${variableName}=${secret}`;
const next = /^LUMI_WORKSPACE_SECRET=.*$/m.test(current)
  ? current.replace(/^LUMI_WORKSPACE_SECRET=.*$/m, line)
  : `${current.trimEnd()}${current.trim() ? "\n" : ""}${line}\n`;

const temporaryPath = `${envPath}.${process.pid}.tmp`;
writeFileSync(temporaryPath, next, { encoding: "utf8", mode: 0o600 });
chmodSync(temporaryPath, 0o600);
renameSync(temporaryPath, envPath);

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(executable, ["convex", "env", "set", variableName], {
  cwd: root,
  stdio: ["pipe", "inherit", "inherit"],
});
child.stdin.end(`${secret}\n`);

child.on("error", (error) => {
  console.error(`Could not start the Convex CLI: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  if (code !== 0) {
    console.error("The local secret was created, but Convex could not be updated.");
    process.exitCode = code ?? 1;
    return;
  }
  console.log("Lumi workspace security is configured locally and in the Convex development deployment.");
});
