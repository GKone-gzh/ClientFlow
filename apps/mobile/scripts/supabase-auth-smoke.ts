import { pathToFileURL } from "node:url";

import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";

import { readAppEnvironment } from "../src/services/app-environment";

const EXISTING_USER_CODES = new Set(["email_exists", "user_already_exists"]);

export interface AuthSmokeEnvironment {
  CLIENTFLOW_AUTH_TEST_EMAIL?: string;
  CLIENTFLOW_AUTH_TEST_PASSWORD?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
}

export interface AuthSmokeConfiguration {
  email: string;
  password: string;
  supabasePublishableKey: string;
  supabaseUrl: string;
}

export interface AuthSmokeResult {
  emailConfirmationRequired: boolean;
  userId: string;
}

type ClientFactory = (
  url: string,
  key: string,
  options: SupabaseClientOptions<"public">,
) => SupabaseClient;

export class AuthSmokeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthSmokeError";
  }
}

export function readAuthSmokeConfiguration(
  source: AuthSmokeEnvironment,
): AuthSmokeConfiguration {
  let appEnvironment;
  try {
    appEnvironment = readAppEnvironment({
      appAdapter: "supabase",
      supabasePublishableKey: source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      supabaseUrl: source.EXPO_PUBLIC_SUPABASE_URL,
    });
  } catch (error) {
    throw new AuthSmokeError(
      "invalid_configuration",
      error instanceof Error ? error.message : "Invalid Supabase public configuration.",
    );
  }
  if (appEnvironment.adapter !== "supabase") {
    throw new AuthSmokeError("invalid_configuration", "Supabase mode is required.");
  }

  return {
    email: requireSmokeValue(source.CLIENTFLOW_AUTH_TEST_EMAIL, "CLIENTFLOW_AUTH_TEST_EMAIL")
      .trim()
      .toLowerCase(),
    password: requireSmokeValue(
      source.CLIENTFLOW_AUTH_TEST_PASSWORD,
      "CLIENTFLOW_AUTH_TEST_PASSWORD",
    ),
    supabasePublishableKey: appEnvironment.supabasePublishableKey,
    supabaseUrl: appEnvironment.supabaseUrl,
  };
}

export async function runSupabaseAuthSmoke(
  configuration: AuthSmokeConfiguration,
  clientFactory: ClientFactory = createClient,
): Promise<AuthSmokeResult> {
  const storage = new MemoryStorage();
  const firstClient = createSmokeClient(configuration, storage, clientFactory);
  const signUp = await firstClient.auth.signUp({
    email: configuration.email,
    password: configuration.password,
  });
  if (signUp.error && !EXISTING_USER_CODES.has(signUp.error.code ?? "")) {
    throw providerError("sign_up_failed", signUp.error);
  }

  const signIn = await firstClient.auth.signInWithPassword({
    email: configuration.email,
    password: configuration.password,
  });
  if (signIn.error?.code === "email_not_confirmed") {
    throw new AuthSmokeError(
      "email_confirmation_required",
      "Registration reached Supabase, but this project requires email confirmation. Confirm the test account email, then run the smoke again.",
    );
  }
  if (signIn.error) throw providerError("sign_in_failed", signIn.error);
  if (!signIn.data.session || !signIn.data.user) {
    throw new AuthSmokeError(
      "missing_session",
      "Supabase sign-in succeeded without returning a session and user.",
    );
  }

  const signedInUserId = signIn.data.user.id;
  const restoredClient = createSmokeClient(configuration, storage, clientFactory);
  const restored = await restoredClient.auth.getSession();
  if (restored.error) throw providerError("session_restore_failed", restored.error);
  if (restored.data.session?.user.id !== signedInUserId) {
    throw new AuthSmokeError(
      "session_restore_failed",
      "A new client could not restore the signed-in user's persisted session.",
    );
  }

  const signedOut = await restoredClient.auth.signOut();
  if (signedOut.error) throw providerError("sign_out_failed", signedOut.error);

  const signedOutClient = createSmokeClient(configuration, storage, clientFactory);
  const afterSignOut = await signedOutClient.auth.getSession();
  if (afterSignOut.error) throw providerError("sign_out_check_failed", afterSignOut.error);
  if (afterSignOut.data.session) {
    throw new AuthSmokeError(
      "session_not_cleared",
      "The persisted session remained available after sign-out.",
    );
  }

  return {
    emailConfirmationRequired: signUp.data.session === null,
    userId: signedInUserId,
  };
}

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  removeItem(key: string) {
    this.values.delete(key);
    return Promise.resolve();
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function createSmokeClient(
  configuration: AuthSmokeConfiguration,
  storage: MemoryStorage,
  clientFactory: ClientFactory,
) {
  return clientFactory(
    configuration.supabaseUrl,
    configuration.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
        storage,
      },
    },
  );
}

function requireSmokeValue(value: string | undefined, variable: string) {
  if (!value?.trim()) {
    throw new AuthSmokeError(
      "missing_configuration",
      `Missing required smoke environment variable: ${variable}`,
    );
  }
  return value;
}

function providerError(code: string, error: { code?: string; message: string }) {
  return new AuthSmokeError(
    code,
    `${error.message}${error.code ? ` (${error.code})` : ""}`,
  );
}

async function main() {
  try {
    const configuration = readAuthSmokeConfiguration({
      CLIENTFLOW_AUTH_TEST_EMAIL: process.env.CLIENTFLOW_AUTH_TEST_EMAIL,
      CLIENTFLOW_AUTH_TEST_PASSWORD: process.env.CLIENTFLOW_AUTH_TEST_PASSWORD,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    });
    const result = await runSupabaseAuthSmoke(configuration);
    console.log(
      JSON.stringify({
        check: "supabase-auth",
        emailConfirmationRequired: result.emailConfirmationRequired,
        status: "passed",
        userId: result.userId,
      }),
    );
  } catch (error) {
    const safeError =
      error instanceof AuthSmokeError
        ? error
        : new AuthSmokeError("unexpected_error", "Unexpected auth smoke failure.");
    console.error(
      JSON.stringify({
        check: "supabase-auth",
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
