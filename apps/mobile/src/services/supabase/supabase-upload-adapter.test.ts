import assert from "node:assert/strict";
import test from "node:test";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { runIntakeWorkflow } from "@/features/intake/intake-workflow";
import type { ScreenshotUploadFile } from "@/services/app-services";
import {
  SupabaseScreenshotUploadTransport,
  SupabaseUploadRepository,
} from "@/services/supabase/supabase-upload-adapter";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const UPLOAD_ID = "00000000-0000-4000-8000-000000000701";
const SERVER_PATH = `${USER_ID}/${UPLOAD_ID}/source`;
const FILE: ScreenshotUploadFile = {
  uri: "file:///chat-screenshot.png",
  mimeType: "image/png",
  byteSize: 4,
};
const PREPARED = {
  uploadId: UPLOAD_ID,
  storagePath: SERVER_PATH,
  signedUploadToken: "signed-token",
};
const UPLOAD = {
  id: UPLOAD_ID,
  userId: USER_ID,
  storagePath: SERVER_PATH,
  mimeType: "image/png",
  byteSize: 4,
  status: "uploaded",
  errorCode: null,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
};

interface FakeState {
  functionCalls: { body: unknown; name: string }[];
  functionResponses: Map<string, { data: unknown; error: unknown }>;
  session: Session | null;
  storageCalls: {
    body: ArrayBuffer;
    bucket: string;
    contentType: string | undefined;
    path: string;
    token: string;
  }[];
  storageError: unknown;
}

function createFakeClient(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    functionCalls: [],
    functionResponses: new Map([
      ["prepare-upload", { data: PREPARED, error: null }],
      ["mark-uploaded", { data: UPLOAD, error: null }],
    ]),
    session: { user: { id: USER_ID } } as Session,
    storageCalls: [],
    storageError: null,
    ...overrides,
  };
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: state.session },
        error: null,
      }),
    },
    functions: {
      invoke: async (name: string, options: { body: unknown }) => {
        state.functionCalls.push({ body: options.body, name });
        return (
          state.functionResponses.get(name) ?? {
            data: null,
            error: new Error("missing fake response"),
          }
        );
      },
    },
    storage: {
      from: (bucket: string) => ({
        uploadToSignedUrl: async (
          path: string,
          token: string,
          body: ArrayBuffer,
          options: { contentType?: string },
        ) => {
          state.storageCalls.push({
            body,
            bucket,
            contentType: options.contentType,
            path,
            token,
          });
          return { data: state.storageError ? null : { path }, error: state.storageError };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, state };
}

test("Supabase upload uses prepare-upload, the server path, MIME, and confirmation", async () => {
  const { client, state } = createFakeClient();
  const uploads = new SupabaseUploadRepository(client);
  const transport = new SupabaseScreenshotUploadTransport(
    client,
    async () => new Uint8Array([1, 2, 3, 4]).buffer,
  );

  const prepared = await uploads.prepare({
    byteSize: FILE.byteSize,
    mimeType: "image/png",
    originalFileName: "chat.png",
  });
  await transport.upload({ file: FILE, prepared });
  const upload = await uploads.markUploaded(prepared.uploadId);

  assert.deepEqual(state.functionCalls, [
    {
      name: "prepare-upload",
      body: {
        byteSize: 4,
        mimeType: "image/png",
        originalFileName: "chat.png",
      },
    },
    { name: "mark-uploaded", body: { uploadId: UPLOAD_ID } },
  ]);
  assert.equal(state.storageCalls[0]?.bucket, "chat-screenshots");
  assert.equal(state.storageCalls[0]?.path, SERVER_PATH);
  assert.equal(state.storageCalls[0]?.token, "signed-token");
  assert.equal(state.storageCalls[0]?.contentType, "image/png");
  assert.equal(upload.id, UPLOAD_ID);
  assert.equal(upload.status, "uploaded");
});

test("upload-only workflow returns the uploadId without starting extraction", async () => {
  const { client } = createFakeClient();
  let extractionCalls = 0;
  const state = await runIntakeWorkflow({
    services: {
      uploads: new SupabaseUploadRepository(client),
      screenshotUpload: new SupabaseScreenshotUploadTransport(
        client,
        async () => new Uint8Array([1, 2, 3, 4]).buffer,
      ),
      intake: {
        confirm: async () => {
          throw new Error("not expected");
        },
        getValidatedResult: async () => null,
        requestExtraction: async () => {
          extractionCalls += 1;
          throw new Error("not expected");
        },
      },
    },
    screenshot: {
      ...FILE,
      fileName: "chat.png",
      height: 1,
      mimeType: "image/jpeg",
      width: 1,
    },
    operationId: "storage-upload-only",
    stopAfterUpload: true,
  });

  assert.equal(state.status, "uploaded");
  assert.equal(state.uploadId, UPLOAD_ID);
  assert.equal(extractionCalls, 0);
});

test("unauthenticated users cannot prepare, upload, or confirm", async () => {
  const { client, state } = createFakeClient({ session: null });
  const uploads = new SupabaseUploadRepository(client);
  const transport = new SupabaseScreenshotUploadTransport(
    client,
    async () => new ArrayBuffer(4),
  );

  await assert.rejects(
    uploads.prepare({ byteSize: 4, mimeType: "image/png", originalFileName: "x.png" }),
    { code: "unauthenticated", retryable: false },
  );
  await assert.rejects(transport.upload({ file: FILE, prepared: PREPARED }), {
    code: "unauthenticated",
  });
  await assert.rejects(uploads.markUploaded(UPLOAD_ID), {
    code: "unauthenticated",
  });
  assert.equal(state.functionCalls.length, 0);
  assert.equal(state.storageCalls.length, 0);
});

test("prepare-upload contract failures preserve stable server errors", async () => {
  const responses = new Map([
    [
      "prepare-upload",
      {
        data: {
          code: "validation_failed",
          message: "The request payload is invalid",
          retryable: false,
        },
        error: { name: "FunctionsHttpError" },
      },
    ],
  ]);
  const { client } = createFakeClient({ functionResponses: responses });

  await assert.rejects(
    new SupabaseUploadRepository(client).prepare({
      byteSize: 4,
      mimeType: "image/png",
      originalFileName: "x.png",
    }),
    { code: "validation_failed", retryable: false },
  );
});

test("Storage failure is never reported as uploaded or confirmed", async () => {
  const { client, state } = createFakeClient({
    storageError: { code: "storage_unavailable" },
  });
  const uploads = new SupabaseUploadRepository(client);
  const transport = new SupabaseScreenshotUploadTransport(
    client,
    async () => new ArrayBuffer(4),
  );
  const prepared = await uploads.prepare({
    byteSize: 4,
    mimeType: "image/png",
    originalFileName: "x.png",
  });

  await assert.rejects(transport.upload({ file: FILE, prepared }), {
    code: "upload_failed",
  });
  assert.deepEqual(
    state.functionCalls.map((call) => call.name),
    ["prepare-upload"],
  );
});

test("confirmation failure is never reported as completed", async () => {
  const responses = new Map([
    ["prepare-upload", { data: PREPARED, error: null }],
    [
      "mark-uploaded",
      {
        data: null,
        error: { code: "confirmation_unavailable" },
      },
    ],
  ]);
  const { client } = createFakeClient({ functionResponses: responses });
  const uploads = new SupabaseUploadRepository(client);

  await assert.rejects(uploads.markUploaded(UPLOAD_ID), {
    code: "upload_failed",
    retryable: true,
  });
});

test("invalid MIME, size, and injected ownership fields are rejected before prepare", async () => {
  const { client, state } = createFakeClient();
  const uploads = new SupabaseUploadRepository(client);

  await assert.rejects(
    uploads.prepare({
      byteSize: 4,
      mimeType: "image/gif",
      originalFileName: "x.gif",
    } as never),
    { code: "validation_failed" },
  );
  await assert.rejects(
    uploads.prepare({
      byteSize: 10 * 1024 * 1024 + 1,
      mimeType: "image/png",
      originalFileName: "x.png",
    }),
    { code: "validation_failed" },
  );
  await assert.rejects(
    uploads.prepare({
      byteSize: 4,
      mimeType: "image/png",
      originalFileName: "x.png",
      storagePath: "another-user/forged/source",
      userId: "another-user",
    } as never),
    { code: "validation_failed" },
  );
  assert.equal(state.functionCalls.length, 0);
});

test("file byte mismatch is rejected before contacting Storage", async () => {
  const { client, state } = createFakeClient();
  const transport = new SupabaseScreenshotUploadTransport(
    client,
    async () => new ArrayBuffer(3),
  );

  await assert.rejects(transport.upload({ file: FILE, prepared: PREPARED }), {
    code: "validation_failed",
  });
  assert.equal(state.storageCalls.length, 0);
});

test("expired function sessions map to unauthenticated", async () => {
  const response = new Response(
    JSON.stringify({
      code: "unauthenticated",
      message: "A valid authenticated session is required",
      retryable: false,
    }),
    { status: 401 },
  );
  const responses = new Map([
    [
      "prepare-upload",
      {
        data: null,
        error: { context: response, name: "FunctionsHttpError" },
      },
    ],
  ]);
  const { client } = createFakeClient({ functionResponses: responses });

  await assert.rejects(
    new SupabaseUploadRepository(client).prepare({
      byteSize: 4,
      mimeType: "image/png",
      originalFileName: "x.png",
    }),
    { code: "unauthenticated", retryable: false },
  );
});
