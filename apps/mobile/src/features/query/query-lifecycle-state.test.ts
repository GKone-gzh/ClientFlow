import assert from "node:assert/strict";
import test from "node:test";

import { isAppFocused, isNetworkOnline } from "./query-lifecycle-state";

test("treats only the active native app state as focused", () => {
  assert.equal(isAppFocused("active"), true);
  assert.equal(isAppFocused("background"), false);
  assert.equal(isAppFocused("inactive"), false);
});

test("requires a connected network without a known reachability failure", () => {
  assert.equal(
    isNetworkOnline({ isConnected: true, isInternetReachable: true }),
    true,
  );
  assert.equal(
    isNetworkOnline({ isConnected: true, isInternetReachable: null }),
    true,
  );
  assert.equal(
    isNetworkOnline({ isConnected: false, isInternetReachable: true }),
    false,
  );
  assert.equal(
    isNetworkOnline({ isConnected: true, isInternetReachable: false }),
    false,
  );
});
