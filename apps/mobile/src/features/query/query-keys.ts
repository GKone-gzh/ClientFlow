import type { EntityId } from "@clientflow/contracts";

export const clientKeys = {
  all: ["clients"] as const,
  lists: () => [...clientKeys.all, "list"] as const,
  list: <Filters extends object>(filters: Filters) =>
    [...clientKeys.lists(), filters] as const,
  details: () => [...clientKeys.all, "detail"] as const,
  detail: (clientId: EntityId) =>
    [...clientKeys.details(), clientId] as const,
};

export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: <Filters extends object>(filters: Filters) =>
    [...taskKeys.lists(), filters] as const,
};

export const intakeKeys = {
  all: ["intake"] as const,
  details: () => [...intakeKeys.all, "detail"] as const,
  detail: (extractionId: EntityId) =>
    [...intakeKeys.details(), extractionId] as const,
};
