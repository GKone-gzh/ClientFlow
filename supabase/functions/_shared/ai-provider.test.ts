import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfiguredStubAIProvider,
  createServerAIProvider,
} from "./ai-provider";
import { BackendError } from "./errors";
import { QwenVisionAIProvider } from "./qwen-ai-provider";

test("provider selection defaults to Stub and never starts paid AI implicitly", () => {
  const provider = createServerAIProvider(() => undefined);

  assert.ok(provider instanceof ConfiguredStubAIProvider);
  assert.equal(provider.providerName, "stub");
});

test("provider selection creates only the owner-selected Qwen model", () => {
  const environment = new Map([
    ["AI_PROVIDER", "qwen"],
    ["DASHSCOPE_API_KEY", "server-only-key"],
  ]);
  const provider = createServerAIProvider((name) => environment.get(name));

  assert.ok(provider instanceof QwenVisionAIProvider);
  assert.equal(provider.providerName, "qwen");
  assert.equal(provider.modelName, "qwen3-vl-plus");
});

test("Qwen selection fails safely without its server secret", () => {
  assert.throws(
    () => createServerAIProvider((name) => (name === "AI_PROVIDER" ? "qwen" : undefined)),
    (error) =>
      error instanceof BackendError &&
      error.code === "internal_error" &&
      !error.message.includes("DASHSCOPE"),
  );
});

test("unknown provider configuration never falls back to Stub", () => {
  assert.throws(
    () =>
      createServerAIProvider((name) =>
        name === "AI_PROVIDER" ? "unapproved-provider" : undefined,
      ),
    (error) => error instanceof BackendError && error.code === "internal_error",
  );
});
