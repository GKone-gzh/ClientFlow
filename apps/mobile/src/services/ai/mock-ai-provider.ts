import type { AIProvider } from "@clientflow/contracts";

import {
  MOCK_AI_COMPLETE_RESULT,
  MOCK_AI_INVALID_RESULT,
  MOCK_AI_MISSING_INFO_RESULT,
} from "@/mocks/mock-ai-data";

export const MOCK_AI_SCENARIOS = ["complete", "missing", "invalid", "failure"] as const;
export type MockAIScenario = (typeof MOCK_AI_SCENARIOS)[number];

const SCENARIO_CODES: Record<MockAIScenario, number> = {
  complete: 0,
  missing: 1,
  invalid: 2,
  failure: 3,
};

export function mockScenarioBytes(scenario: MockAIScenario) {
  return new Uint8Array([SCENARIO_CODES[scenario]]);
}

// Development-only test double for the secure backend provider boundary.
export class MockAIProvider implements AIProvider {
  async extractScreenshot({
    imageBytes,
  }: Parameters<AIProvider["extractScreenshot"]>[0]) {
    await new Promise((resolve) => setTimeout(resolve, 350));

    switch (imageBytes[0]) {
      case 1:
        return MOCK_AI_MISSING_INFO_RESULT;
      case 2:
        return MOCK_AI_INVALID_RESULT;
      case 3:
        throw new Error("Mock provider failure");
      default:
        return MOCK_AI_COMPLETE_RESULT;
    }
  }
}
