import assert from "node:assert/strict";
import test from "node:test";

import { composeAppServices } from "./compose-app-services";

test("exposes only stable services when development tools are disabled", async () => {
  const composition = composeAppServices({
    adapter: "mock",
    enableDevelopmentTools: false,
  });

  assert.equal(composition.developmentTools, null);
  assert.equal(typeof composition.services.auth.signInWithPassword, "function");
  assert.equal(typeof composition.services.intake.requestExtraction, "function");
  assert.equal(typeof composition.services.screenshotUpload.upload, "function");
  assert.equal((await composition.services.clients.list()).length, 5);
});

test("uses real Supabase auth without exposing mock development controls", () => {
  const composition = composeAppServices({
    adapter: "supabase",
    enableDevelopmentTools: true,
    supabasePublishableKey: "sb_publishable_example",
    supabaseUrl: "https://project-ref.supabase.co",
  });

  assert.equal(composition.developmentTools, null);
  assert.equal(typeof composition.services.auth.getSession, "function");
});

test("keeps controllable mock scenarios behind optional development tools", () => {
  const composition = composeAppServices({
    adapter: "mock",
    enableDevelopmentTools: true,
  });

  assert.deepEqual(
    composition.developmentTools?.intakeScenarios.map((scenario) => scenario.id),
    ["complete", "missing", "invalid", "failure"],
  );
  assert.throws(
    () => composition.developmentTools?.selectIntakeScenario("unknown"),
    /Unknown development scenario/,
  );
});
