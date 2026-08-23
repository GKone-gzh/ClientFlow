import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseAuthSessionAdapter } from "./auth";
import { BackendError } from "./errors";

test("auth adapter rejects requests without constructing a Supabase client", async () => {
  let factoryCalls = 0;
  const adapter = new SupabaseAuthSessionAdapter({} as SupabaseClient, () => {
    factoryCalls += 1;
    return {} as SupabaseClient;
  });

  await assert.rejects(
    adapter.requireSession(new Request("https://example.test")),
    (error) => error instanceof BackendError && error.code === "unauthenticated",
  );
  assert.equal(factoryCalls, 0);
});

test("auth adapter verifies the bearer token with Supabase Auth", async () => {
  let verifiedToken: string | undefined;
  const verifier = {
    auth: {
      getUser: async (token: string) => {
        verifiedToken = token;
        return {
          data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
          error: null,
        };
      },
    },
  } as unknown as SupabaseClient;
  const client = {} as SupabaseClient;
  const adapter = new SupabaseAuthSessionAdapter(verifier, () => client);
  const request = new Request("https://example.test", {
    headers: { authorization: "Bearer verified-token" },
  });

  const session = await adapter.requireSession(request);

  assert.equal(verifiedToken, "verified-token");
  assert.equal(session.userId, "00000000-0000-4000-8000-000000000001");
  assert.equal(session.client, client);
});

test("auth adapter does not construct a user client for an invalid token", async () => {
  let factoryCalls = 0;
  const verifier = {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: { code: "bad_jwt" },
      }),
    },
  } as unknown as SupabaseClient;
  const adapter = new SupabaseAuthSessionAdapter(verifier, () => {
    factoryCalls += 1;
    return {} as SupabaseClient;
  });

  await assert.rejects(
    adapter.requireSession(
      new Request("https://example.test", {
        headers: { authorization: "Bearer invalid-token" },
      }),
    ),
    (error) => error instanceof BackendError && error.code === "unauthenticated",
  );
  assert.equal(factoryCalls, 0);
});
