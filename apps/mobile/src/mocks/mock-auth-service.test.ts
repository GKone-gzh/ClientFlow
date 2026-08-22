import assert from "node:assert/strict";
import test from "node:test";

import { MockAuthService } from "./mock-auth-service";

test("mock auth follows the same restore, change, and sign-out contract", async () => {
  const auth = new MockAuthService();
  const changes: Array<string | null> = [];
  const unsubscribe = auth.onSessionChange((session) => {
    changes.push(session?.user.email ?? null);
  });

  assert.equal(await auth.getSession(), null);
  const signedIn = await auth.signInWithPassword({
    email: " Test@Example.com ",
    password: "123456",
  });
  assert.equal(signedIn.user.email, "test@example.com");
  assert.deepEqual(await auth.getSession(), signedIn);

  await auth.signOut();
  assert.equal(await auth.getSession(), null);
  assert.deepEqual(changes, ["test@example.com", null]);
  unsubscribe();
});

test("mock sign-up returns an immediate session and validates credentials", async () => {
  const auth = new MockAuthService();
  const result = await auth.signUpWithPassword({
    email: "new@example.com",
    password: "123456",
  });

  assert.equal(result.requiresEmailConfirmation, false);
  assert.equal(result.session?.user.email, "new@example.com");
  await assert.rejects(
    auth.signInWithPassword({ email: "invalid", password: "short" }),
    { code: "validation_failed" },
  );
});
