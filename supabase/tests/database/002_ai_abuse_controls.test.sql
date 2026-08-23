begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

select has_table('private', 'ai_rate_limit_config', 'rate-limit configuration is server-only');
select has_table('private', 'ai_usage', 'AI usage table is server-only');

select results_eq(
  $$
    select concurrent_limit, minute_limit, hour_limit, daily_limit
    from private.ai_rate_limit_config
    where id = 1
  $$,
  $$values (1, 5, 30, 100)$$,
  'central limits match the approved MVP defaults'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_usage', 'SELECT'),
  'authenticated cannot read AI usage'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.reserve_ai_extraction(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot reserve an AI call directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.reserve_ai_extraction(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'service role can reserve an AI call'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.complete_ai_extraction(uuid,uuid,jsonb,integer,integer,integer,integer)',
    'EXECUTE'
  ),
  'service role can complete an AI call'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.fail_ai_extraction(uuid,uuid,text,integer,integer)',
    'EXECUTE'
  ),
  'service role can record an AI failure'
);

insert into auth.users (id)
values ('00000000-0000-4000-8000-00000000c001');

insert into public.uploads (
  id,
  user_id,
  storage_path,
  mime_type,
  byte_size,
  status
)
values (
  '00000000-0000-4000-8000-00000000c101',
  '00000000-0000-4000-8000-00000000c001',
  '00000000-0000-4000-8000-00000000c001/00000000-0000-4000-8000-00000000c101/source',
  'image/png',
  10,
  'uploaded'
);

set local role service_role;

select lives_ok(
  $$
    select *
    from public.reserve_ai_extraction(
      '00000000-0000-4000-8000-00000000c001',
      '00000000-0000-4000-8000-00000000c101',
      '30000000-0000-4000-8000-000000000001',
      'qwen',
      'qwen3-vl-plus'
    )
  $$,
  'service role reserves one extraction'
);

reset role;

select is(
  (
    select status::text
    from public.ai_extractions
    where upload_id = '00000000-0000-4000-8000-00000000c101'
  ),
  'processing',
  'reservation moves extraction to processing'
);

select is(
  (
    select status::text
    from public.uploads
    where id = '00000000-0000-4000-8000-00000000c101'
  ),
  'processing',
  'reservation moves upload to processing'
);

select is(
  (
    select count(*)::integer
    from private.ai_usage
    where user_id = '00000000-0000-4000-8000-00000000c001'
  ),
  1,
  'reservation records exactly one usage row before Provider work'
);

select * from finish();
rollback;
