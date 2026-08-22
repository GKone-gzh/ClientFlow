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

export interface MockAIController {
  getScenario(): MockAIScenario;
  setScenario(scenario: MockAIScenario): void;
}

export function createMockAIController(
  initialScenario: MockAIScenario = "complete",
): MockAIController {
  let scenario = initialScenario;
  return {
    getScenario: () => scenario,
    setScenario: (nextScenario) => {
      scenario = nextScenario;
    },
  };
}

// Development-only test double for the secure backend provider boundary.
export class MockAIProvider implements AIProvider {
  constructor(private readonly controller = createMockAIController()) {}

  async extractScreenshot(input: Parameters<AIProvider["extractScreenshot"]>[0]) {
    void input;
    await new Promise((resolve) => setTimeout(resolve, 350));

    switch (this.controller.getScenario()) {
      case "missing":
        return MOCK_AI_MISSING_INFO_RESULT;
      case "invalid":
        return MOCK_AI_INVALID_RESULT;
      case "failure":
        throw new Error("Mock provider failure");
      default:
        return MOCK_AI_COMPLETE_RESULT;
    }
  }
}
