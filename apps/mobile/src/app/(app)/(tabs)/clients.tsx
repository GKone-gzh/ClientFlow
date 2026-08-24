import { Link, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import type { Client } from "@clientflow/contracts";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { VirtualizedListScreen } from "@/components/screen-shell";
import { useClientsQuery } from "@/features/clients/client-queries";
import { pushClientDetail } from "@/features/navigation/client-navigation";

export default function ClientsScreen() {
  const router = useRouter();
  const clientsQuery = useClientsQuery();

  const renderClient = ({ item }: { item: Client }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => pushClientDetail(router, item.id)}
      style={styles.row}
    >
      <Text>{item.name} · {item.status}</Text>
    </Pressable>
  );

  return (
    <VirtualizedListScreen
      data={clientsQuery.data ?? []}
      header={
        <>
          <Link href="/(app)/clients/new">手动添加客户</Link>
          <Link href="/(app)/clients/import">从聊天添加客户</Link>
          {clientsQuery.isRefetching ? <Text>正在刷新客户...</Text> : null}
          {clientsQuery.isError ? (
            <ErrorState onRetry={() => void clientsQuery.refetch()} />
          ) : null}
          {clientsQuery.data ? <Text>共 {clientsQuery.data.length} 个客户</Text> : null}
        </>
      }
      keyExtractor={(client) => client.id}
      ListEmptyComponent={
        clientsQuery.isPending ? (
          <LoadingState label="正在加载客户..." />
        ) : clientsQuery.isError ? null : (
          <EmptyState label="暂无客户" />
        )
      }
      onRefresh={() => void clientsQuery.refetch()}
      refreshing={clientsQuery.isRefetching}
      renderItem={renderClient}
      title="客户"
      description="当前使用 Mock Repository。"
    />
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
  },
});
