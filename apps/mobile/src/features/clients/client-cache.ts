import { QueryClient } from "@tanstack/react-query";
import type { Client, EntityId } from "@clientflow/contracts";

import { clientKeys } from "@/features/query/query-keys";

export function findClientInListCache(
  queryClient: QueryClient,
  clientId: EntityId,
) {
  const listEntries = queryClient.getQueriesData<Client[]>({
    queryKey: clientKeys.lists(),
  });

  for (const [, clients] of listEntries) {
    const client = clients?.find((candidate) => candidate.id === clientId);
    if (client) return client;
  }
  return undefined;
}
