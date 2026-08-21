import assert from "node:assert/strict";
import test from "node:test";

import { AIExtractionResultSchema } from "./ai-extraction";
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
