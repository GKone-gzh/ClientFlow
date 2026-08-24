import { Link, useRouter } from "expo-router";
import { Button, Text } from "react-native";

import { ErrorState, LoadingState } from "@/components/async-state";
import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useClientsQuery } from "@/features/clients/client-queries";
import { pushClientDetail } from "@/features/navigation/client-navigation";
import { useTasksQuery } from "@/features/tasks/task-queries";

export default function HomeScreen() {
  const router = useRouter();
  const clientsQuery = useClientsQuery();
  const tasksQuery = useTasksQuery();
  const isPending = clientsQuery.isPending || tasksQuery.isPending;
  const isError = clientsQuery.isError || tasksQuery.isError;

  return (
    <PlaceholderScreen
      title="首页"
      description="ClientFlow 业务概览占位页面。"
      insetMode="tabs"
    >
      <Link href="/(app)/intake/upload">从聊天截图添加客户</Link>
      {isPending ? <LoadingState label="正在加载概览..." /> : null}
      {isError ? (
        <ErrorState
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
