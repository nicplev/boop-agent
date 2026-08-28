import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";
import { buildRepositoryContext, getCodebaseConfig } from "./local.js";

const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1_000;
const MIN_SYNC_INTERVAL_MS = 60_000;
let syncing = false;

export async function syncCodebaseKnowledge(): Promise<boolean> {
  const config = getCodebaseConfig();
  if (!config || syncing) return false;
  syncing = true;
  try {
    const context = await buildRepositoryContext();
    const externalId = context.repo
      ? `github:${context.repo}`
      : `local:${config.root}`;
    const uri = context.repo ? `https://github.com/${context.repo}` : undefined;
    const result = await convex.mutation(api.sources.upsertGitHub, {
      externalId,
      title: "Lumi Reading Diary — live codebase context",
      summary: `Live repository context for ${context.branch || "detached HEAD"} at ${context.head.slice(0, 12)}, including current open pull requests.`,
      content: context.content,
      uri,
      occurredAt: Date.now(),
      metadata: JSON.stringify({
        root: config.root,
        assetsRoot: config.assetsRoot,
        repo: context.repo,
        branch: context.branch,
        head: context.head,
      }),
    });
    if (!result.changed) return false;

    await convex.mutation(api.memoryRecords.upsert, {
      memoryId: "lumi-codebase-live-context",
      content: `Lumi's product codebase is ${context.repo ?? config.root}, currently on ${context.branch || "a detached HEAD"} at ${context.head.slice(0, 12)}. Live code, pull-request, commit, and asset facts must be checked with the lumi-codebase integration rather than answered from this memory alone.`,
      tier: "permanent",
      segment: "project",
      importance: 0.98,
      decayRate: 0,
      sourceTurn: `codebase-sync:${context.head}`,
      metadata: JSON.stringify({
        sourceId: String(result.sourceId),
        repo: context.repo,
        root: config.root,
        assetsRoot: config.assetsRoot,
      }),
    });
    console.log(
      `[codebase] synced ${context.repo ?? config.root} ${context.branch}@${context.head.slice(0, 12)}`,
    );
    return true;
  } catch (error) {
    console.error("[codebase] context sync failed", error);
    return false;
  } finally {
    syncing = false;
  }
}

export function startCodebaseSyncLoop(): ReturnType<typeof setInterval> | null {
  if (!getCodebaseConfig()) return null;
  void syncCodebaseKnowledge();
  const configured = Number(process.env.LUMI_CODEBASE_SYNC_INTERVAL_MS);
  const intervalMs = Number.isFinite(configured)
    ? Math.max(MIN_SYNC_INTERVAL_MS, configured)
    : DEFAULT_SYNC_INTERVAL_MS;
  const timer = setInterval(() => void syncCodebaseKnowledge(), intervalMs);
  timer.unref();
  return timer;
}
