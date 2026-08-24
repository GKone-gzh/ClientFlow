import type { EntityId } from "@clientflow/contracts";

export type ClientDetailHref = `/(app)/clients/${EntityId}`;

export interface ClientDetailNavigator {
  push(href: ClientDetailHref): void;
}

export function clientDetailHref(clientId: EntityId): ClientDetailHref {
  return `/(app)/clients/${clientId}`;
}

export function pushClientDetail(
  navigator: ClientDetailNavigator,
  clientId: EntityId,
) {
  navigator.push(clientDetailHref(clientId));
}
