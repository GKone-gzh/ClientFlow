import { Link, useRouter } from "expo-router";
import { Button, Text } from "react-native";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  MessageState,
  RefreshingState,
} from "@/components/async-state";
import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useClientsQuery } from "@/features/clients/client-queries";
import { pushClientDetail } from "@/features/navigation/client-navigation";
import { resolveHomeScreenState } from "@/features/screen-state/screen-state";
import { useTasksQuery } from "@/features/tasks/task-queries";

export default function HomeScreen() {
  const router = useRouter();
  const clientsQuery = useClientsQuery();
  const tasksQuery = useTasksQuery();
  const screenState = resolveHomeScreenState({
    hasClients: clientsQuery.data !== undefined,
    hasTasks: tasksQuery.data !== undefined,
    isError: clientsQuery.isError || tasksQuery.isError,
    isFetching: clientsQuery.isFetching || tasksQuery.isFetching,
    totalItems: (clientsQuery.data?.length ?? 0) + (tasksQuery.data?.length ?? 0),
  });

  return (
    <PlaceholderScreen
      title="首页"
      description="ClientFlow 业务概览占位页面。"
      insetMode="tabs"
    >
      <Link href="/(app)/intake/upload">从聊天截图添加客户</Link>
      {screenState === "initial-loading" ? (
        <LoadingState label="正在加载概览..." />
      ) : null}
      {screenState === "refreshing" ? (
        <RefreshingState label="正在刷新概览..." />
      ) : null}
      {screenState === "partial" ? (
        <MessageState label="部分概览仍在加载。" />
      ) : null}
      {screenState === "empty" ? <EmptyState label="暂无业务数据" /> : null}
      {screenState === "error" || screenState === "cached-error" ? (
        <ErrorState
          label={
            screenState === "cached-error"
              ? "刷新失败，正在显示已缓存概览。"
              : undefined
          }
          onRetry={() => {
            void clientsQuery.refetch();
            void tasksQuery.refetch();
          }}
        />
      ) : null}
      {clientsQuery.data ? <Text>客户：{clientsQuery.data.length}</Text> : null}
      {tasksQuery.data ? <Text>任务：{tasksQuery.data.length}</Text> : null}
      {clientsQuery.data?.length ? <Text>最近客户</Text> : null}
      {clientsQuery.data?.slice(0, 3).map((client) => (
        <Button
          key={client.id}
          title={`查看 ${client.name}`}
          onPress={() => pushClientDetail(router, client.id)}
        />
      ))}
    </PlaceholderScreen>
  );
}
