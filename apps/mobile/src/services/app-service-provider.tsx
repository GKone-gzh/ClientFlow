import { createContext, useContext, type PropsWithChildren } from "react";

import type {
  AppServiceComposition,
  AppServices,
  DevelopmentTools,
} from "@/services/app-services";

const AppServiceContext = createContext<AppServiceComposition | null>(null);

interface AppServiceProviderProps extends PropsWithChildren {
  composition: AppServiceComposition;
}

export function AppServiceProvider({
  children,
  composition,
}: AppServiceProviderProps) {
  return (
    <AppServiceContext.Provider value={composition}>
      {children}
    </AppServiceContext.Provider>
  );
}

function useComposition() {
  const composition = useContext(AppServiceContext);
  if (!composition) {
    throw new Error("AppServiceProvider is missing from the component tree");
  }
  return composition;
}

export function useAppServices(): AppServices {
  return useComposition().services;
}

export function useDevelopmentTools(): DevelopmentTools | null {
  return useComposition().developmentTools;
}

export function useAppCapabilities(): AppServiceComposition["capabilities"] {
  return useComposition().capabilities;
}
