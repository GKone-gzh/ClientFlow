import { Link, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import type { Client } from "@clientflow/contracts";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  RefreshingState,
} from "@/components/async-state";
import { VirtualizedListScreen } from "@/components/screen-shell";
import { useClientsQuery } from "@/features/clients/client-queries";
import { pushClientDetail } from "@/features/navigation/client-navigation";
import { resolveCollectionScreenState } from "@/features/screen-state/screen-state";

export default function ClientsScreen() {
  const router = useRouter();
  const clientsQuery = useClientsQuery();
  const screenState = resolveCollectionScreenState({
    hasData: clientsQuery.data !== undefined,
    isError: clientsQuery.isError,
    isFetching: clientsQuery.isFetching,
    itemCount: clientsQuery.data?.length ?? 0,
  });

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
          {screenState === "refreshing" ? (
            <RefreshingState label="正在刷新客户..." />
          ) : null}
          {screenState === "cached-error" ? (
            <ErrorState
              label="刷新失败，正在显示已缓存客户。"
              onRetry={() => void clientsQuery.refetch()}
            />
          ) : null}
          {clientsQuery.data ? <Text>共 {clientsQuery.data.length} 个客户</Text> : null}
        </>
      }
      keyExtractor={(client) => client.id}
      ListEmptyComponent={
        screenState === "initial-loading" ? (
          <LoadingState label="正在加载客户..." />
        ) : screenState === "error" ? (
          <ErrorState onRetry={() => void clientsQuery.refetch()} />
        ) : screenState === "empty" ? (
          <EmptyState label="暂无客户" />
        ) : null
      }
      onRefresh={() => void clientsQuery.refetch()}
      refreshing={screenState === "refreshing"}
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
