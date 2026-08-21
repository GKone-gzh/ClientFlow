import { Link } from "expo-router";
import { Button, TextInput } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function SignInScreen() {
  return (
    <PlaceholderScreen title="登录" description="认证服务接入前的占位页面。">
      <TextInput accessibilityLabel="邮箱" placeholder="邮箱" />
      <TextInput accessibilityLabel="密码" placeholder="密码" secureTextEntry />
      <Link href="/(app)/(tabs)/home" asChild>
        <Button title="登录" />
      </Link>
      <Link href="/(auth)/register">注册账号</Link>
    </PlaceholderScreen>
  );
}
