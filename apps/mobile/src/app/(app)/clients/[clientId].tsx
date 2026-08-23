import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useClientDetailQuery } from "@/features/clients/client-queries";

export default function ClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const detailQuery = useClientDetailQuery(clientId);

  return (
    <PlaceholderScreen title="客户详情">
      {detailQuery.isPending ? <LoadingState label="正在加载客户详情..." /> : null}
      {detailQuery.isError ? (
        <ErrorState onRetry={() => void detailQuery.refetch()} />
      ) : null}
      {detailQuery.data === null ? <EmptyState label="未找到客户" /> : null}
      {detailQuery.data ? (
        <>
          <Text>姓名：{detailQuery.data.client.name}</Text>
          <Text>状态：{detailQuery.data.client.status}</Text>
          <Text>联系方式：{detailQuery.data.client.contactHandle ?? "未填写"}</Text>
          {detailQuery.data.projects.map(({ project, requirements, tasks }) => (
            <View key={project.id}>
              <Text>项目：{project.name}</Text>
              <Text>项目说明：{project.summary ?? "未填写"}</Text>
              <Text>需求：{requirements.length} 项</Text>
              {requirements.map((requirement) => (
                <Text key={requirement.id}>- {requirement.content}</Text>
              ))}
              <Text>任务：{tasks.length} 项</Text>
              {tasks.map((task) => (
                <Text key={task.id}>- {task.title}</Text>
              ))}
            </View>
          ))}
        </>
      ) : null}
    </PlaceholderScreen>
  );
}
