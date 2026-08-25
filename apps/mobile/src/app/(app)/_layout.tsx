import { Redirect, Stack } from "expo-router";

import { useAuthSession } from "@/features/auth/auth-session-provider";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

export default function AppLayout() {
  const { session } = useAuthSession();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }} />;
}
