import assert from "node:assert/strict";
import test from "node:test";

import {
  CLIENT_DETAIL_QUERY_POLICY,
  CLIENT_LIST_QUERY_POLICY,
  INTAKE_DETAIL_QUERY_POLICY,
  TASK_LIST_QUERY_POLICY,
  queryRetryDelay,
  shouldRetryQuery,
} from "./query-policy";
import { AppServiceError } from "@/services/service-error";

test("never retries deterministic contract errors", () => {
  for (const code of [
    "validation_failed",
    "not_found",
    "unauthenticated",
    "forbidden",
  ] as const) {
    assert.equal(
      shouldRetryQuery(0, new AppServiceError(code, code, true)),
      false,
    );
  }
});

test("limits retryable service failures and unknown network failures", () => {
  const transient = new AppServiceError("internal_error", "Temporary", true);
  assert.equal(shouldRetryQuery(0, transient), true);
  assert.equal(shouldRetryQuery(1, transient), true);
  assert.equal(shouldRetryQuery(2, transient), false);
  assert.equal(shouldRetryQuery(0, new TypeError("Network request failed")), true);
  assert.equal(shouldRetryQuery(1, new TypeError("Network request failed")), false);
});

test("uses bounded retry delays", () => {
  assert.equal(queryRetryDelay(0), 500);
  assert.equal(queryRetryDelay(1), 1_000);
  assert.equal(queryRetryDelay(10), 2_000);
});

test("keeps stable entities longer than volatile task and intake data", () => {
  assert.ok(CLIENT_LIST_QUERY_POLICY.gcTime > TASK_LIST_QUERY_POLICY.gcTime);
  assert.ok(CLIENT_DETAIL_QUERY_POLICY.staleTime > TASK_LIST_QUERY_POLICY.staleTime);
  assert.equal(INTAKE_DETAIL_QUERY_POLICY.staleTime, 0);
});
