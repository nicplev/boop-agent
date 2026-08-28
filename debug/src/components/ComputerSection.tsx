import { useCallback, useEffect, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowReloadHorizontalIcon,
  CancelCircleIcon,
  CircleLockCheckIcon,
  ComputerSettingsIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { panelCardClass, subtlePanelClass } from "./PanelPrimitives.js";

interface ComputerStatus {
  enabled: boolean;
  alwaysOnHost: boolean;
  paired: boolean;
  pairedLabel: string;
  platformSupported: boolean;
  native: {
    codexAvailable: boolean;
    computerUseInstalled: boolean;
    computerUseEnabled: boolean;
    lockedUseInstalled: boolean;
    ready: boolean;
    activeRun: null | { id: string; startedAt: number; elapsedSeconds: number };
  };
  power: {
    supported: boolean;
    onAcPower: boolean;
    powerSource: "ac" | "battery" | "unknown";
    displaySleepMinutes: number | null;
    systemSleepMinutes: number | null;
    wakeOnNetworkAccess: boolean | null;
    assertionActive: boolean;
    alwaysOnReady: boolean;
  };
  hostService: {
    supported: boolean;
    installed: boolean;
    loaded: boolean;
    canInstall: boolean;
    launchedAsHost: boolean;
    startsAfterLogin: boolean;
    restartsAfterCrash: boolean;
    requiresLoginAfterRestart: boolean;
    detail: string;
  };
}

type Message = { tone: "ok" | "err"; text: string };

export function ComputerSection({ isDark }: { isDark: boolean }) {
  const [status, setStatus] = useState<ComputerStatus | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/computer/status", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Status failed (${response.status})`);
      setStatus(body as ComputerStatus);
    } catch (error) {
      setMessage({ tone: "err", text: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function call(
    action: string,
    path: string,
    body?: Record<string, unknown>,
  ) {
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/computer/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? `${action} failed (${response.status})`);
      }
      if (data.status) setStatus(data.status as ComputerStatus);
      else await refresh();
      setMessage({
        tone: "ok",
        text:
          path === "pair"
            ? `Paired ${data.pairedLabel}. The pairing record stores only a keyed fingerprint.`
            : path === "unpair"
              ? "Phone unpaired; native Mac control and always-on host mode are off."
              : path === "stop-all"
                ? data.nativeStopped
                  ? "Stopped the active native Computer Use task."
                  : "No native Computer Use task was running."
                : path === "test-native"
                  ? "The official Computer Use plugin is installed and enabled."
                  : path === "host-service/install"
                    ? "Dedicated host startup installed. Lumi will start after login, recover from an unexpected exit, and keep this Mac awake on power."
                    : path === "host-service/remove"
                      ? "Dedicated host startup removed. Lumi will no longer open automatically after login."
                  : path === "open-native-settings"
                    ? "Opened ChatGPT settings. Choose Computer Use to review Locked Use and app access."
                    : path === "always-on"
                      ? body?.enabled
                        ? "Always-on host mode enabled. The display may sleep and the Mac may lock, but idle system sleep is prevented while Lumi runs on AC power."
                        : "Always-on host mode disabled."
                  : body?.enabled
                    ? "Native Mac control enabled."
                    : "Native Mac control disabled and its active task stopped.",
      });
      if (path === "pair") setPhoneNumber("");
    } catch (error) {
      setMessage({ tone: "err", text: error instanceof Error ? error.message : String(error) });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const subtle = isDark ? "text-zinc-500" : "text-zinc-400";
  const label = isDark ? "text-zinc-50" : "text-zinc-950";
  const ready = Boolean(
    status?.enabled &&
      status.paired &&
      status.platformSupported &&
      status.native.ready,
  );

  return (
    <section className={panelCardClass(isDark, "fade-in overflow-hidden")}>
      <div className="px-4 py-4 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`h-10 w-10 rounded-xl inline-flex items-center justify-center shrink-0 ${
              isDark ? "bg-white/5 text-zinc-300" : "bg-zinc-100 text-zinc-700"
            }`}
          >
            <HugeiconsIcon icon={ComputerSettingsIcon} size={20} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className={`text-sm font-medium ${label}`}>Native Mac control</div>
            <div className={`text-xs mt-1 leading-relaxed max-w-3xl ${muted}`}>
              Sends an explicitly requested iMessage task into the official OpenAI Computer Use
              plugin. Only the locally paired phone is accepted; native app approvals and
              action-time confirmations remain in force.
            </div>
            <div className={`text-[10px] mono mt-2 ${subtle}`}>
              {status?.paired ? `paired controller ${status.pairedLabel}` : "no phone paired"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
              ready
                ? isDark
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                : isDark
                  ? "border-white/10 bg-white/5 text-zinc-400"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${ready ? "bg-emerald-400" : "bg-zinc-400"}`} />
            {ready ? "Ready" : status?.enabled ? "Setup needed" : "Off"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={status?.enabled ?? false}
            aria-label="Toggle native Mac control"
            disabled={!status?.paired || busy !== null}
            onClick={() => call("Enable", "enabled", { enabled: !status?.enabled })}
            className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-40 ${
              status?.enabled ? "bg-emerald-500" : isDark ? "bg-zinc-700" : "bg-zinc-300"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                status?.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className={`border-t p-4 space-y-4 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
        {!status?.paired ? (
          <div className={subtlePanelClass(isDark, "p-3 space-y-3")}>
            <div>
              <div className={`text-xs font-medium ${label}`}>Pair the authorised phone</div>
              <div className={`text-[11px] mt-1 leading-relaxed ${muted}`}>
                Enter the phone that will text Lumi, including its country code. Lumi stores only a
                keyed fingerprint and the last four digits.
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+61…"
                autoComplete="tel"
                className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none ${
                  isDark
                    ? "border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-600 focus:border-white/25"
                    : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400"
                }`}
              />
              <ActionButton
                isDark={isDark}
                icon={CircleLockCheckIcon}
                disabled={busy !== null || !phoneNumber.trim()}
                onClick={() => call("Pair", "pair", { phoneNumber })}
              >
                {busy === "Pair" ? "Pairing…" : "Pair phone"}
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            <Metric label="Controller" value={status.pairedLabel} isDark={isDark} />
            <Metric
              label="Computer Use"
              value={status.native.ready ? "Installed · enabled" : "Setup needed"}
              isDark={isDark}
            />
            <Metric
              label="Locked use"
              value={status.native.lockedUseInstalled ? "Installed" : "Enable in ChatGPT"}
              isDark={isDark}
            />
            <Metric
              label="Native task"
              value={
                status.native.activeRun
                  ? `Running · ${Math.max(1, Math.ceil(status.native.activeRun.elapsedSeconds / 60))}m`
                  : "Inactive"
              }
              isDark={isDark}
            />
          </div>
        )}

        {status?.paired && (
          <div className={subtlePanelClass(isDark, "p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3")}>
            <div className="min-w-0">
              <div className={`text-xs font-medium ${label}`}>Always-on Mac host</div>
              <div className={`text-[11px] mt-1 leading-relaxed ${muted}`}>
                Recommended for the Mac mini. It prevents idle system sleep while Lumi is running
                on power, while still allowing display sleep and the normal macOS lock screen.
              </div>
              <div className={`text-[10px] mono mt-2 ${subtle}`}>
                {status.alwaysOnHost
                  ? status.power.alwaysOnReady
                    ? "awake assertion active · AC power"
                    : `enabled · ${status.power.powerSource === "battery" ? "connect power" : "assertion starting"}`
                  : `off · system sleep ${status.power.systemSleepMinutes === 0 ? "already disabled" : "allowed"}`}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={status.alwaysOnHost}
              aria-label="Toggle always-on Mac host"
              disabled={busy !== null}
              onClick={() => call("Always-on host", "always-on", { enabled: !status.alwaysOnHost })}
              className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-40 shrink-0 ${
                status.alwaysOnHost ? "bg-emerald-500" : isDark ? "bg-zinc-700" : "bg-zinc-300"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  status.alwaysOnHost ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        )}

        {status?.hostService?.supported && (
          <div className={subtlePanelClass(isDark, "p-3 space-y-3")}>
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div className="min-w-0">
                <div className={`text-xs font-medium ${label}`}>Dedicated Mac mini host</div>
                <div className={`text-[11px] mt-1 leading-relaxed ${muted}`}>
                  Starts Lumi automatically in the background after macOS login and asks macOS to
                  restart it after an unexpected exit. This is the recommended setup for the
                  always-plugged-in Mac mini.
                </div>
                <div className={`text-[10px] mono mt-2 ${subtle}`}>
                  {status.hostService.installed
                    ? status.hostService.loaded
                      ? status.hostService.launchedAsHost
                        ? "active · dedicated host launch"
                        : "installed · takes over after the next login"
                      : "installed · loads after the next login"
                    : status.hostService.canInstall
                      ? "ready to install"
                      : "open the installed Applications copy of Lumi first"}
                </div>
              </div>
              <ActionButton
                isDark={isDark}
                icon={ComputerSettingsIcon}
                disabled={
                  busy !== null ||
                  (!status.hostService.installed && !status.hostService.canInstall)
                }
                onClick={() =>
                  call(
                    status.hostService.installed ? "Remove host startup" : "Install host startup",
                    status.hostService.installed
                      ? "host-service/remove"
                      : "host-service/install",
                  )
                }
              >
                {busy === "Install host startup"
                  ? "Installing…"
                  : busy === "Remove host startup"
                    ? "Removing…"
                    : status.hostService.installed
                      ? "Remove auto-start"
                      : "Install auto-start"}
              </ActionButton>
            </div>
            <div className={`text-[11px] leading-relaxed ${muted}`}>
              The Mac can stay locked and its display can sleep. After a full reboot, FileVault
              still requires one normal manual login before Lumi and graphical Computer Use can
              resume; this setup does not weaken the lock screen or enable automatic login.
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <ActionButton
            isDark={isDark}
            icon={PlayIcon}
            disabled={!status?.paired || busy !== null}
            onClick={() => call("Check native setup", "test-native")}
          >
            {busy === "Check native setup" ? "Checking…" : "Check native setup"}
          </ActionButton>
          <ActionButton
            isDark={isDark}
            icon={ComputerSettingsIcon}
            disabled={busy !== null}
            onClick={() => call("Open ChatGPT settings", "open-native-settings")}
          >
            Open ChatGPT settings
          </ActionButton>
          <ActionButton
            isDark={isDark}
            icon={CancelCircleIcon}
            disabled={busy !== null || !status?.native.activeRun}
            onClick={() => call("Stop sessions", "stop-all")}
          >
            Emergency stop
          </ActionButton>
          <ActionButton
            isDark={isDark}
            icon={ArrowReloadHorizontalIcon}
            disabled={busy !== null}
            onClick={refresh}
          >
            Refresh
          </ActionButton>
          {status?.paired && (
            <ActionButton
              isDark={isDark}
              icon={CancelCircleIcon}
              disabled={busy !== null}
              onClick={() => call("Unpair", "unpair")}
            >
              Unpair phone
            </ActionButton>
          )}
        </div>

        <div className={`text-[11px] leading-relaxed ${muted}`}>
          Locked/display-asleep is supported after Locked Use is enabled in ChatGPT. A genuinely
          sleeping or offline Mac cannot run local software, so keep always-on host mode enabled on
          the plugged-in Mac mini. Pre-approve only the apps you trust Computer Use to operate.
        </div>
        {message && (
          <div
            className={`text-[11px] ${
              message.tone === "ok"
                ? isDark
                  ? "text-emerald-400"
                  : "text-emerald-600"
                : isDark
                  ? "text-rose-400"
                  : "text-rose-600"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${isDark ? "bg-white/5" : "bg-zinc-50"}`}>
      <div className={`text-[10px] uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
        {label}
      </div>
      <div className={`text-xs mt-1 truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  icon,
  isDark,
  disabled,
  onClick,
}: {
  children: ReactNode;
  icon: any;
  isDark: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
        isDark
          ? "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} />
      {children}
    </button>
  );
}
