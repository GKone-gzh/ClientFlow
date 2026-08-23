import assert from "node:assert/strict";
import test from "node:test";

import {
  IntakeSmokeError,
  requireIsolationCredentials,
  requireExpectedProvider,
} from "./supabase-intake-smoke";

test("Intake smoke requires a distinct second-account credential pair", () => {
  assert.deepEqual(
    requireIsolationCredentials({
      CLIENTFLOW_AUTH_TEST_EMAIL_B: "user-b@example.com",
      CLIENTFLOW_AUTH_TEST_PASSWORD_B: "test-password-b",
    }),
    { email: "user-b@example.com", password: "test-password-b" },
  );
  assert.throws(
    () => requireIsolationCredentials({}),
    (error) =>
      error instanceof IntakeSmokeError &&
      error.code === "missing_configuration" &&
      !error.message.includes("password-b"),
  );
});

test("Intake smoke defaults to Stub and accepts only approved providers", () => {
  assert.equal(requireExpectedProvider(undefined), "stub");
  assert.equal(requireExpectedProvider(" QWEN "), "qwen");
  assert.throws(
    () => requireExpectedProvider("unapproved-provider"),
    (error) =>
      error instanceof IntakeSmokeError &&
      error.code === "invalid_expected_provider",
  );
});
