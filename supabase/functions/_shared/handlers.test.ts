import assert from "node:assert/strict";
import test from "node:test";

import type { BackendFacade } from "./handlers";
import type { AIExtractionResult } from "@clientflow/contracts";
import { BackendError } from "./errors";
import {
  createConfirmExtractionHandler,
  createGetExtractionHandler,
  createMarkUploadedHandler,
  createPrepareUploadHandler,
  createRequestExtractionHandler,
} from "./handlers";

const uploadId = "00000000-0000-4000-8000-000000000701";
const extractionId = "00000000-0000-4000-8000-000000000801";

const validResult: AIExtractionResult = {
  schemaVersion: 1,
  client: { name: "Acme", contactHandle: null, contactChannel: null },
  project: {
    name: "Launch site",
    summary: null,
    budgetAmount: null,
    budgetCurrency: null,
    dueDate: null,
  },
  requirements: [{ content: "Responsive page", sortOrder: 0 }],
  suggestedTasks: [],
  confidence: 0.9,
  warnings: [],
};

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

test("mark-uploaded accepts only an upload id and returns the verified upload", async () => {
  const handler = createMarkUploadedHandler(async () => createFacade());
  const response = await handler(jsonRequest({ uploadId }));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "uploaded");

  const injected = await handler(
    jsonRequest({ uploadId, userId: "00000000-0000-4000-8000-000000000999" }),
  );
  assert.equal(injected.status, 400);
});

test("get-extraction rejects malformed UUIDs at the HTTP boundary", async () => {
  const handler = createGetExtractionHandler(async () => createFacade());
  const response = await handler(jsonRequest({ extractionId: "not-a-uuid" }));

  assert.equal(response.status, 400);
});

test("all intake HTTP handlers dispatch valid contracted payloads", async () => {
  const facade = createFacade();
  const responses = await Promise.all([
    createRequestExtractionHandler(async () => facade)(
      jsonRequest({ uploadId }),
    ),
    createGetExtractionHandler(async () => facade)(
      jsonRequest({ extractionId }),
    ),
    createConfirmExtractionHandler(async () => facade)(
      jsonRequest({ extractionId, result: validResult }),
    ),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200, 200],
  );
  const [requestResponse, getResponse, confirmResponse] = responses;
  assert.ok(requestResponse);
  assert.ok(getResponse);
  assert.ok(confirmResponse);
  assert.equal((await requestResponse.json()).id, extractionId);
  assert.equal((await getResponse.json()).id, extractionId);
  assert.deepEqual(await confirmResponse.json(), {
    clientId: "client",
    projectId: "project",
    requirementIds: [],
    taskIds: [],
  });
});

test("HTTP boundary handles preflight, unsupported methods, and auth failures", async () => {
  let backendCalls = 0;
  const handler = createPrepareUploadHandler(async () => {
    backendCalls += 1;
    throw new BackendError({
      code: "unauthenticated",
      message: "A valid authenticated session is required",
      status: 401,
    });
  });

  const preflight = await handler(
    new Request("https://example.test/functions/v1/prepare-upload", {
      method: "OPTIONS",
    }),
  );
  const unsupported = await handler(
    new Request("https://example.test/functions/v1/prepare-upload", {
      method: "GET",
    }),
  );
  const unauthenticated = await handler(
    jsonRequest({
      byteSize: 1024,
      mimeType: "image/png",
      originalFileName: "brief.png",
    }),
  );

  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.equal(unsupported.status, 405);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).code, "unauthenticated");
  assert.equal(backendCalls, 1);
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
    getExtraction: async () => createExtraction(),
    markUploaded: async () => createUpload(),
    prepareUpload: async () => ({
      uploadId,
      storagePath: `user/${uploadId}/source`,
      signedUploadToken: "signed-token",
    }),
    requestExtraction: async () => createExtraction(),
  };
}

function createUpload() {
  return {
    id: uploadId,
    userId: "00000000-0000-4000-8000-000000000001",
    storagePath: `00000000-0000-4000-8000-000000000001/${uploadId}/source`,
    mimeType: "image/png",
    byteSize: 1024,
    status: "uploaded" as const,
    errorCode: null,
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
  };
}

function createExtraction() {
  return {
    id: extractionId,
    userId: "00000000-0000-4000-8000-000000000001",
    uploadId,
    status: "needs_review" as const,
    schemaVersion: 1,
    provider: "test-provider",
    model: "test-model",
    result: validResult,
    errorCode: null,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
}
