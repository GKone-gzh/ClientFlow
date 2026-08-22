import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  readAuthSmokeConfiguration,
  runSupabaseAuthSmoke,
} from "./supabase-auth-smoke";

const CONFIGURATION = {
  email: "auth-smoke@example.com",
  password: "not-a-real-secret",
  supabasePublishableKey: "sb_publishable_test",
  supabaseUrl: "https://example.supabase.co",
};

test("requires only public project configuration plus isolated test credentials", () => {
  assert.deepEqual(
    readAuthSmokeConfiguration({
      CLIENTFLOW_AUTH_TEST_EMAIL: " Auth-Smoke@Example.com ",
      CLIENTFLOW_AUTH_TEST_PASSWORD: CONFIGURATION.password,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CONFIGURATION.supabasePublishableKey,
      EXPO_PUBLIC_SUPABASE_URL: `${CONFIGURATION.supabaseUrl}/`,
    }),
    CONFIGURATION,
  );
  assert.throws(
    () =>
      readAuthSmokeConfiguration({
        CLIENTFLOW_AUTH_TEST_EMAIL: CONFIGURATION.email,
        CLIENTFLOW_AUTH_TEST_PASSWORD: CONFIGURATION.password,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden",
        EXPO_PUBLIC_SUPABASE_URL: CONFIGURATION.supabaseUrl,
      }),
    { code: "invalid_configuration" },
  );
});

test("verifies sign-up, sign-in, persisted restore, and sign-out", async () => {
  const storageKey = "auth-session";
  const user = { id: "00000000-0000-4000-8000-000000000001" };
  const session = { user };
  const calls: string[] = [];

  const result = await runSupabaseAuthSmoke(CONFIGURATION, (_url, _key, options) => {
    const storage = options.auth?.storage;
    assert.ok(storage);
    return {
      auth: {
        getSession: async () => {
          calls.push("getSession");
          return {
            data: {
              session: (await storage.getItem(storageKey)) ? session : null,
            },
            error: null,
          };
        },
        signInWithPassword: async () => {
          calls.push("signIn");
          await storage.setItem(storageKey, "persisted");
          return { data: { session, user }, error: null };
        },
        signOut: async () => {
          calls.push("signOut");
          await storage.removeItem(storageKey);
          return { error: null };
        },
        signUp: async () => {
          calls.push("signUp");
          return { data: { session: null, user }, error: null };
        },
      },
    } as unknown as SupabaseClient;
  });

  assert.deepEqual(result, {
    emailConfirmationRequired: true,
    userId: user.id,
  });
  assert.deepEqual(calls, ["signUp", "signIn", "getSession", "signOut", "getSession"]);
});

test("reports email confirmation as an actionable acceptance blocker", async () => {
  await assert.rejects(
    runSupabaseAuthSmoke(CONFIGURATION, () =>
      ({
        auth: {
          signUp: async () => ({
            data: { session: null, user: { id: "pending-user" } },
            error: null,
          }),
          signInWithPassword: async () => ({
            data: { session: null, user: null },
            error: {
              code: "email_not_confirmed",
              message: "Email not confirmed",
            },
          }),
        },
      }) as unknown as SupabaseClient,
    ),
    { code: "email_confirmation_required" },
  );
});
