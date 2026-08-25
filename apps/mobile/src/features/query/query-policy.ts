import type { ContractErrorCode } from "@clientflow/contracts";

import { isContractErrorShape } from "@/services/service-error";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

const NEVER_RETRY_CODES = new Set<ContractErrorCode>([
  "unauthenticated",
  "forbidden",
  "not_found",
  "validation_failed",
  "conflict",
  "rate_limited",
  "quota_exceeded",
]);

export const DEFAULT_QUERY_POLICY = {
  gcTime: 5 * MINUTE,
  staleTime: 30 * SECOND,
} as const;

export const CLIENT_LIST_QUERY_POLICY = {
  gcTime: 15 * MINUTE,
  staleTime: 60 * SECOND,
} as const;

export const CLIENT_DETAIL_QUERY_POLICY = {
  gcTime: 15 * MINUTE,
  staleTime: 60 * SECOND,
} as const;

export const TASK_LIST_QUERY_POLICY = {
  gcTime: 5 * MINUTE,
  staleTime: 15 * SECOND,
} as const;

export const INTAKE_DETAIL_QUERY_POLICY = {
  gcTime: 5 * MINUTE,
  staleTime: 0,
} as const;

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (isContractErrorShape(error)) {
    return (
      failureCount < 2 &&
      error.retryable &&
      !NEVER_RETRY_CODES.has(error.code)
    );
  }
  return failureCount < 1;
}

export function queryRetryDelay(attemptIndex: number) {
  return Math.min(500 * 2 ** attemptIndex, 2_000);
}
