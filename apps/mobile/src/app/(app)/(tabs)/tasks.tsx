import { Text } from "react-native";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useTasksQuery } from "@/features/tasks/task-queries";

export default function TasksScreen() {
  const tasksQuery = useTasksQuery();

  return (
    <PlaceholderScreen
      title="任务"
      description="当前使用 Mock Repository。"
      insetMode="tabs"
    >
      {tasksQuery.isPending ? <LoadingState label="正在加载任务..." /> : null}
      {tasksQuery.isError ? (
        <ErrorState onRetry={() => void tasksQuery.refetch()} />
      ) : null}
      {tasksQuery.data?.length === 0 ? <EmptyState label="暂无任务" /> : null}
      {tasksQuery.data?.map((task) => (
        <Text key={task.id}>
          {task.title} · {task.status}
        </Text>
      ))}
    </PlaceholderScreen>
  );
}
