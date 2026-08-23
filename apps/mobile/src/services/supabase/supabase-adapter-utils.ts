import type { ContractErrorCode } from "@clientflow/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AppServiceError,
  isContractErrorShape,
} from "@/services/service-error";

interface RuntimeSchema<Output> {
  safeParse(value: unknown):
    | { data: Output; success: true }
    | { error: unknown; success: false };
}

export async function requireSupabaseSession(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw providerError(
      error,
      "unauthenticated",
      "登录状态已失效，请重新登录。",
      false,
    );
  }
  if (!data.session) {
    throw new AppServiceError(
      "unauthenticated",
      "请先登录后再继续操作。",
      false,
    );
  }
  return data.session;
}

export async function invokeContractFunction<Output>(input: {
  body: unknown;
  client: SupabaseClient;
  fallbackCode: ContractErrorCode;
  fallbackMessage: string;
  functionName: string;
  invalidResponseMessage: string;
  schema: RuntimeSchema<Output>;
}): Promise<Output> {
  await requireSupabaseSession(input.client);
  const { data, error } = await input.client.functions.invoke(
    input.functionName,
    { body: input.body as Record<string, unknown> },
  );
  if (error) {
    throw await functionError(
      error,
      data,
      input.fallbackCode,
      input.fallbackMessage,
    );
  }

  const parsed = input.schema.safeParse(data);
  if (!parsed.success) {
    throw new AppServiceError(
      input.fallbackCode,
      input.invalidResponseMessage,
      true,
    );
  }
  return parsed.data;
}

export function databaseError(error: unknown, message: string) {
  return providerError(error, "internal_error", message);
}

export function providerError(
  error: unknown,
  code: ContractErrorCode,
  message: string,
  retryable = true,
) {
  return new AppServiceError(code, message, retryable, {
    providerCode: safeProviderCode(error),
  });
}

async function functionError(
  error: unknown,
  data: unknown,
  fallbackCode: ContractErrorCode,
  fallbackMessage: string,
) {
  if (isContractErrorShape(data)) {
    return new AppServiceError(
      data.code,
      data.message,
      data.retryable,
      data.details,
    );
  }

  const response = functionErrorResponse(error);
  if (response) {
    if (response.status === 401) {
      return new AppServiceError(
        "unauthenticated",
        "登录状态已失效，请重新登录。",
        false,
      );
    }
    try {
      const body = (await response.clone().json()) as unknown;
      if (isContractErrorShape(body)) {
        return new AppServiceError(
          body.code,
          body.message,
          body.retryable,
          body.details,
        );
      }
    } catch {
      // Provider response details are intentionally hidden by the fallback.
    }
  }

  return providerError(error, fallbackCode, fallbackMessage);
}

function functionErrorResponse(error: unknown): Response | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "context" in error &&
    error.context instanceof Response
  ) {
    return error.context;
  }
  return null;
}

function safeProviderCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    if ("code" in error && typeof error.code === "string") return error.code;
    if ("name" in error && typeof error.name === "string") return error.name;
  }
  return "unknown";
}
