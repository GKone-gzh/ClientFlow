import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/services/query-client";
import { AppServiceProvider } from "@/services/app-service-provider";
import { composeAppServices } from "@/services/compose-app-services";

const composition = composeAppServices({
  adapter: "mock",
  enableDevelopmentTools: __DEV__,
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppServiceProvider composition={composition}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AppServiceProvider>
  );
}
