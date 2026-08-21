import { Link } from "expo-router";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function HomeScreen() {
  return (
    <PlaceholderScreen title="首页" description="ClientFlow 业务概览占位页面。">
      <Link href="/(app)/intake/upload">从聊天截图添加客户</Link>
    </PlaceholderScreen>
  );
}
