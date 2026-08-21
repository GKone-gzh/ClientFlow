import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateClientInput, EntityId } from "@clientflow/contracts";

import { useAppServices } from "@/services/app-service-provider";

export const clientKeys = {
  all: ["clients"] as const,
  detail: (clientId: EntityId) => ["clients", clientId] as const,
};

export function useClientsQuery() {
  const services = useAppServices();
  return useQuery({
    queryKey: clientKeys.all,
    queryFn: () => services.clients.list(),
  });
}

export function useClientDetailQuery(clientId: EntityId) {
  const services = useAppServices();
  return useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async () => {
      const client = await services.clients.getById(clientId);
      if (!client) {
        return null;
      }
      const projects = await services.projects.listByClient(clientId);
      const projectDetails = await Promise.all(
        projects.map(async (project) => ({
          project,
          requirements: await services.requirements.listByProject(project.id),
          tasks: await services.tasks.listByProject(project.id),
        })),
      );
      return { client, projects: projectDetails };
    },
  });
}

export function useCreateClientMutation() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClientInput) => services.clients.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientKeys.all });
    },
  });
}
