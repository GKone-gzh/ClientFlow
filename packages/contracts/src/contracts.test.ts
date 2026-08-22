import assert from "node:assert/strict";
import test from "node:test";

import { AIExtractionResultSchema } from "./ai-extraction";
import {
  ConfirmExtractionInputSchema,
  GetExtractionInputSchema,
  MarkUploadedInputSchema,
  PrepareUploadInputSchema,
  PrepareUploadResultSchema,
  RequestExtractionInputSchema,
  UploadSchema,
} from "./inputs";
import {
  AI_EXTRACTION_STATUSES,
  CLIENT_STATUSES,
  PROJECT_STATUSES,
  TASK_STATUSES,
  UPLOAD_STATUSES,
} from "./statuses";

const validExtraction = {
  schemaVersion: 1,
  client: {
    name: "Acme",
    contactHandle: null,
    contactChannel: null,
  },
  project: {
    name: "Landing page",
    summary: null,
    budgetAmount: 1_000,
    budgetCurrency: "CNY",
    dueDate: "2026-09-01",
  },
  requirements: [{ content: "Responsive landing page", sortOrder: 0 }],
  suggestedTasks: [],
  confidence: 0.9,
  warnings: [],
} as const;

test("accepts a version 1 extraction result", () => {
  assert.equal(AIExtractionResultSchema.safeParse(validExtraction).success, true);
});

test("rejects an extraction result without requirements", () => {
  const invalidExtraction = { ...validExtraction, requirements: [] };

  assert.equal(AIExtractionResultSchema.safeParse(invalidExtraction).success, false);
});

test("rejects a suggested task that references a missing requirement", () => {
  const invalidExtraction = {
    ...validExtraction,
    suggestedTasks: [
      {
        title: "Build the page",
        description: null,
        requirementIndex: 1,
        sortOrder: 0,
      },
    ],
  };

  const parsed = AIExtractionResultSchema.safeParse(invalidExtraction);

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(parsed.error.issues[0]?.path, [
      "suggestedTasks",
      0,
      "requirementIndex",
    ]);
  }
});

test("validates strict upload and extraction boundary inputs", () => {
  assert.equal(
    PrepareUploadInputSchema.safeParse({
      mimeType: "image/png",
      byteSize: 1024,
      originalFileName: "brief.png",
    }).success,
    true,
  );
  assert.equal(
    PrepareUploadInputSchema.safeParse({
      mimeType: "image/gif",
      byteSize: 1024,
      originalFileName: "brief.gif",
    }).success,
    false,
  );
  assert.equal(
    MarkUploadedInputSchema.safeParse({
      uploadId: "00000000-0000-4000-8000-000000000001",
    }).success,
    true,
  );
  assert.equal(
    MarkUploadedInputSchema.safeParse({
      uploadId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
    }).success,
    false,
  );
  assert.equal(
    RequestExtractionInputSchema.safeParse({
      uploadId: "00000000-0000-4000-8000-000000000001",
    }).success,
    true,
  );
  assert.equal(
    GetExtractionInputSchema.safeParse({
      extractionId: "00000000-0000-4000-8000-000000000001",
    }).success,
    true,
  );
  assert.equal(
    ConfirmExtractionInputSchema.safeParse({
      extractionId: "00000000-0000-4000-8000-000000000001",
      result: validExtraction,
      untrusted: true,
    }).success,
    false,
  );
});

test("validates upload boundary responses", () => {
  assert.equal(
    PrepareUploadResultSchema.safeParse({
      uploadId: "00000000-0000-4000-8000-000000000001",
      storagePath:
        "00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000001/source",
      signedUploadToken: "signed-token",
    }).success,
    true,
  );
  assert.equal(
    UploadSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      storagePath:
        "00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000001/source",
      mimeType: "image/png",
      byteSize: 1024,
      status: "uploaded",
      errorCode: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
    }).success,
    true,
  );
});

test("public status values are unique across each domain", () => {
  for (const statuses of [
    CLIENT_STATUSES,
    PROJECT_STATUSES,
    TASK_STATUSES,
    UPLOAD_STATUSES,
    AI_EXTRACTION_STATUSES,
  ]) {
    assert.equal(new Set(statuses).size, statuses.length);
  }
});
