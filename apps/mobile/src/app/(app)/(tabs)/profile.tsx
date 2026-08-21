import { Link } from "expo-router";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function ProfileScreen() {
  return (
    <PlaceholderScreen title="我的" description="个人资料占位页面。">
      <Link href="/(app)/settings">设置</Link>
      <Link href="/(app)/subscription">订阅</Link>
    </PlaceholderScreen>
  );
}
