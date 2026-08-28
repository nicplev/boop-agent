import { useMemo, useState } from "react";
import type {
  LumiPriority as Priority,
  LumiProject,
  LumiProjectStatus as ProjectStatus,
  LumiWorkItem,
  LumiWorkItemKind as WorkItemKind,
} from "../../../server/lumi-types.js";
import {
  createProject,
  createWorkItem,
  setWorkItemStatus,
  updateProject,
  useLumiSnapshot,
} from "../lib/lumiApi.js";
import {
  EmptyState,
  HeaderPill,
  PanelPage,
  bodyTextClass,
  mutedTextClass,
  panelCardClass,
  subtlePanelClass,
} from "./PanelPrimitives.js";

const PROJECT_STATUS: ProjectStatus[] = ["planned", "active", "paused", "completed"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
const WORK_ITEM_KINDS: WorkItemKind[] = [
  "task",
  "decision",
  "commitment",
  "waiting_on",
  "blocker",
  "idea",
  "risk",
  "question",
  "opportunity",
];

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string) {
  if (status === "active" || status === "completed" || status === "resolved") {
    return "bg-[#51BA65]/15 text-[#51BA65]";
  }
  if (status === "paused" || status === "in_progress") {
    return "bg-[#F2B705]/15 text-[#D49F00]";
  }
  if (status === "rejected" || status === "archived") {
    return "bg-zinc-500/10 text-zinc-500";
  }
  return "bg-[#56C8E6]/15 text-[#2C9CBD]";
}

function priorityTone(value: string) {
  if (value === "critical") return "text-[#EC4544]";
  if (value === "high") return "text-[#FAA51A]";
  return "text-zinc-500";
}

export function ProjectsPanel({ isDark }: { isDark: boolean }) {
  const { snapshot, error: workspaceError, refresh } = useLumiSnapshot();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [priority, setPriority] = useState<Priority>("high");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const projects = snapshot?.projects;
  const list = projects ?? [];
  const items = snapshot?.workItems ?? [];
  const selectedProject = list.find((project) => project._id === selectedProjectId);
  const selectedItems = selectedProjectId
    ? items.filter((item) => item.projectId === selectedProjectId)
    : [];
  const itemCounts = useMemo(() => {
    const counts = new Map<string, { open: number; review: number }>();
    for (const item of items) {
      if (!item.projectId) continue;
      const current = counts.get(item.projectId) ?? { open: 0, review: 0 };
      if (!["completed", "resolved", "rejected", "superseded"].includes(item.status)) {
        current.open += 1;
      }
      if (item.needsReview) current.review += 1;
      counts.set(item.projectId, current);
    }
    return counts;
  }, [items]);

  async function submitProject(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const result = await createProject({
        name: name.trim(),
        summary: summary.trim() || undefined,
        status,
        priority,
      });
      setName("");
      setSummary("");
      setShowCreate(false);
      await refresh();
      setSelectedProjectId(result.id);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not create the project.");
    } finally {
      setSaving(false);
    }
  }

  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        items={selectedItems}
        isDark={isDark}
        onBack={() => setSelectedProjectId(null)}
        onRefresh={refresh}
      />
    );
  }

  return (
    <PanelPage
      eyebrow="Lumi workspace"
      title="Projects"
      description="Canonical project state, decisions, commitments, blockers and ideas."
      stat={<HeaderPill isDark={isDark}>{list.length} projects</HeaderPill>}
      action={
        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="rounded-xl bg-[#51BA65] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#429654]"
        >
          {showCreate ? "Cancel" : "New project"}
        </button>
      }
    >
      {(workspaceError || actionError) && (
        <div className={panelCardClass(isDark, "border-l-2 border-l-[#EC4544] p-3 text-xs text-[#EC4544]")}>
          {actionError || workspaceError}
        </div>
      )}
      {showCreate && (
        <form onSubmit={submitProject} className={panelCardClass(isDark, "space-y-3 p-4 fade-in")}>
          <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr]">
            <Field label="Project name" isDark={isDark}>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Lumi School Pilot"
                className={inputClass(isDark)}
              />
            </Field>
            <Field label="Status" isDark={isDark}>
              <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)} className={inputClass(isDark)}>
                {PROJECT_STATUS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
              </select>
            </Field>
            <Field label="Priority" isDark={isDark}>
              <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className={inputClass(isDark)}>
                {PRIORITIES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Outcome or summary" isDark={isDark}>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="What does success look like?"
              rows={3}
              className={inputClass(isDark)}
            />
          </Field>
          <div className="flex justify-end">
            <button disabled={!name.trim() || saving} className="rounded-xl bg-[#51BA65] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {saving ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      )}

      {projects === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => <div key={item} className={panelCardClass(isDark, "h-28 shimmer")} />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState isDark={isDark}>
          Create the first Lumi project. The recommended starting point is the School Pilot.
        </EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((project) => {
            const counts = itemCounts.get(project._id) ?? { open: 0, review: 0 };
            return (
              <button
                key={project._id}
                type="button"
                onClick={() => setSelectedProjectId(project._id)}
                className={`${panelCardClass(isDark, "cursor-pointer p-4 text-left fade-in")} hover:-translate-y-0.5`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-base font-semibold ${isDark ? "text-zinc-100" : "text-[#1A1A1A]"}`}>{project.name}</div>
                    <p className={`mt-1 line-clamp-2 text-xs leading-5 ${mutedTextClass(isDark)}`}>
                      {project.summary || "No outcome has been recorded yet."}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusTone(project.status)}`}>
                    {label(project.status)}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-3 text-[11px]">
                  <span className={priorityTone(project.priority)}>{label(project.priority)} priority</span>
                  <span className={mutedTextClass(isDark)}>{counts.open} open</span>
                  {counts.review > 0 && <span className="text-[#EC4544]">{counts.review} awaiting review</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </PanelPage>
  );
}

function ProjectDetail({
  project,
  items,
  isDark,
  onBack,
  onRefresh,
}: {
  project: LumiProject;
  items: LumiWorkItem[];
  isDark: boolean;
  onBack: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState<WorkItemKind>("task");
  const [title, setTitle] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitItem(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createWorkItem({
        projectId: project._id,
        kind,
        title: title.trim(),
        ownerName: ownerName.trim() || undefined,
        priority: "medium",
      });
      setTitle("");
      setOwnerName("");
      setShowAdd(false);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the work item.");
    } finally {
      setSaving(false);
    }
  }

  const openItems = items.filter((item) => !["completed", "resolved", "rejected", "superseded"].includes(item.status));
  const closedItems = items.filter((item) => !openItems.includes(item));

  return (
    <PanelPage
      eyebrow="Project"
      title={project.name}
      description={project.summary || "No outcome has been recorded yet."}
      stat={<HeaderPill isDark={isDark}>{openItems.length} open</HeaderPill>}
      action={
        <button type="button" onClick={onBack} className={secondaryButtonClass(isDark)}>All projects</button>
      }
    >
      <div className={panelCardClass(isDark, "flex flex-wrap items-center gap-3 px-4 py-3")}>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusTone(project.status)}`}>{label(project.status)}</span>
        <span className={`text-xs ${priorityTone(project.priority)}`}>{label(project.priority)} priority</span>
        <div className="ml-auto flex gap-2">
          {project.status !== "completed" && (
            <button type="button" onClick={() => void updateProject(project._id, { status: "completed" }).then(onRefresh).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not update the project."))} className={secondaryButtonClass(isDark)}>
              Mark complete
            </button>
          )}
          <button type="button" onClick={() => setShowAdd((value) => !value)} className="rounded-xl bg-[#56C8E6] px-3 py-1.5 text-xs font-semibold text-[#1A1A1A]">
            {showAdd ? "Cancel" : "Add item"}
          </button>
        </div>
      </div>

      {error && (
        <div className={subtlePanelClass(isDark, "border-l-2 border-l-[#EC4544] p-3 text-xs text-[#EC4544]")}>
          {error}
        </div>
      )}

      {showAdd && (
        <form onSubmit={submitItem} className={subtlePanelClass(isDark, "grid gap-3 p-4 fade-in md:grid-cols-[160px_1fr_220px_auto]")}>
          <select value={kind} onChange={(event) => setKind(event.target.value as WorkItemKind)} className={inputClass(isDark)}>
            {WORK_ITEM_KINDS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be recorded?" className={inputClass(isDark)} />
          <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Owner (optional)" className={inputClass(isDark)} />
          <button disabled={!title.trim() || saving} className="rounded-xl bg-[#51BA65] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Add</button>
        </form>
      )}

      <WorkItemSection title="Open state" items={openItems} isDark={isDark} onComplete={async (item) => {
        await setWorkItemStatus(item._id, item.kind === "decision" ? "resolved" : "completed");
        await onRefresh();
      }} />
      {closedItems.length > 0 && <WorkItemSection title="Completed or resolved" items={closedItems} isDark={isDark} />}
    </PanelPage>
  );
}

function WorkItemSection({ title, items, isDark, onComplete }: { title: string; items: LumiWorkItem[]; isDark: boolean; onComplete?: (item: LumiWorkItem) => void | Promise<void> }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={`text-xs mono ${mutedTextClass(isDark)}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <EmptyState isDark={isDark}>Nothing recorded here yet.</EmptyState>
      ) : items.map((item) => (
        <div key={item._id} className={panelCardClass(isDark, "flex items-start gap-3 px-4 py-3")}>
          <span className="mt-0.5 rounded-full bg-[#56C8E6]/15 px-2 py-1 text-[10px] font-semibold text-[#2C9CBD]">{label(item.kind)}</span>
          <div className="min-w-0 flex-1">
            <div className={`text-sm font-medium ${isDark ? "text-zinc-100" : "text-[#1A1A1A]"}`}>{item.title}</div>
            <div className={`mt-1 flex flex-wrap gap-3 text-[11px] ${mutedTextClass(isDark)}`}>
              <span>{label(item.status)}</span>
              {item.ownerName && <span>Owner: {item.ownerName}</span>}
              {item.needsReview && <span className="text-[#EC4544]">Awaiting review</span>}
              {item.sourceCount > 0 && <span>{item.sourceCount} sources</span>}
            </div>
          </div>
          {onComplete && !item.needsReview && (
            <button type="button" onClick={() => void onComplete(item)} className={secondaryButtonClass(isDark)}>Complete</button>
          )}
        </div>
      ))}
    </section>
  );
}

function Field({ label: fieldLabel, isDark, children }: { label: string; isDark: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className={`text-[11px] font-medium ${bodyTextClass(isDark)}`}>{fieldLabel}</span>
      {children}
    </label>
  );
}

function inputClass(isDark: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-[#56C8E6] ${
    isDark ? "border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-600" : "border-[#E5E2DC] bg-white text-[#1A1A1A] placeholder:text-zinc-400"
  }`;
}

function secondaryButtonClass(isDark: boolean) {
  return `rounded-xl border px-2.5 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" : "border-[#E5E2DC] bg-white text-zinc-600 hover:bg-[#FBFAF6]"}`;
}
