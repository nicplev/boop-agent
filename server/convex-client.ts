import { ConvexHttpClient } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
if (!url) {
  throw new Error(
    "Convex URL is not set. Run `npm run setup` or `npx convex dev` to configure VITE_CONVEX_URL.",
  );
}

const rawConvex = new ConvexHttpClient(url);

type ServerArgs<Reference extends FunctionReference<"query" | "mutation" | "action">> =
  Omit<FunctionArgs<Reference>, "workspaceSecret">;

function workspaceSecret(): string {
  const value = process.env.LUMI_WORKSPACE_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error(
      "Lumi workspace security is not configured. Run `npm run lumi:secure`.",
    );
  }
  return value;
}

function securedArgs<Reference extends FunctionReference<"query" | "mutation" | "action">>(
  args: ServerArgs<Reference>,
): FunctionArgs<Reference> {
  return {
    ...args,
    workspaceSecret: workspaceSecret(),
  } as FunctionArgs<Reference>;
}

export const convex = {
  query<Query extends FunctionReference<"query">>(
    reference: Query,
    args: ServerArgs<Query>,
  ): Promise<FunctionReturnType<Query>> {
    return rawConvex.query(reference, securedArgs<Query>(args));
  },

  mutation<Mutation extends FunctionReference<"mutation">>(
    reference: Mutation,
    args: ServerArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>> {
    return rawConvex.mutation(reference, securedArgs<Mutation>(args));
  },

  action<Action extends FunctionReference<"action">>(
    reference: Action,
    args: ServerArgs<Action>,
  ): Promise<FunctionReturnType<Action>> {
    return rawConvex.action(reference, securedArgs<Action>(args));
  },
};
