import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateClientInput, EntityId } from "@clientflow/contracts";

import { findClientInListCache } from "@/features/clients/client-cache";
import { loadClientDetail } from "@/features/clients/client-detail";
import { clientKeys } from "@/features/query/query-keys";
import {
  CLIENT_DETAIL_QUERY_POLICY,
  CLIENT_LIST_QUERY_POLICY,
} from "@/features/query/query-policy";
import { useAppServices } from "@/services/app-service-provider";

export function useClientsQuery() {
  const services = useAppServices();
  return useQuery({
    ...CLIENT_LIST_QUERY_POLICY,
    queryKey: clientKeys.list({}),
    queryFn: () => services.clients.list(),
  });
}

export function useClientDetailQuery(clientId: EntityId) {
  const services = useAppServices();
  const queryClient = useQueryClient();
  return useQuery({
    ...CLIENT_DETAIL_QUERY_POLICY,
    queryKey: clientKeys.detail(clientId),
    queryFn: () => loadClientDetail(services, clientId),
    placeholderData: () => {
      const client = findClientInListCache(queryClient, clientId);
      return client ? { client, projects: [] } : undefined;
    },
  });
}

export function useCreateClientMutation() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClientInput) => services.clients.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}
