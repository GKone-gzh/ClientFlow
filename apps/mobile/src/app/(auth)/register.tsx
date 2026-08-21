import { Link } from "expo-router";
import { Button, TextInput } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function RegisterScreen() {
  return (
    <PlaceholderScreen title="注册" description="认证服务接入前的占位页面。">
      <TextInput accessibilityLabel="邮箱" placeholder="邮箱" />
      <TextInput accessibilityLabel="密码" placeholder="密码" secureTextEntry />
      <Link href="/(app)/(tabs)/home" asChild>
        <Button title="创建账号" />
      </Link>
      <Link href="/(auth)/sign-in">返回登录</Link>
    </PlaceholderScreen>
  );
}
