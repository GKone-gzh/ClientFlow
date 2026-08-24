import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

import type { AIExtraction } from "@clientflow/contracts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readAppEnvironment } from "../src/services/app-environment";
import { AppServiceError } from "../src/services/service-error";
import { SupabaseIntakeAdapter } from "../src/services/supabase/supabase-intake-adapter";
import { createSupabaseUploadAdapter } from "../src/services/supabase/supabase-upload-adapter";
import { loadSmokeEnvironment } from "./smoke-env";
import { imageMimeType } from "./supabase-storage-smoke";

interface AbuseSmokeEnvironment {
  CLIENTFLOW_AI_TEST_IMAGE_COMPLETE?: string;
  CLIENTFLOW_AUTH_TEST_EMAIL?: string;
  CLIENTFLOW_AUTH_TEST_EMAIL_B?: string;
  CLIENTFLOW_AUTH_TEST_PASSWORD?: string;
  CLIENTFLOW_AUTH_TEST_PASSWORD_B?: string;
  CLIENTFLOW_STORAGE_TEST_IMAGE?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
}

type Actor = "A" | "B";
type UploadSlot = "a1" | "a2" | "b1";

interface SuccessfulRequest {
  actor: Actor;
  extraction: AIExtraction;
  uploadSlot: UploadSlot;
}

export class AbuseSmokeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AbuseSmokeError";
  }
}

export function summarizeConcurrentOutcomes(
  outcomes: PromiseSettledResult<SuccessfulRequest>[],
) {
  const fulfilled = outcomes.flatMap((outcome) =>
    outcome.status === "fulfilled" ? [outcome.value] : [],
  );
  const rejected = outcomes.flatMap((outcome) =>
    outcome.status === "rejected" ? [outcome.reason] : [],
  );
  const userASuccesses = fulfilled.filter(({ actor }) => actor === "A");
  const userBSuccesses = fulfilled.filter(({ actor }) => actor === "B");
  const stableConcurrencyRejections = rejected.filter(
    (error) => error instanceof AppServiceError && error.code === "conflict",
  );

  if (
    outcomes.length !== 4 ||
    userASuccesses.length !== 1 ||
    userBSuccesses.length !== 1 ||
    rejected.length !== 2 ||
    stableConcurrencyRejections.length !== rejected.length
  ) {
    const safeCodes = rejected.map((error) =>
      error instanceof AppServiceError ? error.code : "unknown",
    );
    throw new AbuseSmokeError(
      "concurrency_gate_failed",
      `Concurrent extraction outcome mismatch: A=${userASuccesses.length}, B=${userBSuccesses.length}, rejected=${safeCodes.join(",") || "none"}.`,
    );
  }

  return {
    stableConcurrencyRejections: stableConcurrencyRejections.length,
    userASuccess: userASuccesses[0],
    userBSuccess: userBSuccesses[0],
  };
}

export async function runSupabaseAbuseSmoke(source: AbuseSmokeEnvironment) {
  const environment = readAppEnvironment({
    appAdapter: "supabase",
    supabasePublishableKey: source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseUrl: source.EXPO_PUBLIC_SUPABASE_URL,
  });
  if (environment.adapter !== "supabase") {
    throw new AbuseSmokeError("invalid_configuration", "Supabase mode is required.");
  }

  const credentialsA = credentials(source, "");
  const credentialsB = credentials(source, "_B");
  if (credentialsA.email.toLowerCase() === credentialsB.email.toLowerCase()) {
    throw new AbuseSmokeError(
      "invalid_isolation_accounts",
      "Security smoke requires two different Supabase accounts.",
    );
  }

  const imagePath = requireValue(
    source.CLIENTFLOW_STORAGE_TEST_IMAGE?.trim() ||
      source.CLIENTFLOW_AI_TEST_IMAGE_COMPLETE?.trim(),
    "CLIENTFLOW_STORAGE_TEST_IMAGE or CLIENTFLOW_AI_TEST_IMAGE_COMPLETE",
  );
  const imageStat = await stat(imagePath);
  if (!imageStat.isFile()) {
    throw new AbuseSmokeError("invalid_image", "Security smoke image must be a file.");
  }
  const imageBytes = await readFile(imagePath);
  if (imageBytes.byteLength <= 0 || imageBytes.byteLength > 10 * 1024 * 1024) {
    throw new AbuseSmokeError(
      "invalid_image",
      "Security smoke image must be between 1 byte and 10 MiB.",
    );
  }
  const mimeType = imageMimeType(imagePath);

  const userA = createSmokeClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
  );
  const userB = createSmokeClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
  );
  await Promise.all([
    signIn(userA, credentialsA, "user_a_sign_in_failed"),
    signIn(userB, credentialsB, "user_b_sign_in_failed"),
  ]);

  try {
    const [a1, a2, b1] = await Promise.all([
      createUploadedScreenshot(userA, imagePath, imageBytes, mimeType),
      createUploadedScreenshot(userA, imagePath, imageBytes, mimeType),
      createUploadedScreenshot(userB, imagePath, imageBytes, mimeType),
    ]);
    const intakeA = new SupabaseIntakeAdapter(userA);
    const intakeB = new SupabaseIntakeAdapter(userB);

    const startedAt = performance.now();
    const outcomes = await Promise.allSettled([
      request(intakeA, "A", "a1", a1),
      request(intakeA, "A", "a1", a1),
      request(intakeA, "A", "a2", a2),
      request(intakeB, "B", "b1", b1),
    ]);
    const summary = summarizeConcurrentOutcomes(outcomes);
    assertReadyQwenExtraction(summary.userASuccess.extraction);
    assertReadyQwenExtraction(summary.userBSuccess.extraction);

    const replayed = await intakeA.requestExtraction(
      summary.userASuccess.extraction.uploadId,
    );
    if (replayed.id !== summary.userASuccess.extraction.id) {
      throw new AbuseSmokeError(
        "sequential_retry_failed",
        "Sequential retry did not return the existing extraction.",
      );
    }

    const [foreignUpload, foreignExtraction] = await Promise.all([
      createSupabaseUploadAdapter(userB).uploads.getById(
        summary.userASuccess.extraction.uploadId,
      ),
      intakeB.getById(summary.userASuccess.extraction.id),
    ]);
    if (foreignUpload !== null || foreignExtraction !== null) {
      throw new AbuseSmokeError(
        "cross_user_read_visible",
        "User B could read a User A extraction resource.",
      );
    }

    return {
      concurrentRequests: outcomes.length,
      crossUserRejected: true,
      differentUsersIndependent: true,
      durationMs: Math.round(performance.now() - startedAt),
      expectedProviderExecutions: 2,
      sameUploadSequentialRetry: true,
      stableConcurrencyRejections: summary.stableConcurrencyRejections,
      status: "passed",
    } as const;
  } finally {
    await Promise.all([
      userA.auth.signOut({ scope: "local" }),
      userB.auth.signOut({ scope: "local" }),
    ]);
  }
}

async function createUploadedScreenshot(
  client: SupabaseClient,
  imagePath: string,
  imageBytes: Buffer,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
) {
  const adapter = createSupabaseUploadAdapter(client, {
    readFile: async () => exactArrayBuffer(imageBytes),
  });
  const prepared = await adapter.uploads.prepare({
    byteSize: imageBytes.byteLength,
    mimeType,
    originalFileName: basename(imagePath),
  });
  await adapter.screenshotUpload.upload({
    prepared,
    file: {
      byteSize: imageBytes.byteLength,
      mimeType,
      uri: pathToFileURL(imagePath).href,
    },
  });
  const uploaded = await adapter.uploads.markUploaded(prepared.uploadId);
  if (uploaded.status !== "uploaded") {
    throw new AbuseSmokeError(
      "upload_not_confirmed",
      "A security-smoke upload did not reach uploaded status.",
    );
  }
  return prepared.uploadId;
}

async function request(
  intake: SupabaseIntakeAdapter,
  actor: Actor,
  uploadSlot: UploadSlot,
  uploadId: string,
): Promise<SuccessfulRequest> {
  return {
    actor,
    extraction: await intake.requestExtraction(uploadId),
    uploadSlot,
  };
}

function assertReadyQwenExtraction(extraction: AIExtraction) {
  if (
    extraction.status !== "needs_review" ||
    extraction.provider !== "qwen" ||
    extraction.model !== "qwen3-vl-plus"
  ) {
    throw new AbuseSmokeError(
      "unexpected_extraction_result",
      "A successful concurrent request did not return the configured Qwen extraction.",
    );
  }
}

function credentials(source: AbuseSmokeEnvironment, suffix: "" | "_B") {
  const emailName = `CLIENTFLOW_AUTH_TEST_EMAIL${suffix}` as const;
  const passwordName = `CLIENTFLOW_AUTH_TEST_PASSWORD${suffix}` as const;
  return {
    email: requireValue(source[emailName], emailName),
    password: requireValue(source[passwordName], passwordName),
  };
}

function createSmokeClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(
  client: SupabaseClient,
  credentialsToUse: { email: string; password: string },
  code: string,
) {
  const result = await client.auth.signInWithPassword(credentialsToUse);
  if (result.error || !result.data.session || !result.data.user) {
    throw new AbuseSmokeError(code, "A real Supabase test account could not sign in.");
  }
}

function exactArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function requireValue(value: string | undefined, variable: string) {
  if (!value?.trim()) {
    throw new AbuseSmokeError(
      "missing_configuration",
      `Missing required smoke environment variable: ${variable}`,
    );
  }
  return value.trim();
}

async function main() {
  loadSmokeEnvironment([
    ".env.local",
    ".env.auth-smoke.local",
    ".env.intake-smoke.local",
    ".env.qwen-smoke.local",
  ]);
  try {
    const result = await runSupabaseAbuseSmoke({
      CLIENTFLOW_AI_TEST_IMAGE_COMPLETE:
        process.env.CLIENTFLOW_AI_TEST_IMAGE_COMPLETE,
      CLIENTFLOW_AUTH_TEST_EMAIL: process.env.CLIENTFLOW_AUTH_TEST_EMAIL,
      CLIENTFLOW_AUTH_TEST_EMAIL_B: process.env.CLIENTFLOW_AUTH_TEST_EMAIL_B,
      CLIENTFLOW_AUTH_TEST_PASSWORD: process.env.CLIENTFLOW_AUTH_TEST_PASSWORD,
      CLIENTFLOW_AUTH_TEST_PASSWORD_B:
        process.env.CLIENTFLOW_AUTH_TEST_PASSWORD_B,
      CLIENTFLOW_STORAGE_TEST_IMAGE: process.env.CLIENTFLOW_STORAGE_TEST_IMAGE,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    });
    console.log(JSON.stringify({ check: "supabase-ai-abuse", ...result }));
  } catch (error) {
    const safeError =
      error instanceof AbuseSmokeError
        ? error
        : new AbuseSmokeError(
            "security_smoke_failed",
            "Unexpected security smoke failure.",
          );
    console.error(
      JSON.stringify({
        check: "supabase-ai-abuse",
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
