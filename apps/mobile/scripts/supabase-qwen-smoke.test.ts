import assert from "node:assert/strict";
import test from "node:test";

import { AppServiceError } from "../src/services/service-error";
import {
  resolveQwenSmokeImage,
  toSafeQwenSmokeError,
} from "./supabase-qwen-smoke";

test("Qwen smoke reuses the complete accuracy fixture when no storage fixture is set", () => {
  assert.equal(
    resolveQwenSmokeImage(undefined, " C:/fixtures/complete.png "),
    "C:/fixtures/complete.png",
  );
  assert.equal(
    resolveQwenSmokeImage("C:/fixtures/storage.png", "C:/fixtures/complete.png"),
    "C:/fixtures/storage.png",
  );
  assert.equal(resolveQwenSmokeImage(" ", " "), undefined);
});

test("Qwen smoke preserves stable contract errors without provider details", () => {
  const error = toSafeQwenSmokeError(
    new AppServiceError("quota_exceeded", "Daily quota reached.", false, {
      providerSecret: "must-not-survive",
    }),
  );

  assert.equal(error.code, "quota_exceeded");
  assert.equal(error.message, "Daily quota reached.");
  assert.equal(JSON.stringify(error).includes("must-not-survive"), false);
});
