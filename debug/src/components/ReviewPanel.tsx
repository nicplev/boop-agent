import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
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
  const items = useQuery(api.workItems.listForDashboard, { needsReview: true, limit: 200 });
  const projects = useQuery(api.projects.listForDashboard, { limit: 200 });
  const review = useMutation(api.workItems.review);
  const projectNames = new Map<string, string>(
    (projects ?? []).map(
      (project: any): [string, string] => [String(project._id), project.name],
    ),
  );
  const list = items ?? [];

  return (
    <PanelPage
      eyebrow="Human in the loop"
      title="Review"
      description="AI-extracted changes stay proposed until you accept or reject them."
      stat={<HeaderPill isDark={isDark}>{list.length} pending</HeaderPill>}
    >
      {items === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => <div key={item} className={panelCardClass(isDark, "h-28 shimmer")} />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState isDark={isDark}>
          Nothing is waiting for review. Meeting imports will place proposed decisions and commitments here.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {list.map((item: any) => (
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
                  <button type="button" onClick={() => review({ workItemId: item._id, decision: "reject" })} className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-[#E5E2DC] text-zinc-600 hover:bg-[#FBFAF6]"}`}>Reject</button>
                  <button type="button" onClick={() => review({ workItemId: item._id, decision: "accept" })} className="rounded-xl bg-[#51BA65] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#429654]">Accept</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelPage>
  );
}
