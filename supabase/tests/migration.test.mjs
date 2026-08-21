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

const bootstrapSql = `
  create schema auth;
  create role anon nologin;
  create role authenticated nologin;

  create table auth.users (
    id uuid primary key,
    raw_user_meta_data jsonb
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
