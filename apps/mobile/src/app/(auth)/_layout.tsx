import { Redirect, Stack } from "expo-router";

import { useAuthSession } from "@/features/auth/auth-session-provider";

export default function AuthLayout() {
  const { session } = useAuthSession();
  if (session) return <Redirect href="/(app)/(tabs)/home" />;
  return <Stack />;
}
