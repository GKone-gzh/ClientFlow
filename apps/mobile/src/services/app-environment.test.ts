import assert from "node:assert/strict";
import test from "node:test";

import { AppServiceError } from "./service-error";
import { readAppEnvironment } from "./app-environment";

test("defaults to the mock adapter only in development", () => {
  assert.deepEqual(readAppEnvironment({}, { isDevelopment: true }), {
    adapter: "mock",
  });
  assert.throws(() => readAppEnvironment({}), /EXPO_PUBLIC_APP_ADAPTER/);
  assert.throws(
    () => readAppEnvironment({ appAdapter: "mock" }),
    /EXPO_PUBLIC_APP_ADAPTER/,
  );
});

test("accepts a secure Supabase public configuration", () => {
  assert.deepEqual(
    readAppEnvironment({
      appAdapter: "supabase",
      supabaseUrl: "https://project-ref.supabase.co/",
      supabasePublishableKey: "sb_publishable_example",
    }),
    {
      adapter: "supabase",
      supabaseUrl: "https://project-ref.supabase.co",
      supabasePublishableKey: "sb_publishable_example",
    },
  );
});

test("allows an HTTP loopback URL for local Supabase", () => {
  assert.equal(
    readAppEnvironment({
      appAdapter: "supabase",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-anon-key",
    }).adapter,
    "supabase",
  );
});

test("rejects missing, insecure, and secret Supabase configuration", () => {
  const serviceRolePayload = Buffer.from(
    JSON.stringify({ role: "service_role" }),
  ).toString("base64url");
  const invalidSources = [
    { appAdapter: "supabase" },
    {
      appAdapter: "supabase",
      supabaseUrl: "http://example.com",
      supabasePublishableKey: "public-key",
    },
    {
      appAdapter: "supabase",
      supabaseUrl: "https://project-ref.supabase.co",
      supabasePublishableKey: "sb_secret_forbidden",
    },
    {
      appAdapter: "supabase",
      supabaseUrl: "https://project-ref.supabase.co",
      supabasePublishableKey: `header.${serviceRolePayload}.signature`,
    },
    { appAdapter: "supabase", dashscopeApiKey: "forbidden" },
    { appAdapter: "supabase", aiProvider: "qwen" },
    { appAdapter: "supabase", adminToken: "forbidden" },
    { appAdapter: "supabase", serviceRoleKey: "forbidden" },
    { appAdapter: "supabase", supabaseSecretKey: "forbidden" },
    { appAdapter: "unknown" },
  ];

  for (const source of invalidSources) {
    assert.throws(
      () => readAppEnvironment(source),
      (error) =>
        error instanceof AppServiceError &&
        error.code === "internal_error" &&
        error.retryable === false,
    );
  }
});
