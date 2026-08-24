import assert from "node:assert/strict";
import test from "node:test";
import type {
  CursorPage,
  ListTasksInput,
  Task,
  TaskRepository,
} from "@clientflow/contracts";

import { loadTaskPage } from "./task-queries";

const TASK: Task = {
  id: "40000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
  projectId: "20000000-0000-4000-8000-000000000001",
  requirementId: null,
  title: "Prepare launch",
  description: null,
  dueAt: null,
  sortOrder: 0,
  status: "blocked",
  createdAt: "2026-08-24T08:00:00.000Z",
  updatedAt: "2026-08-24T08:00:00.000Z",
};

test("loads task pages directly without traversing clients or projects", async () => {
  const calls: (ListTasksInput | undefined)[] = [];
  const pages: CursorPage<Task>[] = [
    { items: [TASK], nextCursor: "next-page" },
    { items: [], nextCursor: null },
  ];
  const services = {
    get clients(): never {
      throw new Error("clients repository must not be read");
    },
    get projects(): never {
      throw new Error("projects repository must not be read");
    },
    tasks: {
      list: async (input?: ListTasksInput) => {
        calls.push(input);
        return pages[calls.length - 1]!;
      },
    } satisfies Pick<TaskRepository, "list">,
  };

  const first = await loadTaskPage(services, { limit: 1, status: "blocked" });
  const second = await loadTaskPage(services, {
    cursor: first.nextCursor,
    limit: 1,
    status: "blocked",
  });

  assert.deepEqual(first.items, [TASK]);
  assert.deepEqual(second.items, []);
  assert.deepEqual(calls, [
    { limit: 1, status: "blocked" },
    { cursor: "next-page", limit: 1, status: "blocked" },
  ]);
});
