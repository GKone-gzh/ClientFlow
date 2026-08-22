import { useState } from "react";
import { Link, router } from "expo-router";
import { Button, Text, TextInput } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";
import { validateAuthCredentials } from "@/features/auth/auth-form";
import { useAuthSession } from "@/features/auth/auth-session-provider";
import { toContractError } from "@/services/service-error";

export default function RegisterScreen() {
  const { signUp } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    const validation = validateAuthCredentials(email, password);
    if (!validation.success) {
      setError(validation.message);
      return;
    }
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const result = await signUp(validation.data);
      if (result.requiresEmailConfirmation) {
        setPassword("");
        setMessage("注册成功，请检查邮箱并完成验证后登录。");
      } else {
        router.replace("/(app)/(tabs)/home");
      }
    } catch (signUpError) {
      setError(
        toContractError(signUpError, {
          code: "validation_failed",
          message: "注册失败，请重试。",
          retryable: true,
        }).message,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlaceholderScreen title="注册" description="创建 ClientFlow 邮箱账号。">
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
        autoComplete="new-password"
        onChangeText={setPassword}
        placeholder="密码，至少 6 位"
        secureTextEntry
        value={password}
      />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      {message ? <Text accessibilityRole="alert">{message}</Text> : null}
      <Button
        disabled={isSubmitting}
        onPress={() => void submit()}
        title={isSubmitting ? "创建中..." : "创建账号"}
      />
      <Link href="/(auth)/sign-in">返回登录</Link>
    </PlaceholderScreen>
  );
}
