import type { AppServiceComposition } from "@/services/app-services";
import {
  composeMockAppServices,
  type MockAppServiceConfiguration,
} from "@/services/compose-mock-app-services";
import {
  composeSupabaseAppServices,
  type SupabaseAppServiceConfiguration,
} from "@/services/compose-supabase-app-services";

export type AppServiceConfiguration =
  | MockAppServiceConfiguration
  | SupabaseAppServiceConfiguration;

export function composeAppServices(
  configuration: AppServiceConfiguration,
): AppServiceComposition {
  return configuration.adapter === "mock"
    ? composeMockAppServices(configuration)
    : composeSupabaseAppServices(configuration);
}
