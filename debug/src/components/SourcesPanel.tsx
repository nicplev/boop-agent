import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import {
  EmptyState,
  HeaderPill,
  PanelPage,
  mutedTextClass,
  panelCardClass,
} from "./PanelPrimitives.js";

type Sensitivity = "internal" | "confidential" | "restricted";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inputClass(isDark: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-[#56C8E6] ${
    isDark
      ? "border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-600"
      : "border-[#E5E2DC] bg-white text-[#1A1A1A] placeholder:text-zinc-400"
  }`;
}

export function SourcesPanel({ isDark }: { isDark: boolean }) {
  const sources = useQuery(api.sources.listForDashboard, { limit: 100 });
  const createManual = useMutation(api.sources.createManual);
  const [showCapture, setShowCapture] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("internal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = sources ?? [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createManual({
        title: title.trim(),
        summary: summary.trim() || undefined,
        content: content.trim(),
        sensitivity,
      });
      setTitle("");
      setSummary("");
      setContent("");
      setSensitivity("internal");
      setShowCapture(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this source.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PanelPage
      eyebrow="Evidence layer"
      title="Sources"
      description="Capture the material behind Lumi's projects, decisions and proposals."
      stat={<HeaderPill isDark={isDark}>{list.length} sources</HeaderPill>}
      action={
        <button
          type="button"
          onClick={() => setShowCapture((value) => !value)}
          className="rounded-xl bg-[#51BA65] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#429654]"
        >
          {showCapture ? "Cancel" : "Capture source"}
        </button>
      }
    >
      {showCapture && (
        <form onSubmit={submit} className={panelCardClass(isDark, "space-y-3 p-4 fade-in")}>
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Source title, e.g. School pilot meeting — 28 Aug"
              className={inputClass(isDark)}
            />
            <select
              value={sensitivity}
              onChange={(event) => setSensitivity(event.target.value as Sensitivity)}
              className={inputClass(isDark)}
            >
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Short summary (optional)"
            className={inputClass(isDark)}
          />
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste meeting notes, a transcript excerpt, research, or other source material…"
            rows={8}
            maxLength={50_000}
            className={inputClass(isDark)}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs">
              {error ? (
                <span className="text-[#EC4544]">{error}</span>
              ) : (
                <span className={mutedTextClass(isDark)}>
                  {content.length.toLocaleString()} / 50,000 characters
                </span>
              )}
            </div>
            <button
              disabled={!title.trim() || !content.trim() || saving}
              className="rounded-xl bg-[#51BA65] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save source"}
            </button>
          </div>
        </form>
      )}

      {sources === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className={panelCardClass(isDark, "h-24 shimmer")} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState isDark={isDark}>
          No sources yet. Capture meeting notes or research to begin Lumi's evidence layer.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {list.map((source: any) => (
            <div key={source._id} className={panelCardClass(isDark, "p-4 fade-in")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-[#1A1A1A]"}`}>
                    {source.title}
                  </div>
                  {source.summary && (
                    <p className={`mt-1 text-xs leading-5 ${mutedTextClass(isDark)}`}>
                      {source.summary}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-[#56C8E6]/15 px-2 py-1 text-[10px] font-semibold text-[#2C9CBD]">
                  {label(source.sourceType)}
                </span>
              </div>
              <div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${mutedTextClass(isDark)}`}>
                <span>{label(source.sensitivity)}</span>
                <span>{label(source.status)}</span>
                <span>{new Date(source.importedAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelPage>
  );
}
