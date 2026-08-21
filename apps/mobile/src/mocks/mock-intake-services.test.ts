import assert from "node:assert/strict";
import test from "node:test";

import { MOCK_AI_COMPLETE_RESULT } from "./mock-ai-data";
import { createMockIntakeServices } from "./mock-intake-services";
import { createMockRepositories } from "./mock-repositories";

async function runScenario(scenario: "complete" | "invalid" | "failure") {
  const repositories = createMockRepositories();
  const services = createMockIntakeServices(repositories.store, repositories);
  const prepared = await services.uploads.prepare({
    mimeType: "image/jpeg",
    byteSize: 1000,
    originalFileName: `mock-${scenario}--chat.jpg`,
  });
  await services.uploads.markUploaded(prepared.uploadId);
  const extraction = await services.intake.requestExtraction(prepared.uploadId);
  return { extraction, repositories, services };
}

test("confirms a valid extraction atomically and idempotently", async () => {
  const { extraction, repositories, services } = await runScenario("complete");

  assert.equal(extraction.status, "needs_review");
  assert.deepEqual(
    await services.intake.getValidatedResult(extraction.id),
    MOCK_AI_COMPLETE_RESULT,
  );

  const first = await services.intake.confirm({
    extractionId: extraction.id,
    result: MOCK_AI_COMPLETE_RESULT,
  });
  const countsAfterFirst = {
    clients: repositories.store.clients.length,
    projects: repositories.store.projects.length,
    requirements: repositories.store.requirements.length,
    tasks: repositories.store.tasks.length,
  };
  const second = await services.intake.confirm({
    extractionId: extraction.id,
    result: MOCK_AI_COMPLETE_RESULT,
  });

  assert.deepEqual(second, first);
  assert.deepEqual(
    {
      clients: repositories.store.clients.length,
      projects: repositories.store.projects.length,
      requirements: repositories.store.requirements.length,
      tasks: repositories.store.tasks.length,
    },
    countsAfterFirst,
  );
});

test("does not persist invalid provider output", async () => {
  const { extraction, repositories } = await runScenario("invalid");

  assert.equal(extraction.status, "failed");
  assert.equal(extraction.errorCode, "validation_failed");
  assert.equal(extraction.result, null);
  assert.equal(repositories.store.extractions[0]?.result, null);
});

test("maps provider failures to a stable error without a result", async () => {
  const { extraction } = await runScenario("failure");

  assert.equal(extraction.status, "failed");
  assert.equal(extraction.errorCode, "extraction_failed");
  assert.equal(extraction.result, null);
});
