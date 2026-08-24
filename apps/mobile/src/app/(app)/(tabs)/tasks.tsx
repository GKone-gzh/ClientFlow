import { StyleSheet, Text, View } from "react-native";
import type { Task } from "@clientflow/contracts";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { VirtualizedListScreen } from "@/components/screen-shell";
import { useTasksQuery } from "@/features/tasks/task-queries";

export default function TasksScreen() {
  const tasksQuery = useTasksQuery();

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
          {tasksQuery.isRefetching ? <Text>正在刷新任务...</Text> : null}
          {tasksQuery.isError ? (
            <ErrorState onRetry={() => void tasksQuery.refetch()} />
          ) : null}
        </>
      }
      keyExtractor={(task) => task.id}
      ListEmptyComponent={
        tasksQuery.isPending ? (
          <LoadingState label="正在加载任务..." />
        ) : tasksQuery.isError ? null : (
          <EmptyState label="暂无任务" />
        )
      }
      onRefresh={() => void tasksQuery.refetch()}
      refreshing={tasksQuery.isRefetching}
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
