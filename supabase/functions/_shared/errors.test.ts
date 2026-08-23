import assert from "node:assert/strict";
import test from "node:test";

import { databaseError } from "./errors";

test("maps database AI abuse decisions to stable public errors", () => {
  assert.deepEqual(
    pickContract(databaseError({ code: "CF001" }, "fallback")),
    { code: "rate_limited", retryable: true, status: 429 },
  );
  assert.deepEqual(
    pickContract(databaseError({ code: "CF002" }, "fallback")),
    { code: "quota_exceeded", retryable: false, status: 429 },
  );
  assert.deepEqual(
    pickContract(databaseError({ code: "CF003" }, "fallback")),
    { code: "conflict", retryable: true, status: 409 },
  );
  assert.deepEqual(
    pickContract(databaseError({ code: "CF004" }, "fallback")),
    { code: "conflict", retryable: false, status: 409 },
  );
});

function pickContract(error: ReturnType<typeof databaseError>) {
  return {
    code: error.code,
    retryable: error.retryable,
    status: error.status,
  };
}
