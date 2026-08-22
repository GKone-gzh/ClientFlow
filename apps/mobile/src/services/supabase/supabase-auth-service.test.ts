import assert from "node:assert/strict";
import test from "node:test";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

import { SupabaseAuthService } from "./supabase-auth-service";

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "user@example.com",
} as User;
const SESSION = { access_token: "not-exposed", user: USER } as Session;

function createAuthClient(
  overrides: Partial<SupabaseClient["auth"]> = {},
): SupabaseClient {
  const auth = {
    getSession: async () => ({ data: { session: SESSION }, error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe() {} } },
    }),
    signInWithPassword: async () => ({
      data: { session: SESSION, user: USER },
      error: null,
    }),
    signOut: async () => ({ error: null }),
    signUp: async () => ({
      data: { session: SESSION, user: USER },
      error: null,
    }),
    startAutoRefresh: async () => {},
    stopAutoRefresh: async () => {},
    ...overrides,
  };
  return { auth } as unknown as SupabaseClient;
}

test("maps Supabase sessions without exposing access or refresh tokens", async () => {
  const auth = new SupabaseAuthService(createAuthClient());

  assert.deepEqual(await auth.getSession(), {
    user: { id: USER.id, email: USER.email },
  });
  assert.equal("accessToken" in (await auth.signInWithPassword({
    email: USER.email!,
    password: "123456",
  })), false);
});

test("supports registrations that require email confirmation", async () => {
  const auth = new SupabaseAuthService(
    createAuthClient({
      signUp: async () => ({
        data: { session: null, user: USER },
        error: null,
      }),
    }),
  );

  const result = await auth.signUpWithPassword({
    email: USER.email!,
    password: "123456",
  });
  assert.equal(result.requiresEmailConfirmation, true);
  assert.equal(result.session, null);
});

test("maps provider auth failures to stable contract errors", async () => {
  const auth = new SupabaseAuthService(
    createAuthClient({
      signInWithPassword: async () => ({
        data: { session: null, user: null },
        error: { code: "invalid_credentials", status: 400 },
      }) as never,
    }),
  );

  await assert.rejects(
    auth.signInWithPassword({
      email: USER.email!,
      password: "incorrect",
    }),
    { code: "unauthenticated", retryable: false },
  );
});
