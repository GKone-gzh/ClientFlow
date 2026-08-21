create type public.client_status as enum (
  'lead',
  'active',
  'inactive',
  'archived'
);

create type public.project_status as enum (
  'draft',
  'active',
  'on_hold',
  'completed',
  'cancelled',
  'archived'
);

create type public.task_status as enum (
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled'
);

create type public.upload_status as enum (
  'pending',
  'uploaded',
  'processing',
  'completed',
  'failed'
);

create type public.ai_extraction_status as enum (
  'queued',
  'processing',
  'needs_review',
  'confirmed',
  'failed'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank
    check (display_name is null or btrim(display_name) <> '')
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null,
  contact_handle text,
  contact_channel text,
  notes text,
  status public.client_status not null default 'lead',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_id_user_id_key unique (id, user_id),
  constraint clients_name_not_blank check (btrim(name) <> '')
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  client_id uuid not null,
  name text not null,
  summary text,
  budget_amount numeric(14, 2),
  budget_currency text,
  due_date date,
  status public.project_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_id_user_id_key unique (id, user_id),
  constraint projects_client_owner_fkey
    foreign key (client_id, user_id)
    references public.clients (id, user_id)
    on delete cascade,
  constraint projects_name_not_blank check (btrim(name) <> ''),
  constraint projects_budget_amount_nonnegative
    check (budget_amount is null or budget_amount >= 0),
  constraint projects_budget_currency_iso_format
    check (budget_currency is null or budget_currency ~ '^[A-Z]{3}$')
);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null,
  status public.upload_status not null default 'pending',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uploads_id_user_id_key unique (id, user_id),
  constraint uploads_storage_path_canonical
    check (storage_path = user_id::text || '/' || id::text || '/source'),
  constraint uploads_mime_type_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint uploads_byte_size_allowed
    check (byte_size > 0 and byte_size <= 10485760),
  constraint uploads_error_code_not_blank
    check (error_code is null or btrim(error_code) <> '')
);

create table public.ai_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  upload_id uuid not null unique,
  status public.ai_extraction_status not null default 'queued',
  schema_version integer not null default 1,
  provider text,
  model text,
  result jsonb,
  error_code text,
  confirmed_at timestamptz,
  confirmed_client_id uuid,
  confirmed_project_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_extractions_id_user_id_key unique (id, user_id),
  constraint ai_extractions_upload_owner_fkey
    foreign key (upload_id, user_id)
    references public.uploads (id, user_id)
    on delete cascade,
  constraint ai_extractions_confirmed_client_owner_fkey
    foreign key (confirmed_client_id, user_id)
    references public.clients (id, user_id),
  constraint ai_extractions_confirmed_project_owner_fkey
    foreign key (confirmed_project_id, user_id)
    references public.projects (id, user_id),
  constraint ai_extractions_schema_version_positive check (schema_version > 0),
  constraint ai_extractions_result_is_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint ai_extractions_result_schema_version_matches
    check (
      result is null
      or (
        result ? 'schemaVersion'
        and result ->> 'schemaVersion' = schema_version::text
      )
    ),
  constraint ai_extractions_error_code_not_blank
    check (error_code is null or btrim(error_code) <> ''),
  constraint ai_extractions_confirmation_complete
    check (
      (status = 'confirmed') = (
        confirmed_at is not null
        and confirmed_client_id is not null
        and confirmed_project_id is not null
      )
    )
);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  project_id uuid not null,
  content text not null,
  sort_order integer not null default 0,
  source_extraction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requirements_id_project_user_id_key
    unique (id, project_id, user_id),
  constraint requirements_project_owner_fkey
    foreign key (project_id, user_id)
    references public.projects (id, user_id)
    on delete cascade,
  constraint requirements_source_extraction_owner_fkey
    foreign key (source_extraction_id, user_id)
    references public.ai_extractions (id, user_id),
  constraint requirements_content_not_blank check (btrim(content) <> ''),
  constraint requirements_sort_order_nonnegative check (sort_order >= 0)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  project_id uuid not null,
  requirement_id uuid,
  title text not null,
  description text,
  due_at timestamptz,
  sort_order integer not null default 0,
  status public.task_status not null default 'todo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_project_owner_fkey
    foreign key (project_id, user_id)
    references public.projects (id, user_id)
    on delete cascade,
  constraint tasks_requirement_project_owner_fkey
    foreign key (requirement_id, project_id, user_id)
    references public.requirements (id, project_id, user_id),
  constraint tasks_title_not_blank check (btrim(title) <> ''),
  constraint tasks_sort_order_nonnegative check (sort_order >= 0)
);

create index clients_user_status_updated_at_idx
  on public.clients (user_id, status, updated_at desc);

create index projects_user_client_updated_at_idx
  on public.projects (user_id, client_id, updated_at desc);

create index projects_client_owner_idx
  on public.projects (client_id, user_id);

create index uploads_user_created_at_idx
  on public.uploads (user_id, created_at desc);

create index ai_extractions_user_status_created_at_idx
  on public.ai_extractions (user_id, status, created_at desc);

create index ai_extractions_confirmed_client_owner_idx
  on public.ai_extractions (confirmed_client_id, user_id)
  where confirmed_client_id is not null;

create index ai_extractions_confirmed_project_owner_idx
  on public.ai_extractions (confirmed_project_id, user_id)
  where confirmed_project_id is not null;

create index requirements_user_project_sort_order_idx
  on public.requirements (user_id, project_id, sort_order);

create index requirements_source_extraction_owner_idx
  on public.requirements (source_extraction_id, user_id)
  where source_extraction_id is not null;

create index tasks_user_project_status_sort_order_idx
  on public.tasks (user_id, project_id, status, sort_order);

create index tasks_requirement_project_owner_idx
  on public.tasks (requirement_id, project_id, user_id)
  where requirement_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger uploads_set_updated_at
before update on public.uploads
for each row execute function public.set_updated_at();

create trigger ai_extractions_set_updated_at
before update on public.ai_extractions
for each row execute function public.set_updated_at();

create trigger requirements_set_updated_at
before update on public.requirements
for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.clients enable row level security;
alter table public.clients force row level security;
alter table public.projects enable row level security;
alter table public.projects force row level security;
alter table public.uploads enable row level security;
alter table public.uploads force row level security;
alter table public.ai_extractions enable row level security;
alter table public.ai_extractions force row level security;
alter table public.requirements enable row level security;
alter table public.requirements force row level security;
alter table public.tasks enable row level security;
alter table public.tasks force row level security;

create policy profiles_select_own
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_insert_own
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy profiles_delete_own
on public.profiles for delete to authenticated
using ((select auth.uid()) = id);

create policy clients_select_own
on public.clients for select to authenticated
using ((select auth.uid()) = user_id);

create policy clients_insert_own
on public.clients for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy clients_update_own
on public.clients for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy clients_delete_own
on public.clients for delete to authenticated
using ((select auth.uid()) = user_id);

create policy projects_select_own
on public.projects for select to authenticated
using ((select auth.uid()) = user_id);

create policy projects_insert_own
on public.projects for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy projects_update_own
on public.projects for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy projects_delete_own
on public.projects for delete to authenticated
using ((select auth.uid()) = user_id);

create policy uploads_select_own
on public.uploads for select to authenticated
using ((select auth.uid()) = user_id);

create policy uploads_insert_own
on public.uploads for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy uploads_update_own
on public.uploads for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy uploads_delete_own
on public.uploads for delete to authenticated
using ((select auth.uid()) = user_id);

create policy ai_extractions_select_own
on public.ai_extractions for select to authenticated
using ((select auth.uid()) = user_id);

create policy ai_extractions_insert_own
on public.ai_extractions for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy ai_extractions_update_own
on public.ai_extractions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy ai_extractions_delete_own
on public.ai_extractions for delete to authenticated
using ((select auth.uid()) = user_id);

create policy requirements_select_own
on public.requirements for select to authenticated
using ((select auth.uid()) = user_id);

create policy requirements_insert_own
on public.requirements for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy requirements_update_own
on public.requirements for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy requirements_delete_own
on public.requirements for delete to authenticated
using ((select auth.uid()) = user_id);

create policy tasks_select_own
on public.tasks for select to authenticated
using ((select auth.uid()) = user_id);

create policy tasks_insert_own
on public.tasks for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy tasks_update_own
on public.tasks for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy tasks_delete_own
on public.tasks for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.profiles from anon;
revoke all on public.clients from anon;
revoke all on public.projects from anon;
revoke all on public.uploads from anon;
revoke all on public.ai_extractions from anon;
revoke all on public.requirements from anon;
revoke all on public.tasks from anon;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.uploads to authenticated;
grant select, insert, update, delete on public.ai_extractions to authenticated;
grant select, insert, update, delete on public.requirements to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
