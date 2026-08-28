import {
  action as baseAction,
  mutation as baseMutation,
  query as baseQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type {
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import { v, type ObjectType, type PropertyValidators } from "convex/values";
import { requireLumiWorkspaceSecret } from "./lumiAuth";

type SecuredArgs<ArgsValidator extends PropertyValidators> =
  ObjectType<ArgsValidator> & { workspaceSecret: string };

type FunctionDefinition<Ctx, ArgsValidator extends PropertyValidators, ReturnValue> = {
  args: ArgsValidator;
  returns?: unknown;
  handler: (ctx: Ctx, args: ObjectType<ArgsValidator>) => ReturnValue;
};

function authorizeArgs<ArgsValidator extends PropertyValidators>(
  args: SecuredArgs<ArgsValidator>,
): ObjectType<ArgsValidator> {
  requireLumiWorkspaceSecret(args.workspaceSecret);
  const authorizedArgs = { ...args } as Record<string, unknown>;
  delete authorizedArgs.workspaceSecret;
  return authorizedArgs as ObjectType<ArgsValidator>;
}

function secureDefinition<
  Ctx,
  ArgsValidator extends PropertyValidators,
  ReturnValue,
>(definition: FunctionDefinition<Ctx, ArgsValidator, ReturnValue>) {
  return {
    ...definition,
    args: {
      workspaceSecret: v.string(),
      ...definition.args,
    },
    handler: (ctx: Ctx, args: SecuredArgs<ArgsValidator>) =>
      definition.handler(ctx, authorizeArgs(args)),
  };
}

/**
 * Public Convex builders for Lumi's single-user deployment.
 *
 * Every function built here requires the server-held workspace secret. The
 * secret is removed before the original handler runs so object spreads can
 * never persist it to a table by accident.
 */
export function query<ArgsValidator extends PropertyValidators, ReturnValue>(
  definition: FunctionDefinition<QueryCtx, ArgsValidator, ReturnValue>,
): RegisteredQuery<"public", SecuredArgs<ArgsValidator>, ReturnValue> {
  return baseQuery(secureDefinition(definition) as never) as unknown as RegisteredQuery<
    "public",
    SecuredArgs<ArgsValidator>,
    ReturnValue
  >;
}

export function mutation<ArgsValidator extends PropertyValidators, ReturnValue>(
  definition: FunctionDefinition<MutationCtx, ArgsValidator, ReturnValue>,
): RegisteredMutation<"public", SecuredArgs<ArgsValidator>, ReturnValue> {
  return baseMutation(secureDefinition(definition) as never) as unknown as RegisteredMutation<
    "public",
    SecuredArgs<ArgsValidator>,
    ReturnValue
  >;
}

export function action<ArgsValidator extends PropertyValidators, ReturnValue>(
  definition: FunctionDefinition<ActionCtx, ArgsValidator, ReturnValue>,
): RegisteredAction<"public", SecuredArgs<ArgsValidator>, ReturnValue> {
  return baseAction(secureDefinition(definition) as never) as unknown as RegisteredAction<
    "public",
    SecuredArgs<ArgsValidator>,
    ReturnValue
  >;
}
