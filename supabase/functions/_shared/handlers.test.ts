import assert from "node:assert/strict";
import test from "node:test";

import type { BackendFacade } from "./handlers";
import {
  createGetExtractionHandler,
  createPrepareUploadHandler,
} from "./handlers";

const uploadId = "00000000-0000-4000-8000-000000000701";

test("prepare-upload validates input before calling the backend", async () => {
  let backendCalls = 0;
  const handler = createPrepareUploadHandler(async () => {
    backendCalls += 1;
    return createFacade();
  });
  const response = await handler(
    jsonRequest({
      byteSize: 1,
      mimeType: "image/gif",
      originalFileName: "brief.gif",
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(backendCalls, 0);
  assert.deepEqual(await response.json(), {
    code: "validation_failed",
    details: { fields: ["mimeType"] },
    message: "The request payload is invalid",
    retryable: false,
  });
});

test("prepare-upload returns the contracted private upload fields", async () => {
  const handler = createPrepareUploadHandler(async () => createFacade());
  const response = await handler(
    jsonRequest({
      byteSize: 1024,
      mimeType: "image/png",
      originalFileName: "brief.png",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    signedUploadToken: "signed-token",
    storagePath: `user/${uploadId}/source`,
    uploadId,
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("get-extraction rejects malformed UUIDs at the HTTP boundary", async () => {
  const handler = createGetExtractionHandler(async () => createFacade());
  const response = await handler(jsonRequest({ extractionId: "not-a-uuid" }));

  assert.equal(response.status, 400);
});

function jsonRequest(body: unknown): Request {
  return new Request("https://example.test/functions/v1/test", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function createFacade(): BackendFacade {
  return {
    confirmExtraction: async () => ({
      clientId: "client",
      projectId: "project",
      requirementIds: [],
      taskIds: [],
    }),
    getExtraction: async () => {
      throw new Error("not used");
    },
    prepareUpload: async () => ({
      uploadId,
      storagePath: `user/${uploadId}/source`,
      signedUploadToken: "signed-token",
    }),
    requestExtraction: async () => {
      throw new Error("not used");
    },
  };
}
