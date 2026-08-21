import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmIntakeWorkflow,
  runIntakeWorkflow,
  type IntakeWorkflowState,
} from "./intake-workflow";
import { composeAppServices } from "@/services/compose-app-services";
import { AppServiceError } from "@/services/service-error";

const SCREENSHOT = {
  byteSize: 1_024,
  fileName: "chat.jpg",
  height: 1_200,
  mimeType: "image/jpeg" as const,
  uri: "file:///chat.jpg",
  width: 800,
};

test("reports upload, extraction, and review transitions through feature state", async () => {
  const composition = composeAppServices({
    adapter: "mock",
    enableDevelopmentTools: false,
  });
  const statuses: IntakeWorkflowState["status"][] = [];

  const state = await runIntakeWorkflow({
    services: composition.services,
    screenshot: SCREENSHOT,
    operationId: "workflow-success",
    onStateChange: (next) => statuses.push(next.status),
  });

  assert.deepEqual(statuses, ["uploading", "extracting", "awaiting_review"]);
  assert.equal(state.status, "awaiting_review");
  assert.ok(state.uploadId);
  assert.ok(state.extractionId);
  assert.equal(state.attempt, 1);
  assert.equal(state.failure, null);
});

test("retries extraction failures from the existing upload", async () => {
  const composition = composeAppServices({
    adapter: "mock",
    enableDevelopmentTools: true,
  });
  composition.developmentTools?.selectIntakeScenario("failure");

  const failed = await runIntakeWorkflow({
    services: composition.services,
    screenshot: SCREENSHOT,
    operationId: "workflow-retry",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure?.step, "extraction");
  assert.equal(failed.retryFrom, "extraction");
  assert.ok(failed.uploadId);

  composition.developmentTools?.selectIntakeScenario("complete");
  const retried = await runIntakeWorkflow({
    services: composition.services,
    screenshot: SCREENSHOT,
    operationId: "workflow-retry",
    previous: failed,
  });

  assert.equal(retried.status, "awaiting_review");
  assert.equal(retried.uploadId, failed.uploadId);
  assert.equal(retried.attempt, 2);
});

test("restarts upload failures and identifies invalid output as a review failure", async () => {
  const uploadComposition = composeAppServices({
    adapter: "mock",
    enableDevelopmentTools: false,
  });
  const prepare = uploadComposition.services.uploads.prepare.bind(
    uploadComposition.services.uploads,
  );
  uploadComposition.services.uploads.prepare = async () => {
    throw new AppServiceError("upload_failed", "Upload failed", true);
  };
  const uploadFailed = await runIntakeWorkflow({
    services: uploadComposition.services,
    screenshot: SCREENSHOT,
    operationId: "workflow-upload-failure",
  });
  assert.equal(uploadFailed.failure?.step, "upload");
  assert.equal(uploadFailed.retryFrom, "upload");
  assert.equal(uploadFailed.uploadId, null);

  uploadComposition.services.uploads.prepare = prepare;
  const uploadRetried = await runIntakeWorkflow({
    services: uploadComposition.services,
    screenshot: SCREENSHOT,
    operationId: "workflow-upload-failure",
    previous: uploadFailed,
  });
  assert.equal(uploadRetried.status, "awaiting_review");
  assert.equal(uploadRetried.attempt, 2);

  const transportComposition = composeAppServices({
    adapter: "mock",
    enableDevelopmentTools: false,
  });
  transportComposition.services.screenshotUpload.upload = async () => {
    throw new AppServiceError("upload_failed", "Transport failed", true);
  };
  const transportFailed = await runIntakeWorkflow({
    services: transportComposition.services,
    screenshot: SCREENSHOT,
    operationId: "workflow-transport-failure",
  });
  assert.equal(transportFailed.failure?.step, "upload");
  assert.equal(transportFailed.failure?.error.code, "upload_failed");

  const reviewComposition = composeAppServices({
    adapter: "mock",
    enableDevelopmentTools: true,
  });
  reviewComposition.developmentTools?.selectIntakeScenario("invalid");
  const reviewFailed = await runIntakeWorkflow({
    services: reviewComposition.services,
    screenshot: SCREENSHOT,
    operationId: "workflow-review-failure",
  });
  assert.equal(reviewFailed.failure?.step, "review");
  assert.equal(reviewFailed.failure?.error.code, "validation_failed");
  assert.equal(reviewFailed.retryFrom, "review");
});

test("coalesces concurrent upload operations with the same operation id", async () => {
  const composition = composeAppServices({
    adapter: "mock",
    enableDevelopmentTools: false,
  });
  const input = {
    services: composition.services,
    screenshot: SCREENSHOT,
    operationId: "workflow-concurrent",
  };

  const [first, replay] = await Promise.all([
    runIntakeWorkflow(input),
    runIntakeWorkflow(input),
  ]);

  assert.equal(first.uploadId, replay.uploadId);
  assert.equal(first.extractionId, replay.extractionId);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);

  const laterReplay = await runIntakeWorkflow(input);
  assert.equal(laterReplay.uploadId, first.uploadId);
  assert.equal(laterReplay.extractionId, first.extractionId);
  assert.equal(laterReplay.replayed, true);
});

test("reports confirmation failures and increments the retry attempt", async () => {
  const composition = composeAppServices({
    adapter: "mock",
    enableDevelopmentTools: false,
  });
  const extracted = await runIntakeWorkflow({
    services: composition.services,
    screenshot: SCREENSHOT,
    operationId: "workflow-confirm-retry-source",
  });
  const result = await composition.services.intake.getValidatedResult(
    extracted.extractionId!,
  );
  assert.ok(result);
  const confirm = composition.services.intake.confirm.bind(
    composition.services.intake,
  );
  let shouldFail = true;
  composition.services.intake.confirm = async (input) => {
    if (shouldFail) {
      shouldFail = false;
      throw new AppServiceError("internal_error", "Temporary failure", true);
    }
    return confirm(input);
  };

  const failed = await confirmIntakeWorkflow({
    services: composition.services,
    extractionId: extracted.extractionId!,
    result,
  });
  const retried = await confirmIntakeWorkflow({
    services: composition.services,
    extractionId: extracted.extractionId!,
    result,
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.failure?.step, "confirmation");
  assert.equal(failed.retryFrom, "confirmation");
  assert.equal(retried.status, "confirmed");
  assert.equal(retried.attempt, 2);
});

test("makes confirmation idempotency visible without duplicating entities", async () => {
  const composition = composeAppServices({
    adapter: "mock",
    enableDevelopmentTools: false,
  });
  const extracted = await runIntakeWorkflow({
    services: composition.services,
    screenshot: SCREENSHOT,
    operationId: "workflow-confirm",
  });
  const result = await composition.services.intake.getValidatedResult(
    extracted.extractionId!,
  );
  assert.ok(result);
  const beforeCount = (await composition.services.clients.list()).length;

  const first = await confirmIntakeWorkflow({
    services: composition.services,
    extractionId: extracted.extractionId!,
    result,
  });
  const replay = await confirmIntakeWorkflow({
    services: composition.services,
    extractionId: extracted.extractionId!,
    result,
  });

  assert.equal(first.status, "confirmed");
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.confirmation, first.confirmation);
  assert.equal((await composition.services.clients.list()).length, beforeCount + 1);
});
