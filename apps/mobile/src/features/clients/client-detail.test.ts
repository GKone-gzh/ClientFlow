import assert from "node:assert/strict";
import test from "node:test";
import type {
  Client,
  Project,
  Requirement,
  Task,
} from "@clientflow/contracts";

import { loadClientDetail, type ClientDetailServices } from "./client-detail";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_ID = "10000000-0000-4000-8000-000000000001";
const NOW = "2026-08-24T08:00:00.000Z";

const client: Client = {
  id: CLIENT_ID,
  userId: USER_ID,
  name: "Acme",
  contactHandle: null,
  contactChannel: null,
  notes: null,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
};

const projects: Project[] = [
  createProject("20000000-0000-4000-8000-000000000001", "Project A"),
  createProject("20000000-0000-4000-8000-000000000002", "Project B"),
];

const requirements: Requirement[] = projects.map((project, index) => ({
  id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  userId: USER_ID,
  projectId: project.id,
  content: `Requirement ${index + 1}`,
  sortOrder: 0,
  sourceExtractionId: null,
  createdAt: NOW,
  updatedAt: NOW,
}));

const tasks: Task[] = projects.map((project, index) => ({
  id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  userId: USER_ID,
  projectId: project.id,
  requirementId: requirements[index]!.id,
  title: `Task ${index + 1}`,
  description: null,
  dueAt: null,
  sortOrder: 0,
  status: "todo",
  createdAt: NOW,
  updatedAt: NOW,
}));

test("loads and groups a client project page with two batch queries", async () => {
  const calls = {
    clients: 0,
    projects: 0,
    requirementBatches: [] as string[][],
    taskBatches: [] as string[][],
  };
  const services: ClientDetailServices = {
    clients: {
      getById: async () => {
        calls.clients += 1;
        return client;
      },
    },
    projects: {
      listByClient: async () => {
        calls.projects += 1;
        return { items: projects, nextCursor: "next-project-page" };
      },
    },
    requirements: {
      listByProjectIds: async (projectIds) => {
        calls.requirementBatches.push([...projectIds]);
        return requirements;
      },
    },
    tasks: {
      listByProjectIds: async (projectIds) => {
        calls.taskBatches.push([...projectIds]);
        return tasks.toReversed();
      },
    },
  };

  const detail = await loadClientDetail(services, CLIENT_ID);

  assert.equal(calls.clients, 1);
  assert.equal(calls.projects, 1);
  assert.deepEqual(calls.requirementBatches, [projects.map(({ id }) => id)]);
  assert.deepEqual(calls.taskBatches, [projects.map(({ id }) => id)]);
  assert.equal(detail?.nextProjectCursor, "next-project-page");
  assert.deepEqual(
    detail?.projects.map(({ project, requirements: grouped, tasks: groupedTasks }) => ({
      projectId: project.id,
      requirementIds: grouped.map(({ id }) => id),
      taskIds: groupedTasks.map(({ id }) => id),
    })),
    projects.map((project, index) => ({
      projectId: project.id,
      requirementIds: [requirements[index]!.id],
      taskIds: [tasks[index]!.id],
    })),
  );
});

function createProject(id: string, name: string): Project {
  return {
    id,
    userId: USER_ID,
    clientId: CLIENT_ID,
    name,
    summary: null,
    budgetAmount: null,
    budgetCurrency: null,
    dueDate: null,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  };
}
