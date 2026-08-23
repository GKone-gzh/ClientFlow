import assert from "node:assert/strict";
import test from "node:test";

import { authStorage } from "./session-storage";

test("Web auth storage keeps the Supabase storage interface without native APIs", async () => {
  const values = new Map<string, string>();
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });

  try {
    await authStorage.setItem("auth-key", "web-session");
    assert.equal(await authStorage.getItem("auth-key"), "web-session");
    await authStorage.removeItem("auth-key");
    assert.equal(await authStorage.getItem("auth-key"), null);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previous,
    });
  }
});
