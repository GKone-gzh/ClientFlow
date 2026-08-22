import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { AuthSessionProvider } from "@/features/auth/auth-session-provider";
import { readAppEnvironment } from "@/services/app-environment";
import { queryClient } from "@/services/query-client";
import { AppServiceProvider } from "@/services/app-service-provider";
import { composeAppServices } from "@/services/compose-app-services";

const environment = readAppEnvironment();
const composition = composeAppServices({
  ...environment,
  enableDevelopmentTools: environment.adapter === "mock" && __DEV__,
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppServiceProvider composition={composition}>
      <QueryClientProvider client={queryClient}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </QueryClientProvider>
    </AppServiceProvider>
  );
}
