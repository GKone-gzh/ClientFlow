import assert from "node:assert/strict";
import test from "node:test";

import { imageMimeType, StorageSmokeError } from "./supabase-storage-smoke";

test("Storage smoke accepts only contracted screenshot MIME types", () => {
  assert.equal(imageMimeType("chat.JPG"), "image/jpeg");
  assert.equal(imageMimeType("chat.png"), "image/png");
  assert.equal(imageMimeType("chat.webp"), "image/webp");
  assert.throws(
    () => imageMimeType("chat.gif"),
    (error) =>
      error instanceof StorageSmokeError &&
      error.code === "unsupported_mime_type",
  );
});
