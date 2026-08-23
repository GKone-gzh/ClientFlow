import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateClientInput, EntityId } from "@clientflow/contracts";

import { useAppServices } from "@/services/app-service-provider";
import { loadClientDetail } from "@/features/clients/client-detail";

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
    queryFn: () => loadClientDetail(services, clientId),
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
