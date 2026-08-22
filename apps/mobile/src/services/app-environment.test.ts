import assert from "node:assert/strict";
import test from "node:test";

import { AppServiceError } from "./service-error";
import { readAppEnvironment } from "./app-environment";

test("defaults to the mock adapter without public configuration", () => {
  assert.deepEqual(readAppEnvironment({}), { adapter: "mock" });
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
