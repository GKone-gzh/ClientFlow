import assert from "node:assert/strict";
import test from "node:test";

import type {
  AIExtraction,
  AIExtractionResult,
  Upload,
} from "@clientflow/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ServerAIProvider } from "./ai-provider";
import { BackendError } from "./errors";
import { SupabaseIntakeService } from "./intake-service";

const uploadId = "00000000-0000-4000-8000-000000000701";
const extractionId = "00000000-0000-4000-8000-000000000801";

test("invalid provider output is never passed to persistence", async () => {
  const failureCodes: string[] = [];
  let completeCalls = 0;
  const service = new SupabaseIntakeService(
    {} as SupabaseClient,
    {
      markCompleted: async () => undefined,
      markFailed: async (_id, code) => {
        failureCodes.push(`upload:${code}`);
      },
      markProcessing: async () => undefined,
      verifyAndMarkUploaded: async () => ({
        imageBytes: new Uint8Array([1, 2, 3]),
        upload: createUpload(),
      }),
    },
    {
      complete: async () => {
        completeCalls += 1;
        return createExtraction("needs_review", validResult);
      },
      fail: async (_id, code) => {
        failureCodes.push(`extraction:${code}`);
      },
      findByUpload: async () => null,
      getById: async () => null,
      start: async () => createExtraction("processing", null),
    },
    createProvider({ raw: { secretConversation: "must not persist" } }),
  );

  await assert.rejects(
    service.requestExtraction(uploadId),
    (error) =>
      error instanceof BackendError && error.code === "extraction_failed",
  );
  assert.equal(completeCalls, 0);
  assert.deepEqual(failureCodes.sort(), [
    "extraction:invalid_provider_output",
    "upload:invalid_provider_output",
  ]);
});

test("validated provider output is the only result sent to persistence", async () => {
  let persisted: AIExtractionResult | undefined;
  const service = new SupabaseIntakeService(
    {} as SupabaseClient,
    {
      markCompleted: async () => undefined,
      markFailed: async () => undefined,
      markProcessing: async () => undefined,
      verifyAndMarkUploaded: async () => ({
        imageBytes: new Uint8Array([1, 2, 3]),
        upload: createUpload(),
      }),
    },
    {
      complete: async (_id, result) => {
        persisted = result;
        return createExtraction("needs_review", result);
      },
      fail: async () => undefined,
      findByUpload: async () => null,
      getById: async () => null,
      start: async () => createExtraction("processing", null),
    },
    createProvider({ raw: validResult }),
  );

  const extraction = await service.requestExtraction(uploadId);

  assert.equal(extraction.status, "needs_review");
  assert.deepEqual(persisted, validResult);
});

test("provider failures mark both records failed and never report completion", async () => {
  const failureCodes: string[] = [];
  let completed = false;
  const service = new SupabaseIntakeService(
    {} as SupabaseClient,
    {
      markCompleted: async () => {
        completed = true;
      },
      markFailed: async (_id, code) => {
        failureCodes.push(`upload:${code}`);
      },
      markProcessing: async () => undefined,
      verifyAndMarkUploaded: async () => ({
        imageBytes: new Uint8Array([1, 2, 3]),
        upload: createUpload(),
      }),
    },
    {
      complete: async () => {
        throw new Error("not expected");
      },
      fail: async (_id, code) => {
        failureCodes.push(`extraction:${code}`);
      },
      findByUpload: async () => null,
      getById: async () => null,
      start: async () => createExtraction("processing", null),
    },
    {
      modelName: "failure-model",
      providerName: "failure-provider",
      extractScreenshot: async () => {
        throw new Error("sensitive provider failure");
      },
    },
  );

  await assert.rejects(service.requestExtraction(uploadId), (error) => {
    return (
      error instanceof BackendError &&
      error.code === "extraction_failed" &&
      !error.message.includes("sensitive")
    );
  });
  assert.equal(completed, false);
  assert.deepEqual(failureCodes.sort(), [
    "extraction:provider_error",
    "upload:provider_error",
  ]);
});

test("an invalid upload state stops extraction before the provider runs", async () => {
  let providerCalls = 0;
  const conflict = new BackendError({
    code: "conflict",
    message: "The upload cannot be verified in its current state",
    status: 409,
  });
  const service = new SupabaseIntakeService(
    {} as SupabaseClient,
    {
      markCompleted: async () => undefined,
      markFailed: async () => undefined,
      markProcessing: async () => undefined,
      verifyAndMarkUploaded: async () => {
        throw conflict;
      },
    },
    {
      complete: async () => createExtraction("needs_review", validResult),
      fail: async () => undefined,
      findByUpload: async () => null,
      getById: async () => null,
      start: async () => createExtraction("processing", null),
    },
    {
      modelName: "test-model",
      providerName: "test-provider",
      extractScreenshot: async () => {
        providerCalls += 1;
        return validResult;
      },
    },
  );

  await assert.rejects(service.requestExtraction(uploadId), conflict);
  assert.equal(providerCalls, 0);
});

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

function createProvider(options: { raw: unknown }): ServerAIProvider {
  return {
    modelName: "test-model",
    providerName: "test-provider",
    extractScreenshot: async () => options.raw,
  };
}

function createExtraction(
  status: AIExtraction["status"],
  result: AIExtractionResult | null,
): AIExtraction {
  return {
    id: extractionId,
    userId: "00000000-0000-4000-8000-000000000001",
    uploadId,
    status,
    schemaVersion: 1,
    provider: null,
    model: null,
    result,
    errorCode: null,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
}

function createUpload(): Upload {
  return {
    id: uploadId,
    userId: "00000000-0000-4000-8000-000000000001",
    storagePath: `user/${uploadId}/source`,
    mimeType: "image/png",
    byteSize: 3,
    status: "uploaded",
    errorCode: null,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
}
