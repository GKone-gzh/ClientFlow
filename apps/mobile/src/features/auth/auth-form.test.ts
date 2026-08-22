import assert from "node:assert/strict";
import test from "node:test";

import { validateAuthCredentials } from "./auth-form";

test("normalizes valid credentials before calling an auth adapter", () => {
  assert.deepEqual(validateAuthCredentials(" User@Example.com ", "123456"), {
    success: true,
    data: { email: "user@example.com", password: "123456" },
  });
});

test("rejects invalid email and short passwords", () => {
  assert.equal(validateAuthCredentials("invalid", "123456").success, false);
  assert.equal(
    validateAuthCredentials("user@example.com", "short").success,
    false,
  );
});
