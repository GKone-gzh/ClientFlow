import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const authenticatedFunctions = [
  "prepare-upload",
  "mark-uploaded",
  "request-extraction",
  "get-extraction",
  "confirm-extraction",
];

test("all client-facing Edge Functions explicitly require platform JWT verification", async () => {
  const config = await readFile(
    new URL("../supabase/config.toml", import.meta.url),
    "utf8",
  );

  for (const functionName of authenticatedFunctions) {
    const section = config.match(
      new RegExp(
        `\\[functions\\.${escapeRegExp(functionName)}\\]([\\s\\S]*?)(?=\\n\\[|$)`,
        "u",
      ),
    );
    assert.ok(section, `Missing config for ${functionName}`);
    assert.match(section[1], /^\s*verify_jwt\s*=\s*true\s*$/mu);
  }

  assert.doesNotMatch(config, /^\s*verify_jwt\s*=\s*false\s*$/mu);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
