import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

import {
  AIExtractionResultSchema,
  type AIExtractionResult,
} from "@clientflow/contracts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadClientDetail } from "../src/features/clients/client-detail";
import { readAppEnvironment } from "../src/services/app-environment";
import { AppServiceError } from "../src/services/service-error";
import { createSupabaseBusinessRepositories } from "../src/services/supabase/supabase-business-repositories";
import { SupabaseIntakeAdapter } from "../src/services/supabase/supabase-intake-adapter";
import { createSupabaseUploadAdapter } from "../src/services/supabase/supabase-upload-adapter";
import { imageMimeType } from "./supabase-storage-smoke";
import { loadSmokeEnvironment } from "./smoke-env";

export interface IntakeSmokeEnvironment {
  CLIENTFLOW_AUTH_TEST_EMAIL?: string;
  CLIENTFLOW_AUTH_TEST_EMAIL_B?: string;
  CLIENTFLOW_AUTH_TEST_PASSWORD?: string;
  CLIENTFLOW_AUTH_TEST_PASSWORD_B?: string;
  CLIENTFLOW_STORAGE_TEST_IMAGE?: string;
  CLIENTFLOW_EXPECTED_AI_PROVIDER?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
}

export class IntakeSmokeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IntakeSmokeError";
  }
}

export function requireIsolationCredentials(source: IntakeSmokeEnvironment) {
  return {
    email: requireValue(
      source.CLIENTFLOW_AUTH_TEST_EMAIL_B,
      "CLIENTFLOW_AUTH_TEST_EMAIL_B",
    ),
    password: requireValue(
      source.CLIENTFLOW_AUTH_TEST_PASSWORD_B,
      "CLIENTFLOW_AUTH_TEST_PASSWORD_B",
    ),
  };
}

export function requireExpectedProvider(value: string | undefined) {
  const provider = value?.trim().toLowerCase() || "stub";
  if (provider !== "stub" && provider !== "qwen") {
    throw new IntakeSmokeError(
      "invalid_expected_provider",
      "Expected AI provider must be stub or qwen.",
    );
  }
  return provider;
}

export async function runSupabaseIntakeSmoke(source: IntakeSmokeEnvironment) {
  const expectedProvider = requireExpectedProvider(
    source.CLIENTFLOW_EXPECTED_AI_PROVIDER,
  );
  const environment = readAppEnvironment({
    appAdapter: "supabase",
    supabasePublishableKey: source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseUrl: source.EXPO_PUBLIC_SUPABASE_URL,
  });
  if (environment.adapter !== "supabase") {
    throw new IntakeSmokeError("invalid_configuration", "Supabase mode is required.");
  }

  const userACredentials = {
    email: requireValue(
      source.CLIENTFLOW_AUTH_TEST_EMAIL,
      "CLIENTFLOW_AUTH_TEST_EMAIL",
    ),
    password: requireValue(
      source.CLIENTFLOW_AUTH_TEST_PASSWORD,
      "CLIENTFLOW_AUTH_TEST_PASSWORD",
    ),
  };
  const userBCredentials = requireIsolationCredentials(source);
  if (
    userACredentials.email.toLowerCase() ===
    userBCredentials.email.toLowerCase()
  ) {
    throw new IntakeSmokeError(
      "invalid_isolation_accounts",
      "User A and User B must be different Supabase accounts.",
    );
  }
  const imagePath = requireValue(
    source.CLIENTFLOW_STORAGE_TEST_IMAGE,
    "CLIENTFLOW_STORAGE_TEST_IMAGE",
  );
  const imageStat = await stat(imagePath);
  if (!imageStat.isFile()) {
    throw new IntakeSmokeError("invalid_image", "Intake smoke image must be a file.");
  }
  const mimeType = imageMimeType(imagePath);
  const imageBytes = await readFile(imagePath);
  if (imageBytes.byteLength <= 0 || imageBytes.byteLength > 10 * 1024 * 1024) {
    throw new IntakeSmokeError(
      "invalid_image",
      "Intake smoke image must be between 1 byte and 10 MiB.",
    );
  }

  const userA = createSmokeClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
  );
  const userB = createSmokeClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
  );
  const signedInA = await signIn(userA, userACredentials, "user_a_sign_in_failed");

  try {
    const uploadAdapter = createSupabaseUploadAdapter(userA, {
      readFile: async () => exactArrayBuffer(imageBytes),
    });
    const intake = new SupabaseIntakeAdapter(userA);
    const repositories = createSupabaseBusinessRepositories(userA);
    const prepared = await uploadAdapter.uploads.prepare({
      byteSize: imageBytes.byteLength,
      mimeType,
      originalFileName: basename(imagePath),
    });
    await uploadAdapter.screenshotUpload.upload({
      prepared,
      file: {
        byteSize: imageBytes.byteLength,
        mimeType,
        uri: pathToFileURL(imagePath).href,
      },
    });
    const uploaded = await uploadAdapter.uploads.markUploaded(prepared.uploadId);
    requireCondition(
      uploaded.userId === signedInA.user.id && uploaded.status === "uploaded",
      "upload_not_confirmed",
      "The real upload was not confirmed for user A.",
    );

    const extractionStartedAt = performance.now();
    const extraction = await intake.requestExtraction(prepared.uploadId);
    const extractionDurationMs = Math.round(
      performance.now() - extractionStartedAt,
    );
    const expectedModel =
      expectedProvider === "qwen" ? "qwen3-vl-plus" : "configured-result-v1";
    requireCondition(
      extraction.uploadId === prepared.uploadId &&
        extraction.userId === signedInA.user.id &&
        extraction.status === "needs_review" &&
        extraction.provider === expectedProvider &&
        extraction.model === expectedModel,
      "extraction_not_ready",
      "The expected server extraction did not reach needs_review.",
    );
    const reviewResult = await intake.getValidatedResult(extraction.id);
    const validatedReview = AIExtractionResultSchema.safeParse(reviewResult);
    requireCondition(
      validatedReview.success,
      "invalid_review_result",
      "The fetched extraction result failed the shared schema.",
    );

    const editedResult = editForSmoke(validatedReview.data);
    const firstConfirmation = await intake.confirm({
      extractionId: extraction.id,
      result: editedResult,
    });
    const replayedConfirmation = await intake.confirm({
      extractionId: extraction.id,
      result: {
        ...editedResult,
        client: { ...editedResult.client, name: "Ignored idempotency replay" },
      },
    });
    requireCondition(
      JSON.stringify(firstConfirmation) === JSON.stringify(replayedConfirmation),
      "confirmation_not_idempotent",
      "Retrying confirmation returned different entity identifiers.",
    );

    const confirmedExtraction = await intake.getById(extraction.id);
    const completedUpload = await uploadAdapter.uploads.getById(prepared.uploadId);
    const detail = await loadClientDetail(
      repositories,
      firstConfirmation.clientId,
    );
    requireCondition(
      confirmedExtraction?.status === "confirmed" &&
        completedUpload?.status === "completed",
      "final_state_invalid",
      "The persisted upload/extraction state was not final.",
    );
    requireCondition(
      detail?.client.id === firstConfirmation.clientId &&
        detail.projects.some(
          ({ project, requirements, tasks }) =>
            project.id === firstConfirmation.projectId &&
            requirements.length === firstConfirmation.requirementIds.length &&
            tasks.length === firstConfirmation.taskIds.length,
        ),
      "client_detail_invalid",
      "The real Client Detail graph did not match confirmation.",
    );

    await signIn(userB, userBCredentials, "user_b_sign_in_failed");
    await verifyCrossUserIsolation(userB, {
      clientId: firstConfirmation.clientId,
      extractionId: extraction.id,
      projectId: firstConfirmation.projectId,
      result: editedResult,
      uploadId: prepared.uploadId,
    });

    return {
      aiModel: expectedModel,
      aiProvider: expectedProvider,
      clientDetailRead: true,
      confirmed: true,
      crossUserRejected: true,
      idempotent: true,
      extractionDurationMs,
      projectCount: detail.projects.length,
      requirementCount: firstConfirmation.requirementIds.length,
      status: "passed",
      taskCount: firstConfirmation.taskIds.length,
      uploadFinalStatus: completedUpload.status,
    } as const;
  } finally {
    await Promise.all([
      userA.auth.signOut({ scope: "local" }),
      userB.auth.signOut({ scope: "local" }),
    ]);
  }
}

async function verifyCrossUserIsolation(
  client: SupabaseClient,
  resource: {
    clientId: string;
    extractionId: string;
    projectId: string;
    result: AIExtractionResult;
    uploadId: string;
  },
) {
  const uploads = createSupabaseUploadAdapter(client).uploads;
  const intake = new SupabaseIntakeAdapter(client);
  const repositories = createSupabaseBusinessRepositories(client);
  const [upload, extraction, customer, project, requirements, tasks] =
    await Promise.all([
      uploads.getById(resource.uploadId),
      intake.getById(resource.extractionId),
      repositories.clients.getById(resource.clientId),
      repositories.projects.getById(resource.projectId),
      repositories.requirements.listByProject(resource.projectId),
      repositories.tasks.listByProject(resource.projectId),
    ]);
  requireCondition(
    upload === null &&
      extraction === null &&
      customer === null &&
      project === null &&
      requirements.length === 0 &&
      tasks.length === 0,
    "cross_user_read_visible",
    "User B could read a User A resource.",
  );

  await expectRejected(
    () => intake.requestExtraction(resource.uploadId),
    "cross_user_extraction_allowed",
  );
  await expectRejected(
    () =>
      intake.confirm({
        extractionId: resource.extractionId,
        result: resource.result,
      }),
    "cross_user_confirmation_allowed",
  );
}

async function expectRejected(action: () => Promise<unknown>, code: string) {
  try {
    await action();
  } catch (error) {
    if (
      error instanceof AppServiceError &&
      ["forbidden", "not_found"].includes(error.code)
    ) {
      return;
    }
    throw new IntakeSmokeError(code, "Cross-user denial returned an unstable error.");
  }
  throw new IntakeSmokeError(code, "A cross-user mutation unexpectedly succeeded.");
}

function createSmokeClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(
  client: SupabaseClient,
  credentials: { email: string; password: string },
  code: string,
) {
  const result = await client.auth.signInWithPassword(credentials);
  if (result.error || !result.data.session || !result.data.user) {
    throw new IntakeSmokeError(code, "A real Supabase test account could not sign in.");
  }
  return result.data;
}

function editForSmoke(result: AIExtractionResult): AIExtractionResult {
  return {
    ...result,
    client: { ...result.client, name: `${result.client.name} Reviewed` },
    project: { ...result.project, summary: "Reviewed during real intake smoke" },
  };
}

function exactArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function requireCondition(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new IntakeSmokeError(code, message);
}

function requireValue(value: string | undefined, variable: string) {
  if (!value?.trim()) {
    throw new IntakeSmokeError(
      "missing_configuration",
      `Missing required smoke environment variable: ${variable}`,
    );
  }
  return value.trim();
}

async function main() {
  loadSmokeEnvironment([".env.local", ".env.intake-smoke.local"]);
  try {
    const result = await runSupabaseIntakeSmoke({
      CLIENTFLOW_AUTH_TEST_EMAIL: process.env.CLIENTFLOW_AUTH_TEST_EMAIL,
      CLIENTFLOW_AUTH_TEST_EMAIL_B: process.env.CLIENTFLOW_AUTH_TEST_EMAIL_B,
      CLIENTFLOW_AUTH_TEST_PASSWORD: process.env.CLIENTFLOW_AUTH_TEST_PASSWORD,
      CLIENTFLOW_AUTH_TEST_PASSWORD_B: process.env.CLIENTFLOW_AUTH_TEST_PASSWORD_B,
      CLIENTFLOW_STORAGE_TEST_IMAGE: process.env.CLIENTFLOW_STORAGE_TEST_IMAGE,
      CLIENTFLOW_EXPECTED_AI_PROVIDER:
        process.env.CLIENTFLOW_EXPECTED_AI_PROVIDER,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    });
    console.log(JSON.stringify({ check: "supabase-intake", ...result }));
  } catch (error) {
    const safeError =
      error instanceof IntakeSmokeError
        ? error
        : new IntakeSmokeError(
            "intake_smoke_failed",
            "Unexpected Intake smoke failure.",
          );
    console.error(
      JSON.stringify({
        check: "supabase-intake",
        code: safeError.code,
        message: safeError.message,
        status: "failed",
      }),
    );
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPoint === import.meta.url) void main();
