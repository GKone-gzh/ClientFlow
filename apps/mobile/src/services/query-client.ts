import { QueryClient } from "@tanstack/react-query";

import {
  DEFAULT_QUERY_POLICY,
  queryRetryDelay,
  shouldRetryQuery,
} from "@/features/query/query-policy";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      ...DEFAULT_QUERY_POLICY,
      refetchOnReconnect: true,
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
    },
    mutations: {
      retry: false,
    },
  },
});
