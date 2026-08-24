import assert from "node:assert/strict";
import test from "node:test";

import { createSafeLogger, type SafeLogEvent } from "./safe-logger";

test("structured logs serialize only allowlisted non-sensitive fields", () => {
  const lines: string[] = [];
  const logger = createSafeLogger((line) => lines.push(line));
  const unsafeEvent = {
    operation: "request-extraction",
    requestId: "00000000-0000-4000-8000-000000000001",
    status: "failed",
    errorCode: "provider_error",
    durationMs: 120,
    attemptCount: 2,
    authorization: "Bearer secret-access-token",
    rawResponse: "private chat content",
    screenshotBase64: "sensitive-image",
  } as SafeLogEvent & Record<string, unknown>;

  logger.log(unsafeEvent);

  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]!), {
    operation: "request-extraction",
    requestId: "00000000-0000-4000-8000-000000000001",
    status: "failed",
    errorCode: "provider_error",
    attemptCount: 2,
    durationMs: 120,
  });
  assert.doesNotMatch(
    lines[0]!,
    /authorization|secret-access-token|rawResponse|private chat|screenshot|sensitive-image/i,
  );
});

test("logging failures never change request control flow", () => {
  const logger = createSafeLogger(() => {
    throw new Error("logging unavailable");
  });

  assert.doesNotThrow(() =>
    logger.log({
      operation: "prepare-upload",
      requestId: "00000000-0000-4000-8000-000000000001",
      status: "succeeded",
    }),
  );
});
