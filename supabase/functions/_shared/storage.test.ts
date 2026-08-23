import assert from "node:assert/strict";
import test from "node:test";

import type { Upload } from "@clientflow/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { BackendError } from "./errors";
import { PrivateStorageUploadAdapter } from "./storage";

test("private storage verifies downloaded bytes and MIME type", async () => {
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const admin = createStorageClient(
    new Blob([pngBytes], { type: "image/png" }),
  );
  const storage = new PrivateStorageUploadAdapter(admin);

  const bytes = await storage.downloadVerified(createUpload(pngBytes.byteLength));

  assert.deepEqual(bytes, pngBytes);
});

test("private storage rejects an object whose declared size does not match", async () => {
  const admin = createStorageClient(
    new Blob([new Uint8Array([1, 2])], { type: "image/png" }),
  );
  const storage = new PrivateStorageUploadAdapter(admin);

  await assert.rejects(
    storage.downloadVerified(createUpload(3)),
    (error) => error instanceof BackendError && error.code === "upload_failed",
  );
});

test("private storage rejects bytes that do not match the declared image MIME", async () => {
  const disguisedBytes = new Uint8Array([1, 2, 3]);
  const admin = createStorageClient(
    new Blob([disguisedBytes], { type: "image/png" }),
  );
  const storage = new PrivateStorageUploadAdapter(admin);

  await assert.rejects(
    storage.downloadVerified(createUpload(disguisedBytes.byteLength)),
    (error) => error instanceof BackendError && error.code === "upload_failed",
  );
});

function createStorageClient(blob: Blob): SupabaseClient {
  return {
    storage: {
      from: () => ({
        download: async () => ({ data: blob, error: null }),
      }),
    },
  } as unknown as SupabaseClient;
}

function createUpload(byteSize: number): Upload {
  return {
    id: "00000000-0000-4000-8000-000000000701",
    userId: "00000000-0000-4000-8000-000000000001",
    storagePath:
      "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000701/source",
    mimeType: "image/png",
    byteSize,
    status: "pending",
    errorCode: null,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
}
