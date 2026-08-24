import { useState } from "react";
import { Link } from "expo-router";
import { Button, Text } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useAuthSession } from "@/features/auth/auth-session-provider";
import { toContractError } from "@/services/service-error";

export default function ProfileScreen() {
  const { session, signOut } = useAuthSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitSignOut = async () => {
    setError(null);
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (signOutError) {
      setError(
        toContractError(signOutError, {
          code: "internal_error",
          message: "退出登录失败，请重试。",
          retryable: true,
        }).message,
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <PlaceholderScreen
      title="我的"
      description="个人资料占位页面。"
      insetMode="tabs"
    >
      <Text>当前账号：{session?.user.email ?? "未提供邮箱"}</Text>
      <Link href="/(app)/settings">设置</Link>
      <Link href="/(app)/subscription">订阅</Link>
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      <Button
        disabled={isSigningOut}
        onPress={() => void submitSignOut()}
        title={isSigningOut ? "退出中..." : "退出登录"}
      />
    </PlaceholderScreen>
  );
}
