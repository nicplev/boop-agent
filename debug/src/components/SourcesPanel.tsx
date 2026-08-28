import { useState } from "react";
import type { LumiSensitivity as Sensitivity } from "../../../server/lumi-types.js";
import {
  createManualSource,
  importWebSource,
  useLumiSnapshot,
} from "../lib/lumiApi.js";
import {
  EmptyState,
  HeaderPill,
  PanelPage,
  mutedTextClass,
  panelCardClass,
} from "./PanelPrimitives.js";

type CaptureMode = "manual" | "web" | null;

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

function sourceHost(uri?: string) {
  if (!uri) return null;
  try {
    return new URL(uri).hostname;
  } catch {
    return null;
  }
}

export function SourcesPanel({ isDark }: { isDark: boolean }) {
  const { snapshot, error: workspaceError, refresh } = useLumiSnapshot();
  const [captureMode, setCaptureMode] = useState<CaptureMode>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("internal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = snapshot?.sources ?? [];

  function resetCapture() {
    setTitle("");
    setSummary("");
    setContent("");
    setUrl("");
    setSensitivity("internal");
    setCaptureMode(null);
  }

  async function submitManual(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createManualSource({
        title: title.trim(),
        summary: summary.trim() || undefined,
        content: content.trim(),
        sensitivity,
      });
      resetCapture();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this source.");
    } finally {
      setSaving(false);
    }
  }

  async function submitWeb(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await importWebSource({ url: url.trim(), sensitivity });
      resetCapture();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import this webpage.");
    } finally {
      setSaving(false);
    }
  }

  const sensitivitySelect = (
    <select
      value={sensitivity}
      onChange={(event) => setSensitivity(event.target.value as Sensitivity)}
      className={inputClass(isDark)}
    >
      <option value="internal">Internal</option>
      <option value="confidential">Confidential</option>
      <option value="restricted">Restricted</option>
    </select>
  );

  return (
    <PanelPage
      eyebrow="Evidence layer"
      title="Sources"
      description="Capture or import the material behind Lumi's projects, decisions and proposals."
      stat={<HeaderPill isDark={isDark}>{list.length} sources</HeaderPill>}
      action={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCaptureMode((mode) => (mode === "manual" ? null : "manual"))}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              captureMode === "manual"
                ? "bg-[#51BA65] text-white"
                : isDark
                  ? "border border-white/10 text-zinc-300"
                  : "border border-[#E5E2DC] text-zinc-600"
            }`}
          >
            Paste text
          </button>
          <button
            type="button"
            onClick={() => setCaptureMode((mode) => (mode === "web" ? null : "web"))}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              captureMode === "web"
                ? "bg-[#56C8E6] text-[#1A1A1A]"
                : isDark
                  ? "border border-white/10 text-zinc-300"
                  : "border border-[#E5E2DC] text-zinc-600"
            }`}
          >
            Import webpage
          </button>
        </div>
      }
    >
      {(workspaceError || error) && (
        <div className={panelCardClass(isDark, "border-l-2 border-l-[#EC4544] p-3 text-xs text-[#EC4544]")}>
          {error || workspaceError}
        </div>
      )}

      {captureMode === "manual" && (
        <form onSubmit={submitManual} className={panelCardClass(isDark, "space-y-3 p-4 fade-in")}>
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Source title, e.g. School pilot meeting — 28 Aug"
              maxLength={240}
              className={inputClass(isDark)}
            />
            {sensitivitySelect}
          </div>
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Short summary (optional)"
            maxLength={1_000}
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
            <span className={`text-xs ${mutedTextClass(isDark)}`}>
              {content.length.toLocaleString()} / 50,000 characters
            </span>
            <button
              disabled={!title.trim() || !content.trim() || saving}
              className="rounded-xl bg-[#51BA65] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save source"}
            </button>
          </div>
        </form>
      )}

      {captureMode === "web" && (
        <form onSubmit={submitWeb} className={panelCardClass(isDark, "space-y-3 p-4 fade-in")}>
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <input
              autoFocus
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/research-or-brief"
              maxLength={2_048}
              className={inputClass(isDark)}
            />
            {sensitivitySelect}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs ${mutedTextClass(isDark)}`}>
              Public HTML and text pages only. Local addresses and credential-bearing URLs are blocked.
            </span>
            <button
              disabled={!url.trim() || saving}
              className="rounded-xl bg-[#56C8E6] px-3 py-1.5 text-xs font-semibold text-[#1A1A1A] disabled:opacity-40"
            >
              {saving ? "Importing…" : "Import source"}
            </button>
          </div>
        </form>
      )}

      {snapshot === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className={panelCardClass(isDark, "h-24 shimmer")} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState isDark={isDark}>
          No sources yet. Capture meeting notes or import research to begin Lumi's evidence layer.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {list.map((source) => (
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
                {sourceHost(source.uri) && <span>{sourceHost(source.uri)}</span>}
                <span>{new Date(source.importedAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelPage>
  );
}
