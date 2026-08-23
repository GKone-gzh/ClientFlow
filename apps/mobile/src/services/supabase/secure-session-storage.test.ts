import assert from "node:assert/strict";
import test from "node:test";

import { createSecureSessionStorage } from "./secure-session-storage";

class MemorySecureStore {
  readonly values = new Map<string, string>();
  readonly setOptions: unknown[] = [];
  failOnKey: string | null = null;

  async deleteItemAsync(key: string) {
    this.values.delete(key);
  }

  async getItemAsync(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string, options?: unknown) {
    if (key === this.failOnKey) throw new Error("secure write failed");
    this.values.set(key, value);
    this.setOptions.push(options);
  }
}

class MemoryLegacyStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }
}

const SESSION_KEY = "sb-project-auth-token";

test("stores and restores a large Supabase Session only from secure chunks", async () => {
  const secure = new MemorySecureStore();
  const legacy = new MemoryLegacyStorage();
  const secureOptions = { accessible: "device-only" };
  const storage = createSecureSessionStorage(secure, legacy, {
    chunkSize: 256,
    createGeneration: () => "generation_one",
    secureStoreOptions: secureOptions,
  });
  const session = JSON.stringify({
    access_token: "access-value".repeat(200),
    refresh_token: "refresh-value".repeat(200),
  });

  await storage.setItem(SESSION_KEY, session);

  assert.equal(await storage.getItem(SESSION_KEY), session);
  assert.equal(legacy.values.has(SESSION_KEY), false);
  assert.ok(secure.values.size > 2);
  assert.ok(secure.setOptions.every((value) => value === secureOptions));
  assert.doesNotMatch(secure.values.get(SESSION_KEY)!, /access-value/);
});

test("migrates a legacy AsyncStorage Session once and removes the plaintext copy", async () => {
  const secure = new MemorySecureStore();
  const legacy = new MemoryLegacyStorage();
  const session = JSON.stringify({ access_token: "legacy", user: { id: "user-a" } });
  legacy.values.set(SESSION_KEY, session);
  const storage = createSecureSessionStorage(secure, legacy, {
    chunkSize: 256,
    createGeneration: () => "migration",
  });

  assert.equal(await storage.getItem(SESSION_KEY), session);
  assert.equal(legacy.values.has(SESSION_KEY), false);
  assert.equal(await storage.getItem(SESSION_KEY), session);
});

test("logout removes the secure Session chunks and any legacy value", async () => {
  const secure = new MemorySecureStore();
  const legacy = new MemoryLegacyStorage();
  const storage = createSecureSessionStorage(secure, legacy, {
    chunkSize: 256,
    createGeneration: () => "logout",
  });
  await storage.setItem(SESSION_KEY, "session-value".repeat(100));
  legacy.values.set(SESSION_KEY, "stale-legacy-session");

  await storage.removeItem(SESSION_KEY);

  assert.equal(await storage.getItem(SESSION_KEY), null);
  assert.equal(secure.values.size, 0);
  assert.equal(legacy.values.size, 0);
});

test("does not replace a restorable Session when a chunk write fails", async () => {
  const secure = new MemorySecureStore();
  const legacy = new MemoryLegacyStorage();
  let generation = "original";
  const storage = createSecureSessionStorage(secure, legacy, {
    chunkSize: 256,
    createGeneration: () => generation,
  });
  await storage.setItem(SESSION_KEY, "original-session");
  generation = "replacement";
  secure.failOnKey = `${SESSION_KEY}.cf.replacement.1`;

  await assert.rejects(
    storage.setItem(SESSION_KEY, "replacement".repeat(100)),
    /secure write failed/,
  );

  assert.equal(await storage.getItem(SESSION_KEY), "original-session");
  assert.equal(
    [...secure.values.keys()].some((key) => key.includes("replacement")),
    false,
  );
});

test("fails closed when a secure manifest is incomplete", async () => {
  const secure = new MemorySecureStore();
  const legacy = new MemoryLegacyStorage();
  const storage = createSecureSessionStorage(secure, legacy, {
    chunkSize: 256,
    createGeneration: () => "incomplete",
  });
  await storage.setItem(SESSION_KEY, "session".repeat(100));
  secure.values.delete(`${SESSION_KEY}.cf.incomplete.1`);
  legacy.values.set(SESSION_KEY, "must-not-fallback");

  assert.equal(await storage.getItem(SESSION_KEY), null);
  assert.equal(legacy.values.get(SESSION_KEY), "must-not-fallback");
});
