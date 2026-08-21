import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../migrations/20260821000100_initial_schema.sql",
  import.meta.url,
);

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
  await db.exec(await readFile(migrationUrl, "utf8"));
  return db;
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
      select count(*)::integer as count
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and roles = array['authenticated']::name[]
    `);
    assert.equal(policies.rows[0].count, 28);

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
      /row-level security policy/i,
    );

    const changed = await db.query(`
      update public.clients
      set name = 'Forged Update'
      where id = '${clientB}'
      returning id
    `);
    assert.equal(changed.rows.length, 0);

    await assert.rejects(
      db.exec(`
        insert into public.requirements (user_id, project_id, content)
        values ('${userA}', '${projectB}', 'Forged Requirement')
      `),
      /foreign key constraint/i,
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

test("database constraints reject malformed upload and extraction metadata", async () => {
  const db = await createDatabase();
  const uploadId = "00000000-0000-4000-8000-00000000a701";

  try {
    await db.exec(`
      insert into auth.users (id) values ('${userA}');
      set role authenticated;
      select set_config('request.jwt.claim.sub', '${userA}', false);
    `);

    const validUpload = await db.query(`
      insert into public.uploads (
        id,
        storage_path,
        mime_type,
        byte_size
      )
      values (
        '${uploadId}',
        '${userA}/${uploadId}/source',
        'image/png',
        10485760
      )
      returning user_id
    `);
    assert.deepEqual(validUpload.rows, [{ user_id: userA }]);

    await assert.rejects(
      db.exec(`
        insert into public.uploads (
          storage_path,
          mime_type,
          byte_size
        )
        values ('${userB}/forged/source', 'image/png', 1024)
      `),
      /uploads_storage_path_canonical/i,
    );

    await assert.rejects(
      db.exec(`
        insert into public.uploads (
          id,
          storage_path,
          mime_type,
          byte_size
        )
        values (
          '00000000-0000-4000-8000-00000000a702',
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
          storage_path,
          mime_type,
          byte_size
        )
        values (
          '00000000-0000-4000-8000-00000000a703',
          '${userA}/00000000-0000-4000-8000-00000000a703/source',
          'image/webp',
          10485761
        )
      `),
      /uploads_byte_size_allowed/i,
    );

    await assert.rejects(
      db.exec(`
        insert into public.ai_extractions (upload_id, result)
        values ('${uploadId}', '{"client": {}}'::jsonb)
      `),
      /ai_extractions_result_schema_version_matches/i,
    );
  } finally {
    await db.close();
  }
});
