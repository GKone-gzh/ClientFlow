import { Link } from "expo-router";
import { Text } from "react-native";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useClientsQuery } from "@/features/clients/client-queries";

export default function ClientsScreen() {
  const clientsQuery = useClientsQuery();

  return (
    <PlaceholderScreen title="客户" description="当前使用 Mock Repository。">
      <Link href="/(app)/clients/new">手动添加客户</Link>
      <Link href="/(app)/clients/import">从聊天添加客户</Link>
      {clientsQuery.isPending ? <LoadingState label="正在加载客户..." /> : null}
      {clientsQuery.isError ? (
        <ErrorState onRetry={() => void clientsQuery.refetch()} />
      ) : null}
      {clientsQuery.data?.length === 0 ? <EmptyState label="暂无客户" /> : null}
      {clientsQuery.data?.map((client) => (
        <Link key={client.id} href={`/(app)/clients/${client.id}`}>
          {client.name} · {client.status}
        </Link>
      ))}
      {clientsQuery.data ? <Text>共 {clientsQuery.data.length} 个客户</Text> : null}
    </PlaceholderScreen>
  );
}
