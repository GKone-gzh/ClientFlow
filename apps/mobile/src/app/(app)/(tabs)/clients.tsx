import { Link } from "expo-router";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function ClientsScreen() {
  return (
    <PlaceholderScreen title="客户" description="客户列表将在下一阶段接入 Mock Repository。">
      <Link href="/(app)/clients/new">手动添加客户</Link>
      <Link href="/(app)/clients/import">从聊天添加客户</Link>
    </PlaceholderScreen>
  );
}
