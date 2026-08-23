import assert from "node:assert/strict";
import test from "node:test";

import { resolveQwenSmokeImage } from "./supabase-qwen-smoke";

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
