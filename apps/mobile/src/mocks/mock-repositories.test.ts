import assert from "node:assert/strict";
import test from "node:test";

import { createMockRepositories } from "./mock-repositories";

test("provides the required mock client, project, and task coverage", async () => {
  const repositories = createMockRepositories();
  const clients = await repositories.clients.list();
  const projects = (
    await Promise.all(
      clients.map((client) => repositories.projects.listByClient(client.id)),
    )
  ).flat();
  const tasks = (
    await Promise.all(
      projects.map((project) => repositories.tasks.listByProject(project.id)),
    )
  ).flat();

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
  assert.equal((await repositories.clients.list()).length, 6);
  assert.deepEqual(await repositories.clients.getById(created.id), created);
});
