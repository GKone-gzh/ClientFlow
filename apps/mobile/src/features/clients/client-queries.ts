import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateClientInput, EntityId } from "@clientflow/contracts";

import { appServices } from "@/services/app-services";

export const clientKeys = {
  all: ["clients"] as const,
  detail: (clientId: EntityId) => ["clients", clientId] as const,
};

export function useClientsQuery() {
  return useQuery({
    queryKey: clientKeys.all,
    queryFn: () => appServices.clients.list(),
  });
}

export function useClientDetailQuery(clientId: EntityId) {
  return useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async () => {
      const client = await appServices.clients.getById(clientId);
      if (!client) {
        return null;
      }
      const projects = await appServices.projects.listByClient(clientId);
      const projectDetails = await Promise.all(
        projects.map(async (project) => ({
          project,
          requirements: await appServices.requirements.listByProject(project.id),
          tasks: await appServices.tasks.listByProject(project.id),
        })),
      );
      return { client, projects: projectDetails };
    },
  });
}

export function useCreateClientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClientInput) => appServices.clients.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientKeys.all });
    },
  });
}
