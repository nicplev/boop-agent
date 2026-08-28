import express from "express";
import type { NextFunction, Request, Response } from "express";
import { isTrustedLocalRequest } from "./local-access.js";
import {
  captureMacScreenshot,
  listVisibleMacApps,
  macComputerStatus,
} from "./computer/macos.js";
import {
  activeComputerSessions,
  getComputerSettings,
  pairComputerSender,
  setComputerEnabled,
  stopAllComputerSessions,
  unpairComputerSender,
} from "./computer/security.js";

let lastScreenCaptureProbe: { ok: boolean; checkedAt: number; error?: string } | null = null;

function requireLocalComputerControl(req: Request, res: Response, next: NextFunction): void {
  if (isTrustedLocalRequest(req)) {
    next();
    return;
  }
  res.status(403).json({
    ok: false,
    error: "Remote Mac control settings are only available from localhost.",
  });
}

async function statusPayload() {
  const [settings, mac] = await Promise.all([getComputerSettings(), macComputerStatus()]);
  const now = Date.now();
  return {
    ...settings,
    platformSupported: mac.platformSupported,
    accessibilityEnabled: mac.accessibilityEnabled,
    frontmostApp: mac.blockedFrontmostApp ? "Protected app" : mac.frontmostApp,
    screenCapture: lastScreenCaptureProbe,
    activeSessions: activeComputerSessions(now).map((session) => ({
      mode: session.mode,
      expiresAt: session.expiresAt,
      remainingMinutes: Math.max(1, Math.ceil((session.expiresAt - now) / 60_000)),
    })),
  };
}

export function createComputerRouter(): express.Router {
  const router = express.Router();
  router.use(requireLocalComputerControl);

  router.get("/status", async (_req, res) => {
    try {
      res.json(await statusPayload());
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post("/pair", async (req, res) => {
    try {
      const phoneNumber = typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber : "";
      const pairedLabel = await pairComputerSender(phoneNumber);
      res.json({ ok: true, pairedLabel, status: await statusPayload() });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post("/enabled", async (req, res) => {
    try {
      if (typeof req.body?.enabled !== "boolean") {
        res.status(400).json({ ok: false, error: "enabled must be true or false." });
        return;
      }
      const settings = await getComputerSettings();
      if (req.body.enabled && !settings.paired) {
        res.status(409).json({ ok: false, error: "Pair an authorised phone before enabling control." });
        return;
      }
      await setComputerEnabled(req.body.enabled);
      res.json({ ok: true, status: await statusPayload() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post("/stop-all", async (_req, res) => {
    const stopped = stopAllComputerSessions();
    res.json({ ok: true, stopped, status: await statusPayload() });
  });

  router.post("/unpair", async (_req, res) => {
    try {
      await unpairComputerSender();
      res.json({ ok: true, status: await statusPayload() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post("/test-permissions", async (_req, res) => {
    try {
      const permissionStatus = await macComputerStatus();
      if (!permissionStatus.accessibilityEnabled) {
        throw new Error(
          "Accessibility permission is not ready. Allow Lumi Assistant in macOS Privacy & Security, then test again.",
        );
      }
      const apps = await listVisibleMacApps();
      await captureMacScreenshot();
      lastScreenCaptureProbe = { ok: true, checkedAt: Date.now() };
      res.json({
        ok: true,
        visibleAppCount: apps.length,
        status: await statusPayload(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastScreenCaptureProbe = { ok: false, checkedAt: Date.now(), error: message };
      res.status(409).json({ ok: false, error: message, status: await statusPayload() });
    }
  });

  return router;
}
