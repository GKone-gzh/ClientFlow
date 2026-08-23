import { createMockIntakeServices } from "@/mocks/mock-intake-services";
import { MockAuthService } from "@/mocks/mock-auth-service";
import { createMockRepositories } from "@/mocks/mock-repositories";
import type {
  AppServiceComposition,
  AppServices,
  DevelopmentIntakeScenario,
} from "@/services/app-services";
import {
  MOCK_AI_SCENARIOS,
  type MockAIScenario,
} from "@/services/ai/mock-ai-provider";

export interface MockAppServiceConfiguration {
  adapter: "mock";
  enableDevelopmentTools: boolean;
}

const DEVELOPMENT_SCENARIO_LABELS: Record<MockAIScenario, string> = {
  complete: "测试完整结果",
  missing: "测试缺失信息结果",
  invalid: "测试无效 AI 数据",
  failure: "测试 AI 失败",
};

export function composeMockAppServices(
  configuration: MockAppServiceConfiguration,
): AppServiceComposition {
  const repositories = createMockRepositories();
  const intakeServices = createMockIntakeServices(
    repositories.store,
    repositories,
  );
  const services: AppServices = {
    ...repositories,
    ...intakeServices,
    auth: new MockAuthService(),
    screenshotUpload: {
      upload: async () => {
        await Promise.resolve();
      },
    },
  };
  const scenarios: DevelopmentIntakeScenario[] = MOCK_AI_SCENARIOS.map(
    (id) => ({ id, label: DEVELOPMENT_SCENARIO_LABELS[id] }),
  );
  const developmentTools = configuration.enableDevelopmentTools
    ? {
        intakeScenarios: scenarios,
        selectIntakeScenario: (id: string) => {
          if (!MOCK_AI_SCENARIOS.includes(id as MockAIScenario)) {
            throw new Error(`Unknown development scenario: ${id}`);
          }
          intakeServices.controller.setScenario(id as MockAIScenario);
        },
      }
    : null;

  return {
    capabilities: { extraction: true },
    services,
    developmentTools,
  };
}
