import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthDestination } from "./auth-routing";

const SESSION = {
  user: { id: "00000000-0000-4000-8000-000000000001", email: null },
};

test("does not redirect while a persisted session is restoring", () => {
  assert.equal(
    resolveAuthDestination({ isRestoring: true, session: null }),
    null,
  );
});

test("routes restored users to the app and signed-out users to auth", () => {
  assert.equal(
    resolveAuthDestination({ isRestoring: false, session: SESSION }),
    "/(app)/(tabs)/home",
  );
  assert.equal(
    resolveAuthDestination({ isRestoring: false, session: null }),
    "/(auth)/sign-in",
  );
});
