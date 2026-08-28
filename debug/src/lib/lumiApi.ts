import { useCallback, useEffect, useState } from "react";
import type {
  LumiPriority,
  LumiProjectStatus,
  LumiSensitivity,
  LumiSnapshot,
  LumiWorkItemKind,
  LumiWorkItemStatus,
} from "../../../server/lumi-types.js";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/lumi${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | ({ error?: string } & Record<string, unknown>)
    | null;
  if (!response.ok) {
    throw new Error(payload?.error || `Lumi request failed (${response.status})`);
  }
  return payload as T;
}
export function useLumiSnapshot(refreshIntervalMs = 5_000) {
  const [snapshot, setSnapshot] = useState<LumiSnapshot>();
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await request<LumiSnapshot>("/snapshot", { cache: "no-store" });
      setSnapshot(next);
      setError(null);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the Lumi workspace.");
      return undefined;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, refreshIntervalMs]);

  return { snapshot, error, refresh };
}

function jsonBody(value: unknown): Pick<RequestInit, "body" | "method"> {
  return { method: "POST", body: JSON.stringify(value) };
}

export async function createProject(input: {
  name: string;
  summary?: string;
  status?: LumiProjectStatus;
  priority?: LumiPriority;
  targetAt?: number;
}): Promise<{ id: string }> {
  return await request("/projects", jsonBody(input));
}

export async function updateProject(
  projectId: string,
  input: {
    name?: string;
    summary?: string;
    status?: LumiProjectStatus;
    priority?: LumiPriority;
    targetAt?: number | null;
  },
): Promise<{ id: string }> {
  return await request(`/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createWorkItem(input: {
  projectId?: string;
  kind: LumiWorkItemKind;
  title: string;
  detail?: string;
  status?: LumiWorkItemStatus;
  priority?: LumiPriority;
  ownerName?: string;
  needsReview?: boolean;
}): Promise<{ id: string }> {
  return await request("/work-items", jsonBody(input));
}

export async function setWorkItemStatus(
  workItemId: string,
  status: LumiWorkItemStatus,
): Promise<{ id: string }> {
  return await request(
    `/work-items/${encodeURIComponent(workItemId)}/status`,
    jsonBody({ status }),
  );
}

export async function reviewWorkItem(
  workItemId: string,
  decision: "accept" | "reject",
): Promise<{ id: string }> {
  return await request(
    `/work-items/${encodeURIComponent(workItemId)}/review`,
    jsonBody({ decision }),
  );
}

export async function createManualSource(input: {
  title: string;
  summary?: string;
  content: string;
  sensitivity?: LumiSensitivity;
}): Promise<{ id: string }> {
  return await request("/sources/manual", jsonBody(input));
}

export async function importWebSource(input: {
  url: string;
  sensitivity?: LumiSensitivity;
}): Promise<{ id: string; title: string }> {
  return await request("/sources/import-url", jsonBody(input));
}

export async function decideProposal(
  proposalId: string,
  decision: "accept" | "reject",
): Promise<{ proposalId: string; workItemId?: string }> {
  return await request(
    `/proposals/${encodeURIComponent(proposalId)}/decision`,
    jsonBody({ decision }),
  );
}
