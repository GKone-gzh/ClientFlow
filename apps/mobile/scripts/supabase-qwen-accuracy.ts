import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

import {
  AIExtractionResultSchema,
  type AIExtractionResult,
} from "@clientflow/contracts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readAppEnvironment } from "../src/services/app-environment";
import { SupabaseIntakeAdapter } from "../src/services/supabase/supabase-intake-adapter";
import { createSupabaseUploadAdapter } from "../src/services/supabase/supabase-upload-adapter";
import { imageMimeType } from "./supabase-storage-smoke";
import { loadSmokeEnvironment } from "./smoke-env";

export const ACCURACY_CASES = [
  "complete",
  "missing_name",
  "amount_and_date",
  "multiple_requirements",
  "ambiguous",
] as const;

type AccuracyCase = (typeof ACCURACY_CASES)[number];

interface AccuracyEnvironment {
  CLIENTFLOW_AI_TEST_IMAGE_AMBIGUOUS?: string;
  CLIENTFLOW_AI_TEST_IMAGE_AMOUNT_DATE?: string;
  CLIENTFLOW_AI_TEST_IMAGE_COMPLETE?: string;
  CLIENTFLOW_AI_TEST_IMAGE_MISSING_NAME?: string;
  CLIENTFLOW_AI_TEST_IMAGE_MULTIPLE_REQUIREMENTS?: string;
  CLIENTFLOW_AUTH_TEST_EMAIL?: string;
  CLIENTFLOW_AUTH_TEST_PASSWORD?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
}

export class AccuracySmokeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AccuracySmokeError";
  }
}

export function evaluateAccuracyCase(
  caseName: AccuracyCase,
  unknownResult: unknown,
) {
  const parsed = AIExtractionResultSchema.safeParse(unknownResult);
  if (!parsed.success) {
    throw new AccuracySmokeError(
      "schema_invalid",
      "The Qwen extraction failed the shared schema.",
    );
  }

  const result = parsed.data;
  const casePassed = matchesCaseExpectation(caseName, result);
  if (!casePassed) {
    throw new AccuracySmokeError(
      "accuracy_expectation_failed",
      `The ${caseName} extraction missed its non-sensitive acceptance rule.`,
    );
  }

  return {
    case: caseName,
    hasBudget: result.project.budgetAmount !== null,
    hasDueDate: result.project.dueDate !== null,
    placeholderClient: result.client.name === "待确认客户",
    requirementCount: result.requirements.length,
    schemaValid: true,
    warningCount: result.warnings.length,
  } as const;
}

export async function runQwenAccuracySmoke(source: AccuracyEnvironment) {
  const environment = readAppEnvironment({
    appAdapter: "supabase",
    supabasePublishableKey: source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseUrl: source.EXPO_PUBLIC_SUPABASE_URL,
  });
  if (environment.adapter !== "supabase") {
    throw new AccuracySmokeError(
      "invalid_configuration",
      "Supabase mode is required.",
    );
  }

  const email = requireValue(
    source.CLIENTFLOW_AUTH_TEST_EMAIL,
    "CLIENTFLOW_AUTH_TEST_EMAIL",
  );
  const password = requireValue(
    source.CLIENTFLOW_AUTH_TEST_PASSWORD,
    "CLIENTFLOW_AUTH_TEST_PASSWORD",
  );
  const imagePaths = readImagePaths(source);
  const client = createClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    throw new AccuracySmokeError(
      "sign_in_failed",
      "The real Supabase test account could not sign in.",
    );
  }

  try {
    const results = [];
    for (const caseName of ACCURACY_CASES) {
      const imagePath = imagePaths[caseName];
      const imageResult = await uploadAndExtract(client, imagePath);
      results.push(evaluateAccuracyCase(caseName, imageResult));
    }
    return {
      caseCount: results.length,
      cases: results,
      model: "qwen3-vl-plus",
      provider: "qwen",
      status: "passed",
    } as const;
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}

function matchesCaseExpectation(
  caseName: AccuracyCase,
  result: AIExtractionResult,
): boolean {
  if (caseName === "complete") {
    return result.client.name !== "待确认客户";
  }
  if (caseName === "missing_name") {
    return result.client.name === "待确认客户" && result.warnings.length > 0;
  }
  if (caseName === "amount_and_date") {
    return (
      result.project.budgetAmount !== null && result.project.dueDate !== null
    );
  }
  if (caseName === "multiple_requirements") {
    return result.requirements.length >= 2;
  }
  return result.warnings.length > 0;
}

async function uploadAndExtract(
  client: SupabaseClient,
  imagePath: string,
): Promise<unknown> {
  const imageStat = await stat(imagePath);
  if (!imageStat.isFile()) {
    throw new AccuracySmokeError(
      "invalid_image",
      "Every accuracy fixture must be an image file.",
    );
  }
  const imageBytes = await readFile(imagePath);
  if (imageBytes.byteLength < 1 || imageBytes.byteLength > 10 * 1024 * 1024) {
    throw new AccuracySmokeError(
      "invalid_image",
      "Every accuracy fixture must be between 1 byte and 10 MiB.",
    );
  }
  const mimeType = imageMimeType(imagePath);
  const uploadAdapter = createSupabaseUploadAdapter(client, {
    readFile: async () => exactArrayBuffer(imageBytes),
  });
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
  await uploadAdapter.uploads.markUploaded(prepared.uploadId);

  const extraction = await new SupabaseIntakeAdapter(client).requestExtraction(
    prepared.uploadId,
  );
  if (
    extraction.status !== "needs_review" ||
    extraction.provider !== "qwen" ||
    extraction.model !== "qwen3-vl-plus"
  ) {
    throw new AccuracySmokeError(
      "extraction_not_ready",
      "The Qwen extraction did not reach needs_review.",
    );
  }
  return extraction.result;
}

function readImagePaths(source: AccuracyEnvironment) {
  return {
    ambiguous: requireValue(
      source.CLIENTFLOW_AI_TEST_IMAGE_AMBIGUOUS,
      "CLIENTFLOW_AI_TEST_IMAGE_AMBIGUOUS",
    ),
    amount_and_date: requireValue(
      source.CLIENTFLOW_AI_TEST_IMAGE_AMOUNT_DATE,
      "CLIENTFLOW_AI_TEST_IMAGE_AMOUNT_DATE",
    ),
    complete: requireValue(
      source.CLIENTFLOW_AI_TEST_IMAGE_COMPLETE,
      "CLIENTFLOW_AI_TEST_IMAGE_COMPLETE",
    ),
    missing_name: requireValue(
      source.CLIENTFLOW_AI_TEST_IMAGE_MISSING_NAME,
      "CLIENTFLOW_AI_TEST_IMAGE_MISSING_NAME",
    ),
    multiple_requirements: requireValue(
      source.CLIENTFLOW_AI_TEST_IMAGE_MULTIPLE_REQUIREMENTS,
      "CLIENTFLOW_AI_TEST_IMAGE_MULTIPLE_REQUIREMENTS",
    ),
  } satisfies Record<AccuracyCase, string>;
}

function exactArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function requireValue(value: string | undefined, variable: string): string {
  if (!value?.trim()) {
    throw new AccuracySmokeError(
      "missing_configuration",
      `Missing required accuracy environment variable: ${variable}`,
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
    const result = await runQwenAccuracySmoke({
      CLIENTFLOW_AI_TEST_IMAGE_AMBIGUOUS:
        process.env.CLIENTFLOW_AI_TEST_IMAGE_AMBIGUOUS,
      CLIENTFLOW_AI_TEST_IMAGE_AMOUNT_DATE:
        process.env.CLIENTFLOW_AI_TEST_IMAGE_AMOUNT_DATE,
      CLIENTFLOW_AI_TEST_IMAGE_COMPLETE:
        process.env.CLIENTFLOW_AI_TEST_IMAGE_COMPLETE,
      CLIENTFLOW_AI_TEST_IMAGE_MISSING_NAME:
        process.env.CLIENTFLOW_AI_TEST_IMAGE_MISSING_NAME,
      CLIENTFLOW_AI_TEST_IMAGE_MULTIPLE_REQUIREMENTS:
        process.env.CLIENTFLOW_AI_TEST_IMAGE_MULTIPLE_REQUIREMENTS,
      CLIENTFLOW_AUTH_TEST_EMAIL: process.env.CLIENTFLOW_AUTH_TEST_EMAIL,
      CLIENTFLOW_AUTH_TEST_PASSWORD: process.env.CLIENTFLOW_AUTH_TEST_PASSWORD,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    });
    console.log(JSON.stringify({ check: "qwen-accuracy", ...result }));
  } catch (error) {
    const safeError =
      error instanceof AccuracySmokeError
        ? error
        : new AccuracySmokeError(
            "accuracy_smoke_failed",
            "Unexpected Qwen accuracy smoke failure.",
          );
    console.error(
      JSON.stringify({
        check: "qwen-accuracy",
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
