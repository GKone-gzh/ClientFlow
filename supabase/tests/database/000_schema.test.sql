begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

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
  12,
  'authenticated policies match the least-privilege repository surface'
);

select is(
  (
    select count(*)::integer
    from (
      values
        ('profiles', false, false, false),
        ('clients', false, false, false),
        ('projects', false, false, false),
        ('requirements', false, false, false),
        ('tasks', false, false, false),
        ('uploads', false, false, false),
        ('ai_extractions', false, false, false)
    ) as expected (table_name, can_insert, can_update, can_delete)
    where has_table_privilege(
      'authenticated',
      format('public.%I', table_name),
      'SELECT'
    )
      and has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        'INSERT'
      ) = can_insert
      and has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        'UPDATE'
      ) = can_update
      and has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        'DELETE'
      ) = can_delete
  ),
  7,
  'authenticated table grants match the approved permission matrix'
);

select is(
  (
    select count(*)::integer
    from (
      values
        ('profiles', 'display_name', 'UPDATE'),
        ('clients', 'name', 'INSERT'),
        ('clients', 'name', 'UPDATE'),
        ('projects', 'client_id', 'INSERT'),
        ('projects', 'name', 'UPDATE')
    ) as expected (table_name, column_name, privilege_name)
    where has_column_privilege(
      'authenticated',
      format('public.%I', table_name),
      column_name,
      privilege_name
    )
  ),
  5,
  'authenticated writes are limited to public contract columns'
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
