import type { AuthSession } from "@/services/app-services";

export type AuthDestination = "/(app)/(tabs)/home" | "/(auth)/sign-in";

export function resolveAuthDestination(input: {
  isRestoring: boolean;
  session: AuthSession | null;
}): AuthDestination | null {
  if (input.isRestoring) return null;
  return input.session ? "/(app)/(tabs)/home" : "/(auth)/sign-in";
}
