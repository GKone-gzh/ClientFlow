import { useQuery } from "@tanstack/react-query";

import { appServices } from "@/services/app-services";

export const taskKeys = {
  all: ["tasks"] as const,
};

export function useTasksQuery() {
  return useQuery({
    queryKey: taskKeys.all,
    queryFn: async () => {
      const clients = await appServices.clients.list();
      const projectGroups = await Promise.all(
        clients.map((client) => appServices.projects.listByClient(client.id)),
      );
      const projects = projectGroups.flat();
      const taskGroups = await Promise.all(
        projects.map((project) => appServices.tasks.listByProject(project.id)),
      );
      return taskGroups.flat();
    },
  });
}
