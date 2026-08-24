import assert from "node:assert/strict";
import test from "node:test";

import {
  clientDetailHref,
  pushClientDetail,
  type ClientDetailHref,
} from "./client-navigation";

class MemoryStack {
  readonly routes: string[];

  constructor(initialRoute: string) {
    this.routes = [initialRoute];
  }

  push(href: ClientDetailHref) {
    this.routes.push(href);
  }

  back() {
    if (this.routes.length > 1) this.routes.pop();
  }
}

const CLIENT_ID = "00000000-0000-4000-8000-000000000001";

test("builds the canonical client detail route without an origin parameter", () => {
  assert.equal(
    clientDetailHref(CLIENT_ID),
    `/(app)/clients/${CLIENT_ID}`,
  );
});

test("returns to Home after pushing a client detail", () => {
  const stack = new MemoryStack("/(app)/(tabs)/home");

  pushClientDetail(stack, CLIENT_ID);
  stack.back();

  assert.deepEqual(stack.routes, ["/(app)/(tabs)/home"]);
});

test("returns to Clients after pushing a client detail", () => {
  const stack = new MemoryStack("/(app)/(tabs)/clients");

  pushClientDetail(stack, CLIENT_ID);
  stack.back();

  assert.deepEqual(stack.routes, ["/(app)/(tabs)/clients"]);
});
