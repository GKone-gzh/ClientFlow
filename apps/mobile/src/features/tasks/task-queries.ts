import { useQuery } from "@tanstack/react-query";
import type {
  CursorPage,
  ListTasksInput,
  Task,
  TaskRepository,
} from "@clientflow/contracts";

import { useAppServices } from "@/services/app-service-provider";

export const taskKeys = {
  all: ["tasks"] as const,
  page: (input?: ListTasksInput) => ["tasks", "page", input ?? {}] as const,
};

export async function loadTaskPage(
  services: { tasks: Pick<TaskRepository, "list"> },
  input?: ListTasksInput,
): Promise<CursorPage<Task>> {
  return services.tasks.list(input);
}

export function useTasksQuery(input?: ListTasksInput) {
  const services = useAppServices();
  return useQuery({
    queryKey: taskKeys.page(input),
    queryFn: async () => (await loadTaskPage(services, input)).items,
  });
}
