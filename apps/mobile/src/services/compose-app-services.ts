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
import { SupabaseAuthService } from "@/services/supabase/supabase-auth-service";
import { createSupabaseClient } from "@/services/supabase/supabase-client";
import { createSupabaseUploadAdapter } from "@/services/supabase/supabase-upload-adapter";
import { createSupabaseBusinessRepositories } from "@/services/supabase/supabase-business-repositories";
import { SupabaseIntakeAdapter } from "@/services/supabase/supabase-intake-adapter";

export type AppServiceConfiguration =
  | {
      adapter: "mock";
      enableDevelopmentTools: boolean;
    }
  | {
      adapter: "supabase";
      enableDevelopmentTools: boolean;
      supabasePublishableKey: string;
      supabaseUrl: string;
    };

const DEVELOPMENT_SCENARIO_LABELS: Record<MockAIScenario, string> = {
  complete: "测试完整结果",
  missing: "测试缺失信息结果",
  invalid: "测试无效 AI 数据",
  failure: "测试 AI 失败",
};

export function composeAppServices(
  configuration: AppServiceConfiguration,
): AppServiceComposition {
  const repositories = createMockRepositories();
  const intakeServices = createMockIntakeServices(
    repositories.store,
    repositories,
  );
  const supabaseClient =
    configuration.adapter === "supabase"
      ? createSupabaseClient(configuration)
      : null;
  const auth = supabaseClient
    ? new SupabaseAuthService(supabaseClient)
    : new MockAuthService();
  const uploadServices = supabaseClient
    ? createSupabaseUploadAdapter(supabaseClient)
    : {
        uploads: intakeServices.uploads,
        screenshotUpload: {
          upload: async () => {
            await Promise.resolve();
          },
        },
      };
  const supabaseIntake = supabaseClient
    ? new SupabaseIntakeAdapter(supabaseClient)
    : null;
  const businessRepositories = supabaseClient
    ? createSupabaseBusinessRepositories(supabaseClient)
    : repositories;
  const services: AppServices = {
    ...businessRepositories,
    ...intakeServices,
    ...uploadServices,
    auth,
    ...(supabaseIntake
      ? { extractions: supabaseIntake, intake: supabaseIntake }
      : {}),
  };
  const scenarios: DevelopmentIntakeScenario[] = MOCK_AI_SCENARIOS.map(
    (id) => ({ id, label: DEVELOPMENT_SCENARIO_LABELS[id] }),
  );
  const developmentTools =
    configuration.adapter === "mock" && configuration.enableDevelopmentTools
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
