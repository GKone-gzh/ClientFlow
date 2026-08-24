import assert from "node:assert/strict";
import test from "node:test";

import {
  clientDetailHref,
  completeIntakeNavigation,
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

  dismissAll() {
    this.routes.splice(1);
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

test("removes completed intake routes and returns detail back to Home", () => {
  const stack = new MemoryStack("/(app)/(tabs)/home");
  stack.routes.push("/(app)/intake/upload", "/(app)/intake/extraction/review");

  completeIntakeNavigation(stack, CLIENT_ID);
  stack.back();

  assert.deepEqual(stack.routes, ["/(app)/(tabs)/home"]);
});

test("preserves the Clients tab beneath a confirmed intake detail", () => {
  const stack = new MemoryStack("/(app)/(tabs)/clients");
  stack.routes.push("/(app)/intake/upload", "/(app)/intake/extraction/review");

  completeIntakeNavigation(stack, CLIENT_ID);
  completeIntakeNavigation(stack, CLIENT_ID);

  assert.deepEqual(stack.routes, [
    "/(app)/(tabs)/clients",
    `/(app)/clients/${CLIENT_ID}`,
  ]);
  stack.back();
  assert.deepEqual(stack.routes, ["/(app)/(tabs)/clients"]);
});
