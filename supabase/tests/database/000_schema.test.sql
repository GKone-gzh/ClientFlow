begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select is(
  (
    select count(*)::integer
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
    and relkind = 'r'
  ),
  7,
  'all seven MVP tables exist'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_type
    where oid in (
      'public.client_status'::regtype,
      'public.project_status'::regtype,
      'public.task_status'::regtype,
      'public.upload_status'::regtype,
      'public.ai_extraction_status'::regtype
    )
  ),
  5,
  'all five contract enums exist'
);

select is(
  (
    select count(*)::integer
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
    and relrowsecurity
    and relforcerowsecurity
  ),
  7,
  'RLS is enabled and forced on every MVP table'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'clients',
        'projects',
        'requirements',
        'tasks',
        'uploads',
        'ai_extractions'
      )
      and roles = array['authenticated']::name[]
  ),
  28,
  'each table has authenticated select, insert, update, and delete policies'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint
    where conname in (
      'projects_client_owner_fkey',
      'requirements_project_owner_fkey',
      'requirements_source_extraction_owner_fkey',
      'tasks_project_owner_fkey',
      'tasks_requirement_project_owner_fkey',
      'ai_extractions_upload_owner_fkey',
      'ai_extractions_confirmed_client_owner_fkey',
      'ai_extractions_confirmed_project_owner_fkey'
    )
      and contype = 'f'
  ),
  8,
  'all parent-child ownership relationships use foreign keys'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_trigger
    where tgname in (
      'profiles_set_updated_at',
      'clients_set_updated_at',
      'projects_set_updated_at',
      'requirements_set_updated_at',
      'tasks_set_updated_at',
      'uploads_set_updated_at',
      'ai_extractions_set_updated_at',
      'on_auth_user_created'
    )
      and not tgisinternal
  ),
  8,
  'timestamp and profile initialization triggers exist'
);

select * from finish();
rollback;
