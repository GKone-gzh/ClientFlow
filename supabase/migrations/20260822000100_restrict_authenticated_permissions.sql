drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

drop policy if exists clients_delete_own on public.clients;
drop policy if exists projects_delete_own on public.projects;

drop policy if exists requirements_insert_own on public.requirements;
drop policy if exists requirements_update_own on public.requirements;
drop policy if exists requirements_delete_own on public.requirements;

drop policy if exists tasks_insert_own on public.tasks;
drop policy if exists tasks_update_own on public.tasks;
drop policy if exists tasks_delete_own on public.tasks;

drop policy if exists uploads_insert_own on public.uploads;
drop policy if exists uploads_update_own on public.uploads;
drop policy if exists uploads_delete_own on public.uploads;

drop policy if exists ai_extractions_insert_own on public.ai_extractions;
drop policy if exists ai_extractions_update_own on public.ai_extractions;
drop policy if exists ai_extractions_delete_own on public.ai_extractions;

revoke all privileges on table public.profiles from authenticated;
revoke all privileges on table public.clients from authenticated;
revoke all privileges on table public.projects from authenticated;
revoke all privileges on table public.requirements from authenticated;
revoke all privileges on table public.tasks from authenticated;
revoke all privileges on table public.uploads from authenticated;
revoke all privileges on table public.ai_extractions from authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

grant select on table public.clients to authenticated;
grant insert (name, contact_handle, contact_channel, notes, status)
  on table public.clients to authenticated;
grant update (name, contact_handle, contact_channel, notes, status)
  on table public.clients to authenticated;

grant select on table public.projects to authenticated;
grant insert (
  client_id,
  name,
  summary,
  budget_amount,
  budget_currency,
  due_date,
  status
) on table public.projects to authenticated;
grant update (
  name,
  summary,
  budget_amount,
  budget_currency,
  due_date,
  status
) on table public.projects to authenticated;

grant select on table public.requirements to authenticated;
grant select on table public.tasks to authenticated;
grant select on table public.uploads to authenticated;
grant select on table public.ai_extractions to authenticated;
