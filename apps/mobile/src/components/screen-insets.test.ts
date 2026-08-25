import assert from "node:assert/strict";
import test from "node:test";

import { SCREEN_INSET_EDGES } from "./screen-insets";

test("applies every system inset to fullscreen content", () => {
  assert.deepEqual(SCREEN_INSET_EDGES.fullscreen, [
    "top",
    "right",
    "bottom",
    "left",
  ]);
});

test("does not duplicate the top inset below a native header", () => {
  assert.deepEqual(SCREEN_INSET_EDGES["native-header"], [
    "right",
    "bottom",
    "left",
  ]);
});

test("lets the tab bar own the bottom gesture inset", () => {
  assert.deepEqual(SCREEN_INSET_EDGES.tabs, ["top", "right", "left"]);
});
