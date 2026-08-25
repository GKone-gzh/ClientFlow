import assert from "node:assert/strict";
import test from "node:test";

import { AIExtractionResultSchema } from "./ai-extraction.ts";
import { ContractValidationError } from "./errors.ts";
import {
  AIExtractionSchema,
  ClientSchema,
  ConfirmExtractionResultSchema,
  ConfirmExtractionInputSchema,
  GetExtractionInputSchema,
  MarkUploadedInputSchema,
  PrepareUploadInputSchema,
  PrepareUploadResultSchema,
  RequestExtractionInputSchema,
  UploadSchema,
} from "./inputs.ts";
import type {
  ClientPageRepository,
  ProjectPageRepository,
  RequirementBatchRepository,
  TaskBatchRepository,
  TaskPageRepository,
} from "./interfaces.ts";
import {
  AI_EXTRACTION_STATUSES,
  CLIENT_STATUSES,
  PROJECT_STATUSES,
  TASK_STATUSES,
  UPLOAD_STATUSES,
} from "./statuses.ts";
import {
  CLIENT_PAGE_SIZE,
  CursorPageRequestSchema,
  ListTasksInputSchema,
  MAX_PROJECT_BATCH_SIZE,
  PROJECT_PAGE_SIZE,
  ProjectBatchInputSchema,
  TASK_PAGE_SIZE,
  createClientCursorQuery,
  createCursorPageSchema,
  createProjectCursorQuery,
  createTaskCursorQuery,
  decodeTimestampPageCursor,
  encodeTimestampPageCursor,
  type TimestampCursorQuery,
} from "./pagination.ts";
import { TaskListItemSchema } from "./read-models.ts";

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

const CLIENT_CURSOR_QUERY = createClientCursorQuery();
const PROJECT_CURSOR_QUERY = createProjectCursorQuery(
  "00000000-0000-4000-8000-000000000001",
);
const TASK_CURSOR_QUERY = createTaskCursorQuery("todo");

const CURSOR_POSITION = {
  version: 1,
  timestamp: "2026-08-24T12:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000003",
} as const;

function encodeUncheckedCursor(payload: unknown): string {
  return encodeURIComponent(JSON.stringify(payload));
}

function assertCursorValidationFailed(
  cursor: string,
  query: TimestampCursorQuery,
) {
  assert.throws(
    () => decodeTimestampPageCursor(cursor, query),
    (error) =>
      error instanceof ContractValidationError &&
      error.code === "validation_failed" &&
      error.retryable === false,
  );
}

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

test("validates extraction, confirmation, and business entity responses", () => {
  const userId = "00000000-0000-4000-8000-000000000002";
  const extractionId = "00000000-0000-4000-8000-000000000003";
  const uploadId = "00000000-0000-4000-8000-000000000004";
  const clientId = "00000000-0000-4000-8000-000000000005";
  const projectId = "00000000-0000-4000-8000-000000000006";

  assert.equal(
    AIExtractionSchema.safeParse({
      id: extractionId,
      userId,
      uploadId,
      status: "needs_review",
      schemaVersion: 1,
      provider: "stub",
      model: "configured-result-v1",
      result: validExtraction,
      errorCode: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
    }).success,
    true,
  );
  assert.equal(
    ConfirmExtractionResultSchema.safeParse({
      clientId,
      projectId,
      requirementIds: [],
      taskIds: [],
    }).success,
    true,
  );
  assert.equal(
    ClientSchema.safeParse({
      id: clientId,
      userId,
      name: "Acme",
      contactHandle: null,
      contactChannel: null,
      notes: null,
      status: "lead",
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

test("validates bounded page, task filter, and project batch inputs", () => {
  const projectId = "00000000-0000-4000-8000-000000000001";

  assert.deepEqual(
    [CLIENT_PAGE_SIZE, PROJECT_PAGE_SIZE, TASK_PAGE_SIZE],
    [50, 25, 50],
  );
  assert.equal(CursorPageRequestSchema.safeParse({ limit: 50 }).success, true);
  assert.equal(CursorPageRequestSchema.safeParse({ limit: 0 }).success, false);
  assert.equal(CursorPageRequestSchema.safeParse({ limit: 101 }).success, false);
  assert.equal(
    ListTasksInputSchema.safeParse({ limit: 25, status: "in_progress" })
      .success,
    true,
  );
  assert.equal(
    ListTasksInputSchema.safeParse({ limit: 25, status: "completed" }).success,
    false,
  );
  assert.equal(
    ProjectBatchInputSchema.safeParse({ projectIds: [projectId] }).success,
    true,
  );
  assert.deepEqual(ProjectBatchInputSchema.parse({ projectIds: [] }), {
    projectIds: [],
  });
  assert.equal(
    ProjectBatchInputSchema.safeParse({ projectIds: [projectId, projectId] })
      .success,
    false,
  );
  assert.equal(
    ProjectBatchInputSchema.safeParse({
      projectIds: Array.from(
        { length: MAX_PROJECT_BATCH_SIZE + 1 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      ),
    }).success,
    false,
  );
  assert.equal(
    ProjectBatchInputSchema.safeParse({ projectIds: [], userId: projectId })
      .success,
    false,
  );
});

test("distinguishes an absent cursor from an invalid cursor", () => {
  assert.equal(decodeTimestampPageCursor(undefined, CLIENT_CURSOR_QUERY), null);
  assert.equal(decodeTimestampPageCursor(null, CLIENT_CURSOR_QUERY), null);
  assertCursorValidationFailed("not-a-cursor", CLIENT_CURSOR_QUERY);
});

test("round-trips a query-bound timestamp cursor with a stable id key", () => {
  const value = {
    ...CURSOR_POSITION,
    ...TASK_CURSOR_QUERY,
  } as const;

  const cursor = encodeTimestampPageCursor(value);

  assert.deepEqual(
    decodeTimestampPageCursor(cursor, TASK_CURSOR_QUERY),
    value,
  );
});

test("rejects a cursor with malformed encoded JSON as validation_failed", () => {
  assertCursorValidationFailed("%E0%A4%A", CLIENT_CURSOR_QUERY);
  assertCursorValidationFailed(
    encodeURIComponent("not-json"),
    CLIENT_CURSOR_QUERY,
  );
});

test("rejects a cursor for the wrong resource as validation_failed", () => {
  const cursor = encodeTimestampPageCursor({
    ...CURSOR_POSITION,
    ...CLIENT_CURSOR_QUERY,
  });

  assertCursorValidationFailed(cursor, PROJECT_CURSOR_QUERY);
});

test("rejects a cursor with the wrong order as validation_failed", () => {
  const cursor = encodeUncheckedCursor({
    ...CURSOR_POSITION,
    ...CLIENT_CURSOR_QUERY,
    order: "created_at",
  });

  assertCursorValidationFailed(cursor, CLIENT_CURSOR_QUERY);
});

test("rejects a cursor for another project client scope as validation_failed", () => {
  const cursor = encodeTimestampPageCursor({
    ...CURSOR_POSITION,
    ...PROJECT_CURSOR_QUERY,
  });
  const anotherClientQuery = createProjectCursorQuery(
    "00000000-0000-4000-8000-000000000002",
  );

  assertCursorValidationFailed(cursor, anotherClientQuery);
});

test("rejects a cursor for another task status scope as validation_failed", () => {
  const cursor = encodeTimestampPageCursor({
    ...CURSOR_POSITION,
    ...TASK_CURSOR_QUERY,
  });
  const anotherStatusQuery = createTaskCursorQuery("done");

  assertCursorValidationFailed(cursor, anotherStatusQuery);
});

test("rejects a cursor with an unsupported version as validation_failed", () => {
  assertCursorValidationFailed(
    encodeUncheckedCursor({
      ...CURSOR_POSITION,
      ...CLIENT_CURSOR_QUERY,
      version: 2,
    }),
    CLIENT_CURSOR_QUERY,
  );
});

test("rejects a cursor with an invalid timestamp as validation_failed", () => {
  assertCursorValidationFailed(
    encodeUncheckedCursor({
      ...CURSOR_POSITION,
      ...CLIENT_CURSOR_QUERY,
      timestamp: "not-a-timestamp",
    }),
    CLIENT_CURSOR_QUERY,
  );
});

test("rejects an invalid id or cursor payload as validation_failed", () => {
  assertCursorValidationFailed(
    encodeUncheckedCursor({
      ...CURSOR_POSITION,
      ...CLIENT_CURSOR_QUERY,
      id: "not-a-uuid",
    }),
    CLIENT_CURSOR_QUERY,
  );
  assertCursorValidationFailed(
    encodeUncheckedCursor({
      ...CURSOR_POSITION,
      ...CLIENT_CURSOR_QUERY,
      unexpected: true,
    }),
    CLIENT_CURSOR_QUERY,
  );
});

test("validates the shared task list read model and cursor page envelope", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const projectId = "00000000-0000-4000-8000-000000000002";
  const item = {
    id: "00000000-0000-4000-8000-000000000003",
    userId,
    projectId,
    requirementId: null,
    title: "Prepare estimate",
    description: null,
    dueAt: null,
    sortOrder: 0,
    status: "todo",
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:00.000Z",
    clientId: "00000000-0000-4000-8000-000000000004",
    clientName: "Acme",
    projectName: "Landing page",
  };
  const pageSchema = createCursorPageSchema(TaskListItemSchema);

  assert.equal(TaskListItemSchema.safeParse(item).success, true);
  assert.equal(
    pageSchema.safeParse({ items: [item], nextCursor: null }).success,
    true,
  );
  assert.equal(
    TaskListItemSchema.safeParse({
      ...item,
      project_name: item.projectName,
    }).success,
    false,
  );
});

test("keeps cursor page empty-result semantics stable", () => {
  const pageSchema = createCursorPageSchema(TaskListItemSchema);
  const emptyPage = { items: [], nextCursor: null };

  assert.deepEqual(pageSchema.parse(emptyPage), emptyPage);
  assert.equal(
    pageSchema.safeParse({ items: [], nextCursor: undefined }).success,
    false,
  );
});

test("defines one shared repository capability surface", async () => {
  const emptyPage = { items: [], nextCursor: null };
  type AdapterContract = {
    clients: ClientPageRepository;
    projects: ProjectPageRepository;
    requirements: RequirementBatchRepository;
    tasks: TaskPageRepository & TaskBatchRepository;
  };
  const createAdapterContract = (): AdapterContract => ({
    clients: {
      listPage: async () => emptyPage,
    },
    projects: {
      listPageByClient: async () => emptyPage,
    },
    requirements: {
      listByProjectIds: async () => [],
    },
    tasks: {
      listPage: async () => emptyPage,
      listByProjectIds: async () => [],
    },
  });
  const firstConsumer = createAdapterContract();
  const secondConsumer = createAdapterContract();
  const batchInput = { projectIds: [] };

  assert.deepEqual(
    await firstConsumer.clients.listPage(),
    await secondConsumer.clients.listPage(),
  );
  assert.deepEqual(
    await firstConsumer.projects.listPageByClient(
      "00000000-0000-4000-8000-000000000001",
    ),
    await secondConsumer.projects.listPageByClient(
      "00000000-0000-4000-8000-000000000001",
    ),
  );
  assert.deepEqual(
    await firstConsumer.tasks.listPage(),
    await secondConsumer.tasks.listPage(),
  );
  assert.deepEqual(
    await firstConsumer.requirements.listByProjectIds(batchInput),
    await secondConsumer.requirements.listByProjectIds(batchInput),
  );
  assert.deepEqual(
    await firstConsumer.tasks.listByProjectIds(batchInput),
    await secondConsumer.tasks.listByProjectIds(batchInput),
  );
});

test("empty project batches return [] without invoking a data source", async () => {
  let queryCount = 0;
  const readRequirements = async (input: { projectIds: string[] }) => {
    const parsed = ProjectBatchInputSchema.parse(input);
    if (parsed.projectIds.length === 0) return [];
    queryCount += 1;
    return [];
  };
  const readTasks = async (input: { projectIds: string[] }) => {
    const parsed = ProjectBatchInputSchema.parse(input);
    if (parsed.projectIds.length === 0) return [];
    queryCount += 1;
    return [];
  };
  const requirements = {
    listByProjectIds: readRequirements,
  } satisfies RequirementBatchRepository;
  const tasks = {
    listByProjectIds: readTasks,
  } satisfies TaskBatchRepository;

  assert.deepEqual(await requirements.listByProjectIds({ projectIds: [] }), []);
  assert.deepEqual(await tasks.listByProjectIds({ projectIds: [] }), []);
  assert.equal(queryCount, 0);
});
