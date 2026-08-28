import { useState } from "react";
import type { LumiProposal, LumiWorkItem } from "../../../server/lumi-types.js";
import {
  decideProposal,
  reviewWorkItem,
  useLumiSnapshot,
} from "../lib/lumiApi.js";
import {
  EmptyState,
  HeaderPill,
  PanelPage,
  mutedTextClass,
  panelCardClass,
} from "./PanelPrimitives.js";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ReviewPanel({ isDark }: { isDark: boolean }) {
  const { snapshot, error: workspaceError, refresh } = useLumiSnapshot();
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const projectNames = new Map<string, string>(
    (snapshot?.projects ?? []).map((project): [string, string] => [project._id, project.name]),
  );
  const list = (snapshot?.workItems ?? []).filter((item) => item.needsReview);
  const proposalList = snapshot?.proposals ?? [];
  const pendingCount = list.length + proposalList.length;

  async function act(targetId: string, operation: () => Promise<unknown>) {
    if (actingId) return;
    setActingId(targetId);
    setActionError(null);
    try {
      await operation();
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not record this decision.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <PanelPage
      eyebrow="Human in the loop"
      title="Review"
      description="AI-extracted changes stay proposed until you accept or reject them."
      stat={<HeaderPill isDark={isDark}>{pendingCount} pending</HeaderPill>}
    >
      {(workspaceError || actionError) && (
        <div className={panelCardClass(isDark, "border-l-2 border-l-[#EC4544] p-3 text-xs text-[#EC4544]")}>
          {actionError || workspaceError}
        </div>
      )}

      {snapshot === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => <div key={item} className={panelCardClass(isDark, "h-28 shimmer")} />)}
        </div>
      ) : pendingCount === 0 ? (
        <EmptyState isDark={isDark}>
          Nothing is waiting for review. Meeting imports will place proposed decisions and commitments here.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {proposalList.map((proposal: LumiProposal) => (
            <div key={proposal._id} className={panelCardClass(isDark, "border-l-2 border-l-[#F2B705] p-4 fade-in")}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#F2B705]/15 px-2 py-1 text-[10px] font-semibold text-[#D49F00]">Evidence proposal</span>
                    {proposal.confidence !== undefined && (
                      <span className={`text-[11px] ${mutedTextClass(isDark)}`}>
                        {Math.round(proposal.confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  <div className={`mt-2 text-sm font-medium ${isDark ? "text-zinc-100" : "text-[#1A1A1A]"}`}>{proposal.title}</div>
                  <p className={`mt-1 text-xs leading-5 ${mutedTextClass(isDark)}`}>{proposal.summary}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button disabled={actingId === proposal._id} type="button" onClick={() => void act(proposal._id, () => decideProposal(proposal._id, "reject"))} className={`rounded-xl border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-[#E5E2DC] text-zinc-600 hover:bg-[#FBFAF6]"}`}>Reject</button>
                  <button disabled={actingId === proposal._id} type="button" onClick={() => void act(proposal._id, () => decideProposal(proposal._id, "accept"))} className="rounded-xl bg-[#51BA65] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#429654] disabled:opacity-40">Accept</button>
                </div>
              </div>
            </div>
          ))}
          {list.map((item: LumiWorkItem) => (
            <div key={item._id} className={panelCardClass(isDark, "p-4 fade-in")}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#56C8E6]/15 px-2 py-1 text-[10px] font-semibold text-[#2C9CBD]">{label(item.kind)}</span>
                    {item.projectId && <span className={`text-[11px] ${mutedTextClass(isDark)}`}>{projectNames.get(String(item.projectId)) ?? "Unknown project"}</span>}
                  </div>
                  <div className={`mt-2 text-sm font-medium ${isDark ? "text-zinc-100" : "text-[#1A1A1A]"}`}>{item.title}</div>
                  {item.detail && <p className={`mt-1 text-xs leading-5 ${mutedTextClass(isDark)}`}>{item.detail}</p>}
                  <div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${mutedTextClass(isDark)}`}>
                    {item.ownerName && <span>Owner: {item.ownerName}</span>}
                    {item.waitingOnName && <span>Waiting on: {item.waitingOnName}</span>}
                    {item.confidence !== undefined && <span>{Math.round(item.confidence * 100)}% confidence</span>}
                    <span>{item.sourceCount} supporting sources</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button disabled={actingId === item._id} type="button" onClick={() => void act(item._id, () => reviewWorkItem(item._id, "reject"))} className={`rounded-xl border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-[#E5E2DC] text-zinc-600 hover:bg-[#FBFAF6]"}`}>Reject</button>
                  <button disabled={actingId === item._id} type="button" onClick={() => void act(item._id, () => reviewWorkItem(item._id, "accept"))} className="rounded-xl bg-[#51BA65] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#429654] disabled:opacity-40">Accept</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelPage>
  );
}
