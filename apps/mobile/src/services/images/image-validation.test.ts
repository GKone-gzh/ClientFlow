import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SCREENSHOT_BYTES, validateScreenshot } from "./image-validation";

test("accepts a supported screenshot within the size limit", () => {
  assert.equal(
    validateScreenshot({
      byteSize: 2_000_000,
      height: 2400,
      mimeType: "image/png",
      width: 1080,
    }),
    null,
  );
});

test("rejects unsupported, oversized, and unreadable screenshots", () => {
  assert.match(
    validateScreenshot({ byteSize: 100, height: 10, mimeType: "image/gif", width: 10 }) ?? "",
    /JPG/,
  );
  assert.match(
    validateScreenshot({
      byteSize: MAX_SCREENSHOT_BYTES + 1,
      height: 10,
      mimeType: "image/jpeg",
      width: 10,
    }) ?? "",
    /10 MB/,
  );
  assert.match(
    validateScreenshot({ byteSize: null, height: 10, mimeType: "image/jpeg", width: 10 }) ?? "",
    /图片大小/,
  );
});
