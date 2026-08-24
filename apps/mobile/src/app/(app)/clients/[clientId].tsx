import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  MessageState,
  RefreshingState,
} from "@/components/async-state";
import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useClientDetailQuery } from "@/features/clients/client-queries";
import { resolveClientDetailScreenState } from "@/features/screen-state/screen-state";

export default function ClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const detailQuery = useClientDetailQuery(clientId);
  const screenState = resolveClientDetailScreenState({
    error: detailQuery.error,
    hasData: detailQuery.data !== undefined && detailQuery.data !== null,
    isFetching: detailQuery.isFetching,
    isNotFound: detailQuery.data === null,
    isPlaceholderData: detailQuery.isPlaceholderData,
  });

  return (
    <PlaceholderScreen title="客户详情">
      {screenState === "initial-loading" ? (
        <LoadingState label="正在加载客户详情..." />
      ) : null}
      {screenState === "error" || screenState === "cached-error" ? (
        <ErrorState
          label={
            screenState === "cached-error"
              ? "刷新失败，正在显示已缓存详情。"
              : undefined
          }
          onRetry={() => void detailQuery.refetch()}
        />
      ) : null}
      {screenState === "forbidden" ? (
        <MessageState label="无权访问此客户。" role="alert" />
      ) : null}
      {screenState === "not-found" ? <EmptyState label="未找到客户" /> : null}
      {screenState === "refreshing" ? (
        <RefreshingState label="正在刷新客户详情..." />
      ) : null}
      {screenState === "section-error" ? (
        <ErrorState onRetry={() => void detailQuery.refetch()} />
      ) : null}
      {detailQuery.data ? (
        <>
          <Text>姓名：{detailQuery.data.client.name}</Text>
          <Text>状态：{detailQuery.data.client.status}</Text>
          <Text>联系方式：{detailQuery.data.client.contactHandle ?? "未填写"}</Text>
          {screenState === "section-loading" ? (
            <LoadingState label="正在加载项目、需求和任务..." />
          ) : null}
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
