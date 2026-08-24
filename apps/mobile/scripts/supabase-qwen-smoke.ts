import { pathToFileURL } from "node:url";

import {
  IntakeSmokeError,
  runSupabaseIntakeSmoke,
} from "./supabase-intake-smoke";
import { loadSmokeEnvironment } from "./smoke-env";
import { isContractErrorShape } from "../src/services/service-error";

async function main() {
  loadSmokeEnvironment([
    ".env.local",
    ".env.auth-smoke.local",
    ".env.intake-smoke.local",
    ".env.qwen-smoke.local",
  ]);
  try {
    const result = await runSupabaseIntakeSmoke({
      CLIENTFLOW_AUTH_TEST_EMAIL: process.env.CLIENTFLOW_AUTH_TEST_EMAIL,
      CLIENTFLOW_AUTH_TEST_EMAIL_B: process.env.CLIENTFLOW_AUTH_TEST_EMAIL_B,
      CLIENTFLOW_AUTH_TEST_PASSWORD: process.env.CLIENTFLOW_AUTH_TEST_PASSWORD,
      CLIENTFLOW_AUTH_TEST_PASSWORD_B:
        process.env.CLIENTFLOW_AUTH_TEST_PASSWORD_B,
      CLIENTFLOW_EXPECTED_AI_PROVIDER: "qwen",
      CLIENTFLOW_STORAGE_TEST_IMAGE: resolveQwenSmokeImage(
        process.env.CLIENTFLOW_STORAGE_TEST_IMAGE,
        process.env.CLIENTFLOW_AI_TEST_IMAGE_COMPLETE,
      ),
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    });
    console.log(JSON.stringify({ check: "supabase-qwen-intake", ...result }));
  } catch (error) {
    const safeError = toSafeQwenSmokeError(error);
    console.error(
      JSON.stringify({
        check: "supabase-qwen-intake",
        code: safeError.code,
        message: safeError.message,
        status: "failed",
      }),
    );
    process.exitCode = 1;
  }
}

export function toSafeQwenSmokeError(error: unknown): IntakeSmokeError {
  if (error instanceof IntakeSmokeError) return error;
  if (isContractErrorShape(error)) {
    return new IntakeSmokeError(error.code, error.message);
  }
  return new IntakeSmokeError(
    "qwen_smoke_failed",
    "Unexpected Qwen smoke failure.",
  );
}

export function resolveQwenSmokeImage(
  storageImage: string | undefined,
  completeAccuracyImage: string | undefined,
): string | undefined {
  return storageImage?.trim() || completeAccuracyImage?.trim() || undefined;
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPoint === import.meta.url) void main();
