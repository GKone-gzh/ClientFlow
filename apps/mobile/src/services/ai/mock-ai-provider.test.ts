import assert from "node:assert/strict";
import test from "node:test";
import { AIExtractionResultSchema } from "@clientflow/contracts";

import {
  MockAIProvider,
  createMockAIController,
  mockScenarioBytes,
} from "./mock-ai-provider";

test("returns complete and missing-info schema-valid fixtures", async () => {
  const controller = createMockAIController();
  const provider = new MockAIProvider(controller);
  const complete = await provider.extractScreenshot({
    mimeType: "image/jpeg",
    imageBytes: mockScenarioBytes("complete"),
  });
  controller.setScenario("missing");
  const missing = await provider.extractScreenshot({
    mimeType: "image/jpeg",
    imageBytes: mockScenarioBytes("missing"),
  });

  assert.equal(AIExtractionResultSchema.safeParse(complete).success, true);
  assert.equal(AIExtractionResultSchema.safeParse(missing).success, true);
});

test("provides invalid and failed scenarios for error-state testing", async () => {
  const controller = createMockAIController("invalid");
  const provider = new MockAIProvider(controller);
  const invalid = await provider.extractScreenshot({
    mimeType: "image/jpeg",
    imageBytes: mockScenarioBytes("invalid"),
  });

  assert.equal(AIExtractionResultSchema.safeParse(invalid).success, false);
  controller.setScenario("failure");
  await assert.rejects(
    provider.extractScreenshot({
      mimeType: "image/jpeg",
      imageBytes: mockScenarioBytes("failure"),
    }),
    /Mock provider failure/,
  );
});
