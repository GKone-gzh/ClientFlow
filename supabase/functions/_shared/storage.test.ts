import assert from "node:assert/strict";
import test from "node:test";

import type { Upload } from "@clientflow/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { BackendError } from "./errors";
import { PrivateStorageUploadAdapter } from "./storage";

test("private storage verifies downloaded bytes and MIME type", async () => {
  const admin = createStorageClient(
    new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
  );
  const storage = new PrivateStorageUploadAdapter(admin);

  const bytes = await storage.downloadVerified(createUpload());

  assert.deepEqual(bytes, new Uint8Array([1, 2, 3]));
});

test("private storage rejects an object whose declared size does not match", async () => {
  const admin = createStorageClient(
    new Blob([new Uint8Array([1, 2])], { type: "image/png" }),
  );
  const storage = new PrivateStorageUploadAdapter(admin);

  await assert.rejects(
    storage.downloadVerified(createUpload()),
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

function createUpload(): Upload {
  return {
    id: "00000000-0000-4000-8000-000000000701",
    userId: "00000000-0000-4000-8000-000000000001",
    storagePath:
      "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000701/source",
    mimeType: "image/png",
    byteSize: 3,
    status: "pending",
    errorCode: null,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
}
