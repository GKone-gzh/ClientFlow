import { Stack } from "expo-router";
import { Button, Text } from "react-native";

import { AppProviders } from "@/components/app-providers";
import { LoadingState } from "@/components/async-state";
import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useAuthSession } from "@/features/auth/auth-session-provider";

export default function RootLayout() {
  return (
    <AppProviders>
      <AuthenticatedNavigation />
    </AppProviders>
  );
}

function AuthenticatedNavigation() {
  const { isRestoring, restoreError, retryRestore } = useAuthSession();

  if (isRestoring) {
    return (
      <PlaceholderScreen
        title="ClientFlow"
        description="正在恢复登录状态。"
        insetMode="fullscreen"
      >
        <LoadingState label="正在检查 Session..." />
      </PlaceholderScreen>
    );
  }
  if (restoreError) {
    return (
      <PlaceholderScreen
        title="无法恢复登录"
        description="请检查网络后重试。"
        insetMode="fullscreen"
      >
        <Text accessibilityRole="alert">{restoreError}</Text>
        <Button title="重试" onPress={retryRestore} />
      </PlaceholderScreen>
    );
  }
  return <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }} />;
}
