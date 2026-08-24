import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const migrationsDirectoryUrl = new URL("../migrations/", import.meta.url);
const migrationFilePattern = /^(?<version>\d{14})_[a-z0-9_]+\.sql$/;

const userA = "00000000-0000-4000-8000-00000000a001";
const userB = "00000000-0000-4000-8000-00000000b001";
const clientA = "00000000-0000-4000-8000-00000000a101";
const clientB = "00000000-0000-4000-8000-00000000b101";
const projectB = "00000000-0000-4000-8000-00000000b201";

const validExtractionResult = {
  schemaVersion: 1,
  client: {
    name: "Acme",
    contactHandle: "@acme",
    contactChannel: "wechat",
  },
  project: {
    name: "Launch site",
    summary: "A focused launch",
    budgetAmount: 12000,
    budgetCurrency: "CNY",
    dueDate: "2026-09-30",
  },
  requirements: [{ content: "Responsive page", sortOrder: 0 }],
  suggestedTasks: [
    {
      title: "Build layout",
      description: null,
      requirementIndex: 0,
      sortOrder: 0,
    },
  ],
  confidence: 0.91,
  warnings: [],
};

const bootstrapSql = `
  create schema auth;
  create schema storage;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create table auth.users (
    id uuid primary key,
    raw_user_meta_data jsonb
  );

  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  create function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`;

async function createDatabase() {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(bootstrapSql);

  for (const migration of await readMigrations()) {
    await db.exec(migration.sql);
  }

  return db;
}

async function readMigrations() {
  const entries = await readdir(migrationsDirectoryUrl, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  assert.ok(fileNames.length > 0, "at least one SQL migration is required");

  const versions = fileNames.map((fileName) => {
    const match = migrationFilePattern.exec(fileName);
    assert.ok(match, `invalid migration filename: ${fileName}`);
    return match.groups.version;
  });

  assert.equal(
    new Set(versions).size,
    versions.length,
    "migration timestamp prefixes must be unique",
  );

  const migrations = [];
  for (const fileName of fileNames) {
    const fileUrl = new URL(fileName, migrationsDirectoryUrl);
    let sql;

    try {
      sql = await readFile(fileUrl, "utf8");
    } catch (error) {
      throw new Error(`failed to read migration: ${fileName}`, { cause: error });
    }

    assert.ok(sql.trim().length > 0, `migration is empty: ${fileName}`);
    migrations.push({ fileName, sql });
  }

  return migrations;
}

test("initial migration creates the contracted schema and forced RLS", async () => {
  const db = await createDatabase();

  try {
    const tables = await db.query(`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_catalog.pg_class
      where oid in (
        'public.profiles'::regclass,
        'public.clients'::regclass,
        'public.projects'::regclass,
        'public.requirements'::regclass,
        'public.tasks'::regclass,
        'public.uploads'::regclass,
        'public.ai_extractions'::regclass
      )
      order by relname
    `);

    assert.equal(tables.rows.length, 7);
    assert.ok(
      tables.rows.every(
        ({ relforcerowsecurity, relrowsecurity }) =>
          relrowsecurity && relforcerowsecurity,
      ),
    );

    const policies = await db.query(`
      select policyname
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and roles = array['authenticated']::name[]
      order by policyname
    `);
    assert.deepEqual(
      policies.rows.map(({ policyname }) => policyname),
      [
        "ai_extractions_select_own",
        "clients_insert_own",
        "clients_select_own",
        "clients_update_own",
        "profiles_select_own",
        "profiles_update_own",
        "projects_insert_own",
        "projects_select_own",
        "projects_update_own",
        "requirements_select_own",
        "tasks_select_own",
        "uploads_select_own",
      ],
    );

    const privileges = await db.query(`
      select
        table_name,
        has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') as can_select,
        has_table_privilege('authenticated', 'public.' || table_name, 'INSERT') as can_insert,
        has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE') as can_update,
        has_table_privilege('authenticated', 'public.' || table_name, 'DELETE') as can_delete
      from (
        values
          ('profiles'),
          ('clients'),
          ('projects'),
          ('requirements'),
          ('tasks'),
          ('uploads'),
          ('ai_extractions')
      ) as expected_tables (table_name)
      order by table_name
    `);
    assert.deepEqual(privileges.rows, [
      {
        table_name: "ai_extractions",
        can_select: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
      },
      {
        table_name: "clients",
        can_select: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
      },
      {
        table_name: "profiles",
        can_select: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
      },
      {
        table_name: "projects",
        can_select: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
      },
      {
        table_name: "requirements",
        can_select: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
      },
      {
        table_name: "tasks",
        can_select: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
      },
      {
        table_name: "uploads",
        can_select: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
      },
    ]);

    const columnPrivileges = await db.query(`
      select
        has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE') as profile_display_name_update,
        has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE') as profile_created_at_update,
        has_column_privilege('authenticated', 'public.clients', 'name', 'INSERT') as client_name_insert,
        has_column_privilege('authenticated', 'public.clients', 'name', 'UPDATE') as client_name_update,
        has_column_privilege('authenticated', 'public.clients', 'user_id', 'INSERT') as client_user_id_insert,
        has_column_privilege('authenticated', 'public.clients', 'created_at', 'UPDATE') as client_created_at_update,
        has_column_privilege('authenticated', 'public.projects', 'client_id', 'INSERT') as project_client_id_insert,
        has_column_privilege('authenticated', 'public.projects', 'client_id', 'UPDATE') as project_client_id_update,
        has_column_privilege('authenticated', 'public.projects', 'name', 'UPDATE') as project_name_update,
        has_column_privilege('authenticated', 'public.projects', 'created_at', 'UPDATE') as project_created_at_update
    `);
    assert.deepEqual(columnPrivileges.rows, [
      {
        profile_display_name_update: true,
        profile_created_at_update: false,
        client_name_insert: true,
        client_name_update: true,
        client_user_id_insert: false,
        client_created_at_update: false,
        project_client_id_insert: true,
        project_client_id_update: false,
        project_name_update: true,
        project_created_at_update: false,
      },
    ]);

    const enums = await db.query(`
      select type.typname, array_agg(enum.enumlabel order by enum.enumsortorder) as labels
      from pg_catalog.pg_type as type
      join pg_catalog.pg_enum as enum on enum.enumtypid = type.oid
      where type.typnamespace = 'public'::regnamespace
      group by type.typname
      order by type.typname
    `);
    assert.deepEqual(enums.rows, [
      {
        typname: "ai_extraction_status",
        labels: ["queued", "processing", "needs_review", "confirmed", "failed"],
      },
      {
        typname: "client_status",
        labels: ["lead", "active", "inactive", "archived"],
      },
      {
        typname: "project_status",
        labels: [
          "draft",
          "active",
          "on_hold",
          "completed",
          "cancelled",
          "archived",
        ],
      },
      {
        typname: "task_status",
        labels: ["todo", "in_progress", "blocked", "done", "cancelled"],
      },
      {
        typname: "upload_status",
        labels: ["pending", "uploaded", "processing", "completed", "failed"],
      },
    ]);
  } finally {
    await db.close();
  }
});

test("RLS and composite foreign keys isolate two authenticated users", async () => {
  const db = await createDatabase();
  const requirementB = "00000000-0000-4000-8000-00000000b301";
  const taskB = "00000000-0000-4000-8000-00000000b401";
  const uploadB = "00000000-0000-4000-8000-00000000b701";
  const extractionB = "00000000-0000-4000-8000-00000000b801";

  try {
    await db.exec(`
      insert into auth.users (id) values ('${userA}'), ('${userB}');

      insert into public.clients (id, user_id, name)
      values
        ('${clientA}', '${userA}', 'User A Client'),
        ('${clientB}', '${userB}', 'User B Client');

      insert into public.projects (id, user_id, client_id, name)
      values (
        '${projectB}',
        '${userB}',
        '${clientB}',
        'User B Project'
      );

      insert into public.requirements (id, user_id, project_id, content)
      values ('${requirementB}', '${userB}', '${projectB}', 'User B Requirement');

      insert into public.tasks (
        id,
        user_id,
        project_id,
        requirement_id,
        title
      )
      values (
        '${taskB}',
        '${userB}',
        '${projectB}',
        '${requirementB}',
        'User B Task'
      );

      insert into public.uploads (
        id,
        user_id,
        storage_path,
        mime_type,
        byte_size
      )
      values (
        '${uploadB}',
        '${userB}',
        '${userB}/${uploadB}/source',
        'image/png',
        1024
      );

      insert into public.ai_extractions (id, user_id, upload_id)
      values ('${extractionB}', '${userB}', '${uploadB}');

    `);

    await assert.rejects(
      db.exec(`
        insert into public.requirements (user_id, project_id, content)
        values ('${userA}', '${projectB}', 'Forged Requirement')
      `),
      /foreign key constraint/i,
    );

    await db.exec(`
      set role authenticated;
      select set_config('request.jwt.claim.sub', '${userA}', false);
    `);

    const visibleClients = await db.query(
      "select id from public.clients order by id",
    );
    assert.deepEqual(visibleClients.rows, [{ id: clientA }]);

    const visibleProfiles = await db.query(
      "select id from public.profiles order by id",
    );
    assert.deepEqual(visibleProfiles.rows, [{ id: userA }]);

    const hiddenResourceCounts = await db.query(`
      select
        (select count(*)::integer from public.projects) as projects,
        (select count(*)::integer from public.requirements) as requirements,
        (select count(*)::integer from public.tasks) as tasks,
        (select count(*)::integer from public.uploads) as uploads,
        (select count(*)::integer from public.ai_extractions) as extractions
    `);
    assert.deepEqual(hiddenResourceCounts.rows, [
      {
        projects: 0,
        requirements: 0,
        tasks: 0,
        uploads: 0,
        extractions: 0,
      },
    ]);

    await assert.rejects(
      db.exec(`
        insert into public.clients (user_id, name)
        values ('${userB}', 'Forged Client')
      `),
      /permission denied/i,
    );

    const changed = await db.query(`
      update public.clients
      set name = 'Forged Update'
      where id = '${clientB}'
      returning id
    `);
    assert.equal(changed.rows.length, 0);

    await assert.rejects(
      db.exec(`delete from public.clients where id = '${clientB}'`),
      /permission denied/i,
    );

    await assert.rejects(
      db.exec(`
        insert into public.requirements (user_id, project_id, content)
        values ('${userA}', '${projectB}', 'Forged Requirement')
      `),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});

test("anonymous users have neither table privileges nor data access", async () => {
  const db = await createDatabase();

  try {
    await db.exec(`
      insert into auth.users (id) values ('${userA}');
      insert into public.clients (id, user_id, name)
      values ('${clientA}', '${userA}', 'User A Client');
      set role anon;
    `);

    await assert.rejects(
      db.query("select id from public.clients"),
      /permission denied/i,
    );
    await assert.rejects(
      db.exec("insert into public.clients (name) values ('Anonymous Client')"),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});

test("constraints and least privilege protect ingestion metadata", async () => {
  const db = await createDatabase();
  const uploadId = "00000000-0000-4000-8000-00000000a701";
  const extractionId = "00000000-0000-4000-8000-00000000a801";

  try {
    await db.exec(`
      insert into auth.users (id) values ('${userA}');
      insert into public.uploads (
        id,
        user_id,
        storage_path,
        mime_type,
        byte_size
      )
      values (
        '${uploadId}',
        '${userA}',
        '${userA}/${uploadId}/source',
        'image/png',
        10485760
      );
      insert into public.ai_extractions (id, user_id, upload_id)
      values ('${extractionId}', '${userA}', '${uploadId}');
    `);

    await assert.rejects(
      db.exec(`
        insert into public.uploads (
          user_id,
          storage_path,
          mime_type,
          byte_size
        )
        values ('${userA}', '${userB}/forged/source', 'image/png', 1024)
      `),
      /uploads_storage_path_canonical/i,
    );

    await assert.rejects(
      db.exec(`
        insert into public.uploads (
          id,
          user_id,
          storage_path,
          mime_type,
          byte_size
        )
        values (
          '00000000-0000-4000-8000-00000000a702',
          '${userA}',
          '${userA}/00000000-0000-4000-8000-00000000a702/source',
          'image/gif',
          1024
        )
      `),
      /uploads_mime_type_allowed/i,
    );

    await assert.rejects(
      db.exec(`
        insert into public.uploads (
          id,
          user_id,
          storage_path,
          mime_type,
          byte_size
        )
        values (
          '00000000-0000-4000-8000-00000000a703',
          '${userA}',
          '${userA}/00000000-0000-4000-8000-00000000a703/source',
          'image/webp',
          10485761
        )
      `),
      /uploads_byte_size_allowed/i,
    );

    await assert.rejects(
      db.exec(`
        update public.ai_extractions
        set result = '{"client": {}}'::jsonb
        where id = '${extractionId}'
      `),
      /ai_extractions_result_schema_version_matches/i,
    );

    await db.exec(`
      set role authenticated;
      select set_config('request.jwt.claim.sub', '${userA}', false);
    `);

    const ownClient = await db.query(`
      insert into public.clients (name)
      values ('Session-owned Client')
      returning user_id
    `);
    assert.deepEqual(ownClient.rows, [{ user_id: userA }]);

    await assert.rejects(
      db.exec(`
        insert into public.uploads (
          id,
          storage_path,
          mime_type,
          byte_size,
          status
        )
        values (
          '00000000-0000-4000-8000-00000000a704',
          '${userA}/00000000-0000-4000-8000-00000000a704/source',
          'image/png',
          1,
          'completed'
        )
      `),
      /permission denied/i,
    );

    await assert.rejects(
      db.exec(`
        update public.uploads
        set status = 'completed'
        where id = '${uploadId}'
      `),
      /permission denied/i,
    );

    await assert.rejects(
      db.exec(`
        insert into public.ai_extractions (
          upload_id,
          status,
          provider,
          model,
          result
        )
        values (
          '${uploadId}',
          'needs_review',
          'forged-provider',
          'forged-model',
          '{"schemaVersion": 1}'::jsonb
        )
      `),
      /permission denied/i,
    );

    await assert.rejects(
      db.exec(`
        update public.ai_extractions
        set
          status = 'needs_review',
          provider = 'forged-provider',
          model = 'forged-model',
          result = '{"schemaVersion": 1}'::jsonb
        where id = '${extractionId}'
      `),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});

test("confirmation RPC is owner-bound, atomic, and idempotent", async () => {
  const db = await createDatabase();
  const uploadId = "00000000-0000-4000-8000-00000000a711";
  const extractionId = "00000000-0000-4000-8000-00000000a811";
  const invalidUploadId = "00000000-0000-4000-8000-00000000a712";
  const invalidExtractionId = "00000000-0000-4000-8000-00000000a812";
  const validResult = {
    schemaVersion: 1,
    client: {
      name: "Acme",
      contactHandle: "@acme",
      contactChannel: "wechat",
    },
    project: {
      name: "Launch site",
      summary: "A focused launch",
      budgetAmount: 12000,
      budgetCurrency: "CNY",
      dueDate: "2026-09-30",
    },
    requirements: [
      { content: "Responsive page", sortOrder: 0 },
      { content: "Contact form", sortOrder: 1 },
    ],
    suggestedTasks: [
      {
        title: "Build layout",
        description: null,
        requirementIndex: 0,
        sortOrder: 0,
      },
      {
        title: "Wire form",
        description: "Connect the endpoint",
        requirementIndex: 1,
        sortOrder: 1,
      },
    ],
    confidence: 0.91,
    warnings: [],
  };

  const callConfirmation = (id, result) =>
    db.query(
      `select * from public.confirm_extraction($1::uuid, $2::jsonb)`,
      [id, JSON.stringify(result)],
    );

  try {
    await db.exec(`
      insert into auth.users (id) values ('${userA}'), ('${userB}');
      insert into public.uploads (
        id,
        user_id,
        storage_path,
        mime_type,
        byte_size,
        status
      )
      values
        (
          '${uploadId}',
          '${userA}',
          '${userA}/${uploadId}/source',
          'image/png',
          1024,
          'completed'
        ),
        (
          '${invalidUploadId}',
          '${userA}',
          '${userA}/${invalidUploadId}/source',
          'image/png',
          1024,
          'completed'
        );
      insert into public.ai_extractions (
        id,
        user_id,
        upload_id,
        status,
        result
      )
      values
        (
          '${extractionId}',
          '${userA}',
          '${uploadId}',
          'needs_review',
          '${JSON.stringify(validResult)}'::jsonb
        ),
        (
          '${invalidExtractionId}',
          '${userA}',
          '${invalidUploadId}',
          'needs_review',
          '${JSON.stringify(validResult)}'::jsonb
        );
      set role authenticated;
      select set_config('request.jwt.claim.sub', '${userB}', false);
    `);

    await assert.rejects(
      callConfirmation(extractionId, validResult),
      /extraction not found/i,
    );

    await db.exec(
      `select set_config('request.jwt.claim.sub', '${userA}', false)`,
    );

    const beforeInvalid = await db.query(
      "select count(*)::integer as count from public.clients",
    );
    await assert.rejects(
      callConfirmation(invalidExtractionId, {
        ...validResult,
        suggestedTasks: [
          { ...validResult.suggestedTasks[0], requirementIndex: 99 },
        ],
      }),
      /invalid extraction result/i,
    );
    const afterInvalid = await db.query(
      "select count(*)::integer as count from public.clients",
    );
    assert.deepEqual(afterInvalid.rows, beforeInvalid.rows);

    const first = await callConfirmation(extractionId, validResult);
    assert.equal(first.rows.length, 1);
    assert.equal(first.rows[0].requirement_ids.length, 2);
    assert.equal(first.rows[0].task_ids.length, 2);

    const second = await callConfirmation(extractionId, {
      ...validResult,
      client: { ...validResult.client, name: "Ignored retry mutation" },
    });
    assert.deepEqual(second.rows, first.rows);

    const createdCounts = await db.query(`
      select
        (select count(*)::integer from public.clients) as clients,
        (select count(*)::integer from public.projects) as projects,
        (select count(*)::integer from public.requirements) as requirements,
        (select count(*)::integer from public.tasks) as tasks
    `);
    assert.deepEqual(createdCounts.rows, [
      { clients: 1, projects: 1, requirements: 2, tasks: 2 },
    ]);

    const confirmation = await db.query(`
      select status, result -> 'client' ->> 'name' as client_name
      from public.ai_extractions
      where id = '${extractionId}'
    `);
    assert.deepEqual(confirmation.rows, [
      { status: "confirmed", client_name: "Acme" },
    ]);

    await db.exec(`
      reset role;
      create function public.force_task_failure_for_test()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'forced task failure';
      end;
      $$;
      create trigger force_task_failure_for_test
      before insert on public.tasks
      for each row execute function public.force_task_failure_for_test();
      set role authenticated;
      select set_config('request.jwt.claim.sub', '${userA}', false);
    `);

    await assert.rejects(
      callConfirmation(invalidExtractionId, validResult),
      /forced task failure/i,
    );
    const afterForcedFailure = await db.query(`
      select
        (select count(*)::integer from public.clients) as clients,
        (select count(*)::integer from public.projects) as projects,
        (select count(*)::integer from public.requirements) as requirements,
        (select count(*)::integer from public.tasks) as tasks,
        (
          select status
          from public.ai_extractions
          where id = '${invalidExtractionId}'
        ) as failed_confirmation_status
    `);
    assert.deepEqual(afterForcedFailure.rows, [
      {
        clients: 1,
        projects: 1,
        requirements: 2,
        tasks: 2,
        failed_confirmation_status: "needs_review",
      },
    ]);

    await db.exec(`
      reset role;
      set role anon;
      select set_config('request.jwt.claim.sub', '', false);
    `);
    await assert.rejects(
      callConfirmation(extractionId, validResult),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});

test("private screenshot bucket is constrained and not public", async () => {
  const db = await createDatabase();

  try {
    const bucket = await db.query(`
      select id, public, file_size_limit, allowed_mime_types
      from storage.buckets
      where id = 'chat-screenshots'
    `);
    assert.deepEqual(bucket.rows, [
      {
        id: "chat-screenshots",
        public: false,
        file_size_limit: 10485760,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
      },
    ]);
  } finally {
    await db.close();
  }
});

test("AI reservations are server-only, concurrent-safe, and user-isolated", async () => {
  const db = await createDatabase();
  const uploadA1 = "00000000-0000-4000-8000-00000000a901";
  const uploadA2 = "00000000-0000-4000-8000-00000000a902";
  const uploadB1 = "00000000-0000-4000-8000-00000000b901";
  const requestA1 = "10000000-0000-4000-8000-000000000001";
  const requestA2 = "10000000-0000-4000-8000-000000000002";
  const requestB1 = "10000000-0000-4000-8000-000000000003";

  const reserve = (userId, uploadId, requestId) =>
    db.query(
      `select * from public.reserve_ai_extraction(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        'qwen',
        'qwen3-vl-plus'
      )`,
      [userId, uploadId, requestId],
    );

  try {
    await db.exec(`
      insert into auth.users (id) values ('${userA}'), ('${userB}');
      insert into public.uploads (
        id,
        user_id,
        storage_path,
        mime_type,
        byte_size,
        status
      )
      values
        ('${uploadA1}', '${userA}', '${userA}/${uploadA1}/source', 'image/png', 10, 'uploaded'),
        ('${uploadA2}', '${userA}', '${userA}/${uploadA2}/source', 'image/png', 10, 'uploaded'),
        ('${uploadB1}', '${userB}', '${userB}/${uploadB1}/source', 'image/png', 10, 'uploaded');
      set role authenticated;
      select set_config('request.jwt.claim.sub', '${userA}', false);
    `);

    await assert.rejects(
      reserve(userA, uploadA1, requestA1),
      /permission denied/i,
    );

    await db.exec("reset role; set role service_role");
    const [first, duplicate] = await Promise.allSettled([
      reserve(userA, uploadA1, requestA1),
      reserve(userA, uploadA1, requestA2),
    ]);
    assert.equal(
      [first, duplicate].filter(({ status }) => status === "fulfilled").length,
      1,
    );
    assert.equal(
      [first, duplicate].filter(({ status }) => status === "rejected").length,
      1,
    );

    await assert.rejects(
      reserve(userA, uploadA2, requestA2),
      /concurrent extraction limit reached/i,
    );
    const independent = await reserve(userB, uploadB1, requestB1);
    assert.equal(independent.rows[0].should_invoke_provider, true);

    await db.exec("reset role");
    const state = await db.query(`
      select
        (select count(*)::integer from public.ai_extractions) as extractions,
        (select count(*)::integer from private.ai_usage) as usage,
        (
          select count(*)::integer
          from public.uploads
          where status = 'processing'
        ) as processing_uploads
    `);
    assert.deepEqual(state.rows, [
      { extractions: 2, usage: 2, processing_uploads: 2 },
    ]);

    const usageColumns = await db.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'private'
        and table_name = 'ai_usage'
      order by ordinal_position
    `);
    assert.deepEqual(
      usageColumns.rows.map(({ column_name }) => column_name),
      [
        "id",
        "user_id",
        "extraction_id",
        "request_id",
        "provider",
        "model",
        "started_at",
        "completed_at",
        "status",
        "duration_ms",
        "attempt_count",
        "input_tokens",
        "output_tokens",
        "error_code",
      ],
    );

    await db.exec(`
      set role authenticated;
      select set_config('request.jwt.claim.sub', '${userA}', false);
    `);
    await assert.rejects(
      db.query("select * from private.ai_usage"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("update private.ai_rate_limit_config set minute_limit = 999"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query(
        `select * from public.complete_ai_extraction(
          '${userA}'::uuid,
          '${uploadA1}'::uuid,
          '${JSON.stringify(validExtractionResult)}'::jsonb,
          1,
          1,
          null,
          null
        )`,
      ),
      /permission denied/i,
    );
    await assert.rejects(
      db.query(
        `select * from public.fail_ai_extraction(
          '${userA}'::uuid,
          '${uploadA1}'::uuid,
          'forged_failure',
          1,
          1
        )`,
      ),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});

test("AI rolling limits and usage completion are enforced before Provider work", async () => {
  const db = await createDatabase();
  const uploadIds = Array.from(
    { length: 5 },
    (_, index) => `00000000-0000-4000-8000-00000000aa0${index + 1}`,
  );
  const uploadB = "00000000-0000-4000-8000-00000000bb01";
  let requestCounter = 10;

  const reserve = async (userId, uploadId) => {
    requestCounter += 1;
    return db.query(
      `select * from public.reserve_ai_extraction(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        'qwen',
        'qwen3-vl-plus'
      )`,
      [
        userId,
        uploadId,
        `20000000-0000-4000-8000-${requestCounter.toString().padStart(12, "0")}`,
      ],
    );
  };
  const complete = (userId, extractionId) =>
    db.query(
      `select * from public.complete_ai_extraction(
        $1::uuid,
        $2::uuid,
        $3::jsonb,
        250,
        1,
        120,
        40
      )`,
      [userId, extractionId, JSON.stringify(validExtractionResult)],
    );

  try {
    await db.exec(`
      insert into auth.users (id) values ('${userA}'), ('${userB}');
      update private.ai_rate_limit_config
      set minute_limit = 2, hour_limit = 3, daily_limit = 4
      where id = 1;
      insert into public.uploads (
        id,
        user_id,
        storage_path,
        mime_type,
        byte_size,
        status
      )
      select
        id,
        '${userA}'::uuid,
        '${userA}/' || id::text || '/source',
        'image/png',
        10,
        'uploaded'::public.upload_status
      from unnest(array[${uploadIds.map((id) => `'${id}'::uuid`).join(",")}]) as ids (id);
      insert into public.uploads (
        id,
        user_id,
        storage_path,
        mime_type,
        byte_size,
        status
      ) values (
        '${uploadB}',
        '${userB}',
        '${userB}/${uploadB}/source',
        'image/png',
        10,
        'uploaded'
      );
      set role service_role;
    `);

    for (const uploadId of uploadIds.slice(0, 2)) {
      const reservation = await reserve(userA, uploadId);
      await complete(userA, reservation.rows[0].extraction_id);
    }
    await assert.rejects(reserve(userA, uploadIds[2]), /minute extraction limit/i);

    await db.exec(`
      reset role;
      update private.ai_usage
      set started_at = clock_timestamp() - interval '2 minutes'
      where user_id = '${userA}';
      set role service_role;
    `);
    const third = await reserve(userA, uploadIds[2]);
    await complete(userA, third.rows[0].extraction_id);
    await assert.rejects(reserve(userA, uploadIds[3]), /hour extraction limit/i);

    await db.exec(`
      reset role;
      update private.ai_usage
      set started_at = clock_timestamp() - interval '2 hours'
      where user_id = '${userA}';
      set role service_role;
    `);
    const fourth = await reserve(userA, uploadIds[3]);
    await complete(userA, fourth.rows[0].extraction_id);
    await assert.rejects(reserve(userA, uploadIds[4]), /daily extraction quota/i);

    const userBReservation = await reserve(userB, uploadB);
    assert.equal(userBReservation.rows[0].should_invoke_provider, true);

    await db.exec("reset role");
    const completedUsage = await db.query(`
      select
        status,
        duration_ms,
        attempt_count,
        input_tokens,
        output_tokens,
        error_code
      from private.ai_usage
      where user_id = '${userA}'
      order by request_id
      limit 1
    `);
    assert.deepEqual(completedUsage.rows, [
      {
        status: "completed",
        duration_ms: 250,
        attempt_count: 1,
        input_tokens: 120,
        output_tokens: 40,
        error_code: null,
      },
    ]);

    const completedExtractionId = third.rows[0].extraction_id;
    await db.exec("set role service_role");
    const sequentialRetry = await reserve(userA, uploadIds[2]);
    assert.equal(sequentialRetry.rows[0].extraction_id, completedExtractionId);
    assert.equal(sequentialRetry.rows[0].should_invoke_provider, false);
    await db.exec("reset role");
    const duplicateUsage = await db.query(`
      select count(*)::integer as count
      from private.ai_usage
      where extraction_id = '${completedExtractionId}'
    `);
    assert.deepEqual(duplicateUsage.rows, [{ count: 1 }]);
  } finally {
    await db.close();
  }
});
