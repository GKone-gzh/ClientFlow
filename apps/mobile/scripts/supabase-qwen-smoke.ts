import { pathToFileURL } from "node:url";

import {
  IntakeSmokeError,
  runSupabaseIntakeSmoke,
} from "./supabase-intake-smoke";
import { loadSmokeEnvironment } from "./smoke-env";

async function main() {
  loadSmokeEnvironment([
    ".env.local",
    ".env.auth-smoke.local",
    ".env.intake-smoke.local",
  ]);
  try {
    const result = await runSupabaseIntakeSmoke({
      CLIENTFLOW_AUTH_TEST_EMAIL: process.env.CLIENTFLOW_AUTH_TEST_EMAIL,
      CLIENTFLOW_AUTH_TEST_EMAIL_B: process.env.CLIENTFLOW_AUTH_TEST_EMAIL_B,
      CLIENTFLOW_AUTH_TEST_PASSWORD: process.env.CLIENTFLOW_AUTH_TEST_PASSWORD,
      CLIENTFLOW_AUTH_TEST_PASSWORD_B:
        process.env.CLIENTFLOW_AUTH_TEST_PASSWORD_B,
      CLIENTFLOW_EXPECTED_AI_PROVIDER: "qwen",
      CLIENTFLOW_STORAGE_TEST_IMAGE: process.env.CLIENTFLOW_STORAGE_TEST_IMAGE,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    });
    console.log(JSON.stringify({ check: "supabase-qwen-intake", ...result }));
  } catch (error) {
    const safeError =
      error instanceof IntakeSmokeError
        ? error
        : new IntakeSmokeError(
            "qwen_smoke_failed",
            "Unexpected Qwen smoke failure.",
          );
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

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPoint === import.meta.url) void main();
