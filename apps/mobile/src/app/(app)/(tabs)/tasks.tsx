import { StyleSheet, Text, View } from "react-native";
import type { Task } from "@clientflow/contracts";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  RefreshingState,
} from "@/components/async-state";
import { VirtualizedListScreen } from "@/components/screen-shell";
import { useTasksQuery } from "@/features/tasks/task-queries";
import { resolveCollectionScreenState } from "@/features/screen-state/screen-state";

export default function TasksScreen() {
  const tasksQuery = useTasksQuery();
  const screenState = resolveCollectionScreenState({
    hasData: tasksQuery.data !== undefined,
    isError: tasksQuery.isError,
    isFetching: tasksQuery.isFetching,
    itemCount: tasksQuery.data?.length ?? 0,
  });

  const renderTask = ({ item }: { item: Task }) => (
    <View style={styles.row}>
      <Text>{item.title} · {item.status}</Text>
    </View>
  );

  return (
    <VirtualizedListScreen
      data={tasksQuery.data ?? []}
      header={
        <>
          {screenState === "refreshing" ? (
            <RefreshingState label="正在刷新任务..." />
          ) : null}
          {screenState === "cached-error" ? (
            <ErrorState
              label="刷新失败，正在显示已缓存任务。"
              onRetry={() => void tasksQuery.refetch()}
            />
          ) : null}
        </>
      }
      keyExtractor={(task) => task.id}
      ListEmptyComponent={
        screenState === "initial-loading" ? (
          <LoadingState label="正在加载任务..." />
        ) : screenState === "error" ? (
          <ErrorState onRetry={() => void tasksQuery.refetch()} />
        ) : screenState === "empty" ? (
          <EmptyState label="暂无任务" />
        ) : null
      }
      onRefresh={() => void tasksQuery.refetch()}
      refreshing={screenState === "refreshing"}
      renderItem={renderTask}
      title="任务"
      description="当前使用 Mock Repository。"
    />
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
  },
});
