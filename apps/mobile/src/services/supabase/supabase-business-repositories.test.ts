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
  const { client, filters } = createReadClient(rows);
  const repositories = createSupabaseBusinessRepositories(client);

  const detail = await loadClientDetail(repositories, CLIENT_ID);

  assert.equal(detail?.client.name, "Acme");
  assert.equal(detail?.projects[0]?.project.name, "Launch site");
  assert.equal(detail?.projects[0]?.requirements[0]?.content, "Responsive page");
  assert.equal(detail?.projects[0]?.tasks[0]?.title, "Build layout");
  assert.deepEqual(filters, [
    ["clients", "id", CLIENT_ID],
    ["projects", "client_id", CLIENT_ID],
    ["requirements", "project_id", PROJECT_ID],
    ["tasks", "project_id", PROJECT_ID],
  ]);
  assert.equal(filters.some(([, column]) => column === "user_id"), false);
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
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
    },
    from: (table: string) => new FakeQuery(table, tableRows[table] ?? [], filters),
  } as unknown as SupabaseClient;
  return { client, filters };
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private filteredRows: Record<string, unknown>[];

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

  order() {
    return this;
  }

  limit(limit: number) {
    this.filteredRows = this.filteredRows.slice(0, limit);
    return this;
  }

  async maybeSingle() {
    return { data: this.filteredRows[0] ?? null, error: null };
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.filteredRows, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}
