import assert from "node:assert/strict";
import test from "node:test";
import type { AIExtractionResult } from "@clientflow/contracts";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { SupabaseIntakeAdapter } from "@/services/supabase/supabase-intake-adapter";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const UPLOAD_ID = "00000000-0000-4000-8000-000000000701";
const EXTRACTION_ID = "00000000-0000-4000-8000-000000000801";
const CLIENT_ID = "00000000-0000-4000-8000-000000000901";
const PROJECT_ID = "00000000-0000-4000-8000-000000000902";

const RESULT: AIExtractionResult = {
  schemaVersion: 1,
  client: {
    name: "Acme",
    contactHandle: "@acme",
    contactChannel: "wechat",
  },
  project: {
    name: "Launch site",
    summary: "A focused launch",
    budgetAmount: 12_000,
    budgetCurrency: "CNY",
    dueDate: "2026-09-30",
  },
  requirements: [{ content: "Responsive page", sortOrder: 0 }],
  suggestedTasks: [
    {
      title: "Build layout",
      description: null,
      requirementIndex: 0,
      sortOrder: 0,
    },
  ],
  confidence: 0.91,
  warnings: [],
};

const EXTRACTION = {
  id: EXTRACTION_ID,
  userId: USER_ID,
  uploadId: UPLOAD_ID,
  status: "needs_review",
  schemaVersion: 1,
  provider: "stub",
  model: "configured-result-v1",
  result: RESULT,
  errorCode: null,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
};

interface FakeState {
  calls: { body: unknown; name: string }[];
  responses: Map<string, { data: unknown; error: unknown }>;
  session: Session | null;
}

function createFakeClient(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    calls: [],
    responses: new Map([
      ["request-extraction", { data: EXTRACTION, error: null }],
      ["get-extraction", { data: EXTRACTION, error: null }],
      [
        "confirm-extraction",
        {
          data: {
            clientId: CLIENT_ID,
            projectId: PROJECT_ID,
            requirementIds: ["00000000-0000-4000-8000-000000000903"],
            taskIds: ["00000000-0000-4000-8000-000000000904"],
          },
          error: null,
        },
      ],
    ]),
    session: { user: { id: USER_ID } } as Session,
    ...overrides,
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
    },
    functions: {
      invoke: async (name: string, options: { body: unknown }) => {
        state.calls.push({ body: options.body, name });
        return state.responses.get(name) ?? { data: null, error: new Error("missing") };
      },
    },
  } as unknown as SupabaseClient;
  return { client, state };
}

test("uses the real uploadId across request, get, and confirm contracts", async () => {
  const { client, state } = createFakeClient();
  const adapter = new SupabaseIntakeAdapter(client);

  const requested = await adapter.requestExtraction(UPLOAD_ID);
  const loaded = await adapter.getValidatedResult(requested.id);
  const confirmed = await adapter.confirm({
    extractionId: requested.id,
    result: loaded!,
  });

  assert.equal(requested.status, "needs_review");
  assert.deepEqual(loaded, RESULT);
  assert.equal(confirmed.clientId, CLIENT_ID);
  assert.deepEqual(state.calls, [
    { name: "request-extraction", body: { uploadId: UPLOAD_ID } },
    { name: "get-extraction", body: { extractionId: EXTRACTION_ID } },
    {
      name: "confirm-extraction",
      body: { extractionId: EXTRACTION_ID, result: RESULT },
    },
  ]);
});

test("rejects unauthenticated intake before invoking an Edge Function", async () => {
  const { client, state } = createFakeClient({ session: null });

  await assert.rejects(
    new SupabaseIntakeAdapter(client).requestExtraction(UPLOAD_ID),
    { code: "unauthenticated", retryable: false },
  );
  assert.equal(state.calls.length, 0);
});

test("preserves stable request-extraction errors without exposing provider data", async () => {
  const responses = new Map([
    [
      "request-extraction",
      {
        data: {
          code: "forbidden",
          message: "The upload is not available",
          retryable: false,
        },
        error: { name: "FunctionsHttpError", secret: "must-not-leak" },
      },
    ],
  ]);
  const { client } = createFakeClient({ responses });

  await assert.rejects(
    new SupabaseIntakeAdapter(client).requestExtraction(UPLOAD_ID),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "forbidden" &&
      !("secret" in error),
  );
});

test("does not accept mismatched extraction IDs or injected confirmation fields", async () => {
  const responses = new Map([
    [
      "request-extraction",
      { data: { ...EXTRACTION, uploadId: USER_ID }, error: null },
    ],
  ]);
  const { client, state } = createFakeClient({ responses });
  const adapter = new SupabaseIntakeAdapter(client);

  await assert.rejects(adapter.requestExtraction(UPLOAD_ID), {
    code: "extraction_failed",
  });
  await assert.rejects(
    adapter.confirm({
      extractionId: EXTRACTION_ID,
      result: RESULT,
      userId: USER_ID,
    } as never),
    { code: "validation_failed", retryable: false },
  );
  assert.deepEqual(
    state.calls.map((call) => call.name),
    ["request-extraction"],
  );
});

test("maps get-extraction not_found to the repository null contract", async () => {
  const responses = new Map([
    [
      "get-extraction",
      {
        data: {
          code: "not_found",
          message: "The extraction was not found",
          retryable: false,
        },
        error: { name: "FunctionsHttpError" },
      },
    ],
  ]);
  const { client } = createFakeClient({ responses });

  assert.equal(await new SupabaseIntakeAdapter(client).getById(EXTRACTION_ID), null);
});
