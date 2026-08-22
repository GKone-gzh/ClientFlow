import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const statusSource = await readFile(
  resolve(workspaceRoot, "packages", "contracts", "src", "statuses.ts"),
  "utf8",
);
const initialMigration = await readFile(
  resolve(
    workspaceRoot,
    "supabase",
    "migrations",
    "20260821000100_initial_schema.sql",
  ),
  "utf8",
);

const statusMappings = {
  AI_EXTRACTION_STATUSES: "ai_extraction_status",
  CLIENT_STATUSES: "client_status",
  PROJECT_STATUSES: "project_status",
  TASK_STATUSES: "task_status",
  UPLOAD_STATUSES: "upload_status",
};

function quotedValues(source) {
  return [...source.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function contractValues(constantName) {
  const match = statusSource.match(
    new RegExp(`export const ${constantName} = \\[([\\s\\S]*?)\\] as const;`),
  );
  assert.ok(match, `Missing contract status constant ${constantName}`);
  return quotedValues(match[1]);
}

function databaseValues(typeName) {
  const match = initialMigration.match(
    new RegExp(`create type public\\.${typeName} as enum \\(([\\s\\S]*?)\\);`, "i"),
  );
  assert.ok(match, `Missing database enum public.${typeName}`);
  return quotedValues(match[1]);
}

for (const [constantName, typeName] of Object.entries(statusMappings)) {
  test(`${constantName} matches public.${typeName}`, () => {
    assert.deepEqual(databaseValues(typeName), contractValues(constantName));
  });
}
