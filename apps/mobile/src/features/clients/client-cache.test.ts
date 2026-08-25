import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { Client } from "@clientflow/contracts";

import { findClientInListCache } from "./client-cache";
import { clientKeys } from "@/features/query/query-keys";

const CLIENT: Client = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  name: "Cached client",
  contactHandle: null,
  contactChannel: null,
  notes: null,
  status: "lead",
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

test("finds a client across parameterized list caches", () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(clientKeys.list({ status: "lead" }), [CLIENT]);

  assert.equal(findClientInListCache(queryClient, CLIENT.id), CLIENT);
});

test("returns undefined when no client list has the requested id", () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(clientKeys.list({}), [] satisfies Client[]);

  assert.equal(
    findClientInListCache(
      queryClient,
      "00000000-0000-4000-8000-000000000099",
    ),
    undefined,
  );
});
