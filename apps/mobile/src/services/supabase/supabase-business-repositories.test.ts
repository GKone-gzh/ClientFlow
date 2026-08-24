import assert from "node:assert/strict";
import test from "node:test";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { loadClientDetail } from "@/features/clients/client-detail";
import { createSupabaseBusinessRepositories } from "@/services/supabase/supabase-business-repositories";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_ID = "00000000-0000-4000-8000-000000000901";
const PROJECT_ID = "00000000-0000-4000-8000-000000000902";
const REQUIREMENT_ID = "00000000-0000-4000-8000-000000000903";
const TASK_ID = "00000000-0000-4000-8000-000000000904";
const NOW = "2026-08-23T00:00:00.000Z";

const rows = {
  clients: [
    {
      id: CLIENT_ID,
      user_id: USER_ID,
      name: "Acme",
      contact_handle: "@acme",
      contact_channel: "wechat",
      notes: null,
      status: "lead",
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  projects: [
    {
      id: PROJECT_ID,
      user_id: USER_ID,
      client_id: CLIENT_ID,
      name: "Launch site",
      summary: "A focused launch",
      budget_amount: "12000.00",
      budget_currency: "CNY",
      due_date: "2026-09-30",
      status: "draft",
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  requirements: [
    {
      id: REQUIREMENT_ID,
      user_id: USER_ID,
      project_id: PROJECT_ID,
      content: "Responsive page",
      sort_order: 0,
      source_extraction_id: "00000000-0000-4000-8000-000000000801",
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  tasks: [
    {
      id: TASK_ID,
      user_id: USER_ID,
      project_id: PROJECT_ID,
      requirement_id: REQUIREMENT_ID,
      title: "Build layout",
      description: null,
      due_at: null,
      sort_order: 0,
      status: "todo",
      created_at: NOW,
      updated_at: NOW,
    },
  ],
};

test("loads a confirmed client graph through the real repository boundaries", async () => {
  const { client, filters, queries } = createReadClient(rows);
  const repositories = createSupabaseBusinessRepositories(client);

  const detail = await loadClientDetail(repositories, CLIENT_ID);

  assert.equal(detail?.client.name, "Acme");
  assert.equal(detail?.projects[0]?.project.name, "Launch site");
  assert.equal(detail?.projects[0]?.requirements[0]?.content, "Responsive page");
  assert.equal(detail?.projects[0]?.tasks[0]?.title, "Build layout");
  assert.deepEqual(queries, ["clients", "projects", "requirements", "tasks"]);
  assert.deepEqual(
    filters.filter(([, column]) => column === "user_id"),
    [
      ["projects", "user_id", USER_ID],
      ["requirements", "user_id", USER_ID],
      ["tasks", "user_id", USER_ID],
    ],
  );
});

test("paginates clients and tasks with stable cursors and status filters", async () => {
  const pageRows = {
    ...rows,
    clients: [
      rows.clients[0]!,
      { ...rows.clients[0]!, id: "00000000-0000-4000-8000-000000000907" },
      { ...rows.clients[0]!, id: "00000000-0000-4000-8000-000000000908" },
    ],
    tasks: [
      rows.tasks[0]!,
      {
        ...rows.tasks[0]!,
        id: "00000000-0000-4000-8000-000000000905",
        status: "blocked",
      },
      {
        ...rows.tasks[0]!,
        id: "00000000-0000-4000-8000-000000000906",
        status: "blocked",
      },
    ],
  };
  const { client, filters } = createReadClient(pageRows);
  const repositories = createSupabaseBusinessRepositories(client);

  const first = await repositories.clients.list({ limit: 2 });
  const second = await repositories.clients.list({
    cursor: first.nextCursor,
    limit: 2,
  });
  const blocked = await repositories.tasks.list({
    limit: 1,
    status: "blocked",
  });
  const nextBlocked = await repositories.tasks.list({
    cursor: blocked.nextCursor,
    limit: 1,
    status: "blocked",
  });

  assert.deepEqual(
    first.items.map(({ id }) => id),
    [
      "00000000-0000-4000-8000-000000000908",
      "00000000-0000-4000-8000-000000000907",
    ],
  );
  assert.deepEqual(second.items.map(({ id }) => id), [CLIENT_ID]);
  assert.deepEqual(blocked.items.map(({ id }) => id), [
    "00000000-0000-4000-8000-000000000906",
  ]);
  assert.deepEqual(nextBlocked.items.map(({ id }) => id), [
    "00000000-0000-4000-8000-000000000905",
  ]);
  assert.ok(
    filters.some(
      ([table, column, value]) =>
        table === "tasks" && column === "status" && value === "blocked",
    ),
  );
  assert.ok(
    filters.some(
      ([table, column, value]) =>
        table === "tasks" && column === "user_id" && value === USER_ID,
    ),
  );
});

test("loads requirements and tasks for project ids in one query per table", async () => {
  const secondProjectId = "00000000-0000-4000-8000-000000000912";
  const { client, filters, queries } = createReadClient({
    ...rows,
    requirements: [
      rows.requirements[0]!,
      {
        ...rows.requirements[0]!,
        id: "00000000-0000-4000-8000-000000000913",
        project_id: secondProjectId,
      },
    ],
    tasks: [
      rows.tasks[0]!,
      {
        ...rows.tasks[0]!,
        id: "00000000-0000-4000-8000-000000000914",
        project_id: secondProjectId,
      },
    ],
  });
  const repositories = createSupabaseBusinessRepositories(client);

  const requirements = await repositories.requirements.listByProjectIds([
    PROJECT_ID,
    secondProjectId,
  ]);
  const tasks = await repositories.tasks.listByProjectIds([
    PROJECT_ID,
    secondProjectId,
  ]);

  assert.equal(requirements.length, 2);
  assert.equal(tasks.length, 2);
  assert.deepEqual(queries, ["requirements", "tasks"]);
  assert.deepEqual(
    filters.filter(([, column]) => column === "project_id"),
    [
      ["requirements", "project_id", [PROJECT_ID, secondProjectId]],
      ["tasks", "project_id", [PROJECT_ID, secondProjectId]],
    ],
  );
});

test("requires a session and validates database rows", async () => {
  const unauthenticated = createReadClient(rows, null);
  const repositories = createSupabaseBusinessRepositories(
    unauthenticated.client,
  );
  await assert.rejects(repositories.clients.getById(CLIENT_ID), {
    code: "unauthenticated",
  });

  const invalid = createReadClient({ ...rows, clients: [{ id: CLIENT_ID }] });
  await assert.rejects(
    createSupabaseBusinessRepositories(invalid.client).clients.getById(
      CLIENT_ID,
    ),
    { code: "internal_error" },
  );
});

function createReadClient(
  tableRows: Record<string, Record<string, unknown>[]>,
  session: Session | null = { user: { id: USER_ID } } as Session,
) {
  const filters: [string, string, unknown][] = [];
  const queries: string[] = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
    },
    from: (table: string) => {
      queries.push(table);
      return new FakeQuery(table, tableRows[table] ?? [], filters);
    },
  } as unknown as SupabaseClient;
  return { client, filters, queries };
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private filteredRows: Record<string, unknown>[];
  private readonly orders: { ascending: boolean; column: string }[] = [];
  private rowLimit: number | null = null;

  constructor(
    private readonly table: string,
    rows: Record<string, unknown>[],
    private readonly filters: [string, string, unknown][],
  ) {
    this.filteredRows = rows;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([this.table, column, value]);
    this.filteredRows = this.filteredRows.filter((row) => row[column] === value);
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    this.filters.push([this.table, column, [...values]]);
    this.filteredRows = this.filteredRows.filter((row) =>
      values.includes(row[column]),
    );
    return this;
  }

  or(expression: string) {
    this.filters.push([this.table, "or", expression]);
    const match =
      /^(created_at|updated_at)\.lt\.([^,]+),and\(\1\.eq\.([^,]+),id\.lt\.([^)]+)\)$/.exec(
        expression,
      );
    if (!match) throw new Error(`Unsupported fake or filter: ${expression}`);
    const [, column, before, equal, id] = match;
    this.filteredRows = this.filteredRows.filter(
      (row) =>
        String(row[column!]) < before! ||
        (String(row[column!]) === equal && String(row.id) < id!),
    );
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ ascending: options?.ascending ?? true, column });
    return this;
  }

  limit(limit: number) {
    this.rowLimit = limit;
    return this;
  }

  async maybeSingle() {
    return { data: this.materialize()[0] ?? null, error: null };
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.materialize(), error: null }).then(
      onfulfilled,
      onrejected,
    );
  }

  private materialize() {
    const ordered = this.filteredRows.toSorted((left, right) => {
      for (const { ascending, column } of this.orders) {
        const comparison = String(left[column]).localeCompare(
          String(right[column]),
        );
        if (comparison !== 0) return ascending ? comparison : -comparison;
      }
      return 0;
    });
    return this.rowLimit === null ? ordered : ordered.slice(0, this.rowLimit);
  }
}
