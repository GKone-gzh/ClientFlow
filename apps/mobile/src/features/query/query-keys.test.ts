import assert from "node:assert/strict";
import test from "node:test";

import { clientKeys, intakeKeys, taskKeys } from "./query-keys";

const ID = "00000000-0000-4000-8000-000000000001";

test("separates client lists and details under stable prefixes", () => {
  assert.deepEqual(clientKeys.list({ status: "active" }), [
    "clients",
    "list",
    { status: "active" },
  ]);
  assert.deepEqual(clientKeys.detail(ID), ["clients", "detail", ID]);
});

test("keeps task filters in the task list key", () => {
  assert.deepEqual(taskKeys.list({ status: ["todo", "blocked"] }), [
    "tasks",
    "list",
    { status: ["todo", "blocked"] },
  ]);
});

test("keys intake results by extraction id", () => {
  assert.deepEqual(intakeKeys.detail(ID), ["intake", "detail", ID]);
});
