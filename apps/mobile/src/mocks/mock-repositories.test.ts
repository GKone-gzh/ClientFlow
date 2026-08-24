import assert from "node:assert/strict";
import test from "node:test";

import { createMockRepositories } from "./mock-repositories";

test("provides the required mock client, project, and task coverage", async () => {
  const repositories = createMockRepositories();
  const clients = (await repositories.clients.list()).items;
  const projects = (
    await Promise.all(
      clients.map(async (client) =>
        (await repositories.projects.listByClient(client.id)).items,
      ),
    )
  ).flat();
  const tasks = (await repositories.tasks.list()).items;

  assert.equal(clients.length, 5);
  assert.equal(projects.length, 3);
  assert.equal(tasks.length, 5);
  assert.deepEqual(
    new Set(clients.map((client) => client.status)),
    new Set(["lead", "active", "inactive", "archived"]),
  );
});

test("creates a client through the public repository interface", async () => {
  const repositories = createMockRepositories();
  const created = await repositories.clients.create({
    name: "新客户",
    contactHandle: null,
    contactChannel: null,
    notes: null,
    status: "lead",
  });

  assert.equal(created.name, "新客户");
  assert.equal((await repositories.clients.list()).items.length, 6);
  assert.deepEqual(await repositories.clients.getById(created.id), created);
});

test("paginates deterministically with a stable timestamp and id cursor", async () => {
  const repositories = createMockRepositories();

  const first = await repositories.clients.list({ limit: 2 });
  const second = await repositories.clients.list({
    cursor: first.nextCursor,
    limit: 2,
  });

  assert.deepEqual(
    first.items.map(({ id }) => id),
    [
      "10000000-0000-4000-8000-000000000005",
      "10000000-0000-4000-8000-000000000004",
    ],
  );
  assert.deepEqual(
    second.items.map(({ id }) => id),
    [
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000002",
    ],
  );
  assert.equal(new Set([...first.items, ...second.items]).size, 4);
});

test("matches task pagination, status filters, and project batch semantics", async () => {
  const repositories = createMockRepositories();

  const first = await repositories.tasks.list({ limit: 2 });
  const second = await repositories.tasks.list({
    cursor: first.nextCursor,
    limit: 2,
  });
  const blocked = await repositories.tasks.list({ status: "blocked" });
  const projectIds = repositories.store.projects.slice(0, 2).map(({ id }) => id);
  const requirements =
    await repositories.requirements.listByProjectIds(projectIds);
  const tasks = await repositories.tasks.listByProjectIds(projectIds);

  assert.equal(first.items.length, 2);
  assert.equal(second.items.length, 2);
  assert.equal(new Set([...first.items, ...second.items]).size, 4);
  assert.deepEqual(blocked.items.map(({ status }) => status), ["blocked"]);
  assert.deepEqual(new Set(requirements.map(({ projectId }) => projectId)), new Set(projectIds));
  assert.deepEqual(new Set(tasks.map(({ projectId }) => projectId)), new Set(projectIds));
});
