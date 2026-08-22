begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

insert into auth.users (id)
values
  ('00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000b001');

insert into public.clients (id, user_id, name)
values
  (
    '00000000-0000-4000-8000-00000000a101',
    '00000000-0000-4000-8000-00000000a001',
    'User A Client'
  ),
  (
    '00000000-0000-4000-8000-00000000b101',
    '00000000-0000-4000-8000-00000000b001',
    'User B Client'
  );

insert into public.projects (id, user_id, client_id, name)
values
  (
    '00000000-0000-4000-8000-00000000a201',
    '00000000-0000-4000-8000-00000000a001',
    '00000000-0000-4000-8000-00000000a101',
    'User A Project'
  ),
  (
    '00000000-0000-4000-8000-00000000b201',
    '00000000-0000-4000-8000-00000000b001',
    '00000000-0000-4000-8000-00000000b101',
    'User B Project'
  );

insert into public.uploads (
  id,
  user_id,
  storage_path,
  mime_type,
  byte_size
)
values
  (
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a001',
    '00000000-0000-4000-8000-00000000a001/00000000-0000-4000-8000-00000000a301/source',
    'image/jpeg',
    1024
  ),
  (
    '00000000-0000-4000-8000-00000000b301',
    '00000000-0000-4000-8000-00000000b001',
    '00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000b301/source',
    'image/jpeg',
    1024
  );

insert into public.ai_extractions (id, user_id, upload_id)
values
  (
    '00000000-0000-4000-8000-00000000a401',
    '00000000-0000-4000-8000-00000000a001',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000b401',
    '00000000-0000-4000-8000-00000000b001',
    '00000000-0000-4000-8000-00000000b301'
  );

insert into public.requirements (
  id,
  user_id,
  project_id,
  content,
  source_extraction_id
)
values
  (
    '00000000-0000-4000-8000-00000000a501',
    '00000000-0000-4000-8000-00000000a001',
    '00000000-0000-4000-8000-00000000a201',
    'User A Requirement',
    '00000000-0000-4000-8000-00000000a401'
  ),
  (
    '00000000-0000-4000-8000-00000000b501',
    '00000000-0000-4000-8000-00000000b001',
    '00000000-0000-4000-8000-00000000b201',
    'User B Requirement',
    '00000000-0000-4000-8000-00000000b401'
  );

insert into public.tasks (
  id,
  user_id,
  project_id,
  requirement_id,
  title
)
values
  (
    '00000000-0000-4000-8000-00000000a601',
    '00000000-0000-4000-8000-00000000a001',
    '00000000-0000-4000-8000-00000000a201',
    '00000000-0000-4000-8000-00000000a501',
    'User A Task'
  ),
  (
    '00000000-0000-4000-8000-00000000b601',
    '00000000-0000-4000-8000-00000000b001',
    '00000000-0000-4000-8000-00000000b201',
    '00000000-0000-4000-8000-00000000b501',
    'User B Task'
  );

select throws_ok(
  $$
    insert into public.requirements (user_id, project_id, content)
    values (
      '00000000-0000-4000-8000-00000000a001',
      '00000000-0000-4000-8000-00000000b201',
      'Forged cross-tenant requirement'
    )
  $$,
  '23503',
  null,
  'composite foreign key rejects a child attached to another user project'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000a001',
  true
);

select is((select count(*)::integer from public.profiles), 1, 'user A sees only own profile');
select is((select count(*)::integer from public.clients), 1, 'user A sees only own clients');
select is((select count(*)::integer from public.projects), 1, 'user A sees only own projects');
select is((select count(*)::integer from public.uploads), 1, 'user A sees only own uploads');
select is((select count(*)::integer from public.ai_extractions), 1, 'user A sees only own extractions');
select is((select count(*)::integer from public.requirements), 1, 'user A sees only own requirements');
select is((select count(*)::integer from public.tasks), 1, 'user A sees only own tasks');

select throws_ok(
  $$
    insert into public.clients (user_id, name)
    values ('00000000-0000-4000-8000-00000000b001', 'Forged Client')
  $$,
  '42501',
  null,
  'user A cannot insert a client for user B'
);

select lives_ok(
  $$
    do $check$
    declare
      updated_rows integer;
    begin
      update public.clients
      set name = 'Forged Update'
      where id = '00000000-0000-4000-8000-00000000b101';

      get diagnostics updated_rows = row_count;
      if updated_rows <> 0 then
        raise exception 'user A updated a user B client';
      end if;
    end
    $check$;
  $$,
  'user A cannot update user B client'
);

select throws_ok(
  $$
    delete from public.clients
    where id = '00000000-0000-4000-8000-00000000b101'
  $$,
  '42501',
  null,
  'authenticated users cannot directly delete clients'
);

select throws_ok(
  $$
    insert into public.requirements (user_id, project_id, content)
    values (
      '00000000-0000-4000-8000-00000000a001',
      '00000000-0000-4000-8000-00000000b201',
      'Forged cross-tenant requirement'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot directly insert requirements'
);

select throws_ok(
  $$
    insert into public.uploads (
      id,
      storage_path,
      mime_type,
      byte_size,
      status
    )
    values (
      '00000000-0000-4000-8000-00000000a302',
      '00000000-0000-4000-8000-00000000a001/00000000-0000-4000-8000-00000000a302/source',
      'image/png',
      1,
      'completed'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot forge completed uploads'
);

select throws_ok(
  $$
    update public.uploads
    set status = 'completed'
    where id = '00000000-0000-4000-8000-00000000a301'
  $$,
  '42501',
  null,
  'authenticated users cannot update upload state'
);

select throws_ok(
  $$
    insert into public.ai_extractions (
      upload_id,
      status,
      provider,
      model,
      result
    )
    values (
      '00000000-0000-4000-8000-00000000a301',
      'needs_review',
      'forged-provider',
      'forged-model',
      '{"schemaVersion": 1}'::jsonb
    )
  $$,
  '42501',
  null,
  'authenticated users cannot insert forged extractions'
);

select throws_ok(
  $$
    update public.ai_extractions
    set
      status = 'needs_review',
      provider = 'forged-provider',
      model = 'forged-model',
      result = '{"schemaVersion": 1}'::jsonb
    where id = '00000000-0000-4000-8000-00000000a401'
  $$,
  '42501',
  null,
  'authenticated users cannot update extraction server fields'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select id from public.clients$$,
  '42501',
  null,
  'anonymous users cannot select business data'
);

select throws_ok(
  $$insert into public.clients (name) values ('Anonymous Client')$$,
  '42501',
  null,
  'anonymous users cannot insert business data'
);

reset role;
select * from finish();
rollback;
