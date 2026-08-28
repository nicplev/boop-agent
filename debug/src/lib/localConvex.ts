import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";

type BrowserArgs<Reference extends FunctionReference<"query" | "mutation">> =
  Omit<FunctionArgs<Reference>, "workspaceSecret">;

async function request<T>(
  kind: "query" | "mutation",
  operation: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`/api/legacy-data/${kind}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operation, args }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { value?: T; error?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Local data ${kind} failed (${response.status})`);
  }
  return payload?.value as T;
}

export function useQuery<Query extends FunctionReference<"query">>(
  reference: Query,
  args?: BrowserArgs<Query>,
): FunctionReturnType<Query> | undefined {
  const operation = getFunctionName(reference);
  const serializedArgs = useMemo(() => JSON.stringify(args ?? {}), [args]);
  const [value, setValue] = useState<FunctionReturnType<Query>>();

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const refresh = async () => {
      try {
        const next = await request<FunctionReturnType<Query>>(
          "query",
          operation,
          JSON.parse(serializedArgs) as Record<string, unknown>,
        );
        if (!cancelled) setValue(next);
      } catch (error) {
        if (!cancelled) console.error(`[local-data] ${operation}`, error);
      }
    };

    const onChanged = () => void refresh();
    void refresh();
    timer = window.setInterval(refresh, 5_000);
    window.addEventListener("lumi-data-changed", onChanged);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      window.removeEventListener("lumi-data-changed", onChanged);
    };
  }, [operation, serializedArgs]);

  return value;
}

export function useMutation<Mutation extends FunctionReference<"mutation">>(
  reference: Mutation,
): (args: BrowserArgs<Mutation>) => Promise<FunctionReturnType<Mutation>> {
  const operation = getFunctionName(reference);
  return useCallback(
    async (args: BrowserArgs<Mutation>) => {
      const value = await request<FunctionReturnType<Mutation>>(
        "mutation",
        operation,
        args as Record<string, unknown>,
      );
      window.dispatchEvent(new Event("lumi-data-changed"));
      return value;
    },
    [operation],
  );
}
