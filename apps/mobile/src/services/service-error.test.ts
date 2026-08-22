import assert from "node:assert/strict";
import test from "node:test";

import {
  AppServiceError,
  isContractErrorShape,
  toContractError,
} from "./service-error";

test("accepts structural contract errors from any adapter", () => {
  const adapterError = {
    code: "rate_limited",
    message: "Try later",
    retryable: true,
  } as const;

  assert.equal(isContractErrorShape(adapterError), true);
  assert.deepEqual(
    toContractError(adapterError, {
      code: "internal_error",
      message: "fallback",
      retryable: false,
    }),
    adapterError,
  );
});

test("normalizes unknown failures without depending on mock error classes", () => {
  const fallback = {
    code: "upload_failed" as const,
    message: "Upload failed",
    retryable: true,
  };

  assert.deepEqual(toContractError(new Error("secret"), fallback), fallback);
  assert.equal(
    isContractErrorShape(
      new AppServiceError("validation_failed", "Invalid", false),
    ),
    true,
  );
});
