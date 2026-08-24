import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { scanTrackedFile } from "./security-secret-scan.mjs";

test("detects credential-shaped values without returning the value", () => {
  const token = ["ghp", "a".repeat(36)].join("_");
  const findings = scanTrackedFile("src/config.ts", `const value = "${token}";`);

  assert.deepEqual(findings, [{ line: 1, rule: "GitHub access token" }]);
  assert.doesNotMatch(JSON.stringify(findings), new RegExp(token));
});

test("rejects tracked local env files and unapproved public variables", () => {
  assert.deepEqual(scanTrackedFile("apps/mobile/.env.local", "SAFE=value"), [
    { line: 1, rule: "tracked environment file" },
  ]);
  assert.deepEqual(
    scanTrackedFile(
      "apps/mobile/.env.example",
      "EXPO_PUBLIC_SUPABASE_URL=\nEXPO_PUBLIC_AI_PROVIDER=\n",
    ),
    [{ line: 2, rule: "unapproved public environment variable" }],
  );
});

test("rejects new public environment access outside the fail-closed guard", () => {
  const unapprovedAccess = [
    "process",
    "env",
    "EXPO_PUBLIC_NEW_CREDENTIAL",
  ].join(".");
  const rejectedSentinelAccess = [
    "process",
    "env",
    "EXPO_PUBLIC_DASHSCOPE_API_KEY",
  ].join(".");
  assert.deepEqual(
    scanTrackedFile(
      "apps/mobile/src/services/new-service.ts",
      `const value = ${unapprovedAccess};`,
    ),
    [{ line: 1, rule: "unapproved public environment access" }],
  );
  assert.deepEqual(
    scanTrackedFile(
      "apps/mobile/src/services/app-environment.ts",
      `const value = ${rejectedSentinelAccess};`,
    ),
    [],
  );
});

test("detects a privileged Supabase JWT without returning it", () => {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "service_role" })}.signature`;
  const findings = scanTrackedFile("src/config.ts", token);

  assert.deepEqual(findings, [{ line: 1, rule: "Supabase privileged JWT" }]);
  assert.doesNotMatch(JSON.stringify(findings), new RegExp(token));
});

test("allows the three approved public configuration names", () => {
  const example = [
    "EXPO_PUBLIC_APP_ADAPTER=mock",
    "EXPO_PUBLIC_SUPABASE_URL=",
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=",
  ].join("\n");

  assert.deepEqual(scanTrackedFile("apps/mobile/.env.example", example), []);
});
