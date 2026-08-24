import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthSessionProvider } from "@/features/auth/auth-session-provider";
import { QueryLifecycle } from "@/features/query/query-lifecycle";
import { readAppEnvironment } from "@/services/app-environment";
import { queryClient } from "@/services/query-client";
import { AppServiceProvider } from "@/services/app-service-provider";
import { composeAppServices } from "@/services/compose-app-services";

const environment = readAppEnvironment(undefined, { isDevelopment: __DEV__ });
const composition = composeAppServices({
  ...environment,
  enableDevelopmentTools: environment.adapter === "mock" && __DEV__,
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <AppServiceProvider composition={composition}>
        <QueryClientProvider client={queryClient}>
          <QueryLifecycle />
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </QueryClientProvider>
      </AppServiceProvider>
    </SafeAreaProvider>
  );
}
