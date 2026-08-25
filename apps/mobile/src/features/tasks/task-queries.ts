import { useQuery } from "@tanstack/react-query";

import { taskKeys } from "@/features/query/query-keys";
import { TASK_LIST_QUERY_POLICY } from "@/features/query/query-policy";
import { useAppServices } from "@/services/app-service-provider";

export function useTasksQuery() {
  const services = useAppServices();
  return useQuery({
    ...TASK_LIST_QUERY_POLICY,
    queryKey: taskKeys.list({}),
    queryFn: async () => {
      const clients = await services.clients.list();
      const projectGroups = await Promise.all(
        clients.map((client) => services.projects.listByClient(client.id)),
      );
      const projects = projectGroups.flat();
      const taskGroups = await Promise.all(
        projects.map((project) => services.tasks.listByProject(project.id)),
      );
      return taskGroups.flat();
    },
  });
}
