import { useState } from "react";
import { Link, router } from "expo-router";
import { Button, Text, TextInput } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";
import { validateAuthCredentials } from "@/features/auth/auth-form";
import { useAuthSession } from "@/features/auth/auth-session-provider";
import { toContractError } from "@/services/service-error";

export default function SignInScreen() {
  const { signIn } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const validation = validateAuthCredentials(email, password);
    if (!validation.success) {
      setError(validation.message);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(validation.data);
      router.replace("/(app)/(tabs)/home");
    } catch (signInError) {
      setError(
        toContractError(signInError, {
          code: "unauthenticated",
          message: "登录失败，请重试。",
          retryable: true,
        }).message,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlaceholderScreen title="登录" description="使用邮箱和密码登录 ClientFlow。">
      <TextInput
        accessibilityLabel="邮箱"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="邮箱"
        value={email}
      />
      <TextInput
        accessibilityLabel="密码"
        autoCapitalize="none"
        autoComplete="password"
        onChangeText={setPassword}
        placeholder="密码"
        secureTextEntry
        value={password}
      />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      <Button
        disabled={isSubmitting}
        onPress={() => void submit()}
        title={isSubmitting ? "登录中..." : "登录"}
      />
      <Link href="/(auth)/register">注册账号</Link>
    </PlaceholderScreen>
  );
}
