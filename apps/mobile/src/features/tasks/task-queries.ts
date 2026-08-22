import { useQuery } from "@tanstack/react-query";

import { useAppServices } from "@/services/app-service-provider";

export const taskKeys = {
  all: ["tasks"] as const,
};

export function useTasksQuery() {
  const services = useAppServices();
  return useQuery({
    queryKey: taskKeys.all,
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
