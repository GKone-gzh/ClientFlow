insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-screenshots',
  'chat-screenshots',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.is_valid_ai_extraction_result(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  requirement jsonb;
  suggested_task jsonb;
  warning jsonb;
  requirement_count integer;
  numeric_value numeric;
  date_value text;
begin
  if value is null or jsonb_typeof(value) <> 'object' then
    return false;
  end if;

  if not value ?& array[
    'schemaVersion',
    'client',
    'project',
    'requirements',
    'suggestedTasks',
    'confidence',
    'warnings'
  ] or value - array[
    'schemaVersion',
    'client',
    'project',
    'requirements',
    'suggestedTasks',
    'confidence',
    'warnings'
  ] <> '{}'::jsonb then
    return false;
  end if;

  if jsonb_typeof(value -> 'schemaVersion') <> 'number'
    or (value ->> 'schemaVersion')::numeric <> 1 then
    return false;
  end if;

  if jsonb_typeof(value -> 'client') <> 'object'
    or not (value -> 'client') ?& array[
      'name',
      'contactHandle',
      'contactChannel'
    ]
    or (value -> 'client') - array[
      'name',
      'contactHandle',
      'contactChannel'
    ] <> '{}'::jsonb
    or jsonb_typeof(value #> '{client,name}') <> 'string'
    or btrim(value #>> '{client,name}') = '' then
    return false;
  end if;

  if jsonb_typeof(value #> '{client,contactHandle}') not in ('string', 'null')
    or (
      jsonb_typeof(value #> '{client,contactHandle}') = 'string'
      and btrim(value #>> '{client,contactHandle}') = ''
    )
    or jsonb_typeof(value #> '{client,contactChannel}') not in ('string', 'null')
    or (
      jsonb_typeof(value #> '{client,contactChannel}') = 'string'
      and btrim(value #>> '{client,contactChannel}') = ''
    ) then
    return false;
  end if;

  if jsonb_typeof(value -> 'project') <> 'object'
    or not (value -> 'project') ?& array[
      'name',
      'summary',
      'budgetAmount',
      'budgetCurrency',
      'dueDate'
    ]
    or (value -> 'project') - array[
      'name',
      'summary',
      'budgetAmount',
      'budgetCurrency',
      'dueDate'
    ] <> '{}'::jsonb
    or jsonb_typeof(value #> '{project,name}') <> 'string'
    or btrim(value #>> '{project,name}') = ''
    or jsonb_typeof(value #> '{project,summary}') not in ('string', 'null')
    or (
      jsonb_typeof(value #> '{project,summary}') = 'string'
      and btrim(value #>> '{project,summary}') = ''
    ) then
    return false;
  end if;

  if jsonb_typeof(value #> '{project,budgetAmount}') not in ('number', 'null')
    or jsonb_typeof(value #> '{project,budgetCurrency}') not in ('string', 'null')
    or jsonb_typeof(value #> '{project,dueDate}') not in ('string', 'null') then
    return false;
  end if;

  if jsonb_typeof(value #> '{project,budgetAmount}') = 'number' then
    numeric_value := (value #>> '{project,budgetAmount}')::numeric;
    if numeric_value < 0 or numeric_value > 999999999999.99 then
      return false;
    end if;
  end if;

  if jsonb_typeof(value #> '{project,budgetCurrency}') = 'string'
    and (value #>> '{project,budgetCurrency}') !~ '^[A-Z]{3}$' then
    return false;
  end if;

  if jsonb_typeof(value #> '{project,dueDate}') = 'string' then
    date_value := value #>> '{project,dueDate}';
    begin
      if date_value !~ '^\d{4}-\d{2}-\d{2}$'
        or to_char(date_value::date, 'YYYY-MM-DD') <> date_value then
        return false;
      end if;
    exception when others then
      return false;
    end;
  end if;

  if jsonb_typeof(value -> 'requirements') <> 'array'
    or jsonb_array_length(value -> 'requirements') = 0 then
    return false;
  end if;
  requirement_count := jsonb_array_length(value -> 'requirements');

  for requirement in
    select item from jsonb_array_elements(value -> 'requirements') as items (item)
  loop
    if jsonb_typeof(requirement) <> 'object'
      or not requirement ?& array['content', 'sortOrder']
      or requirement - array['content', 'sortOrder'] <> '{}'::jsonb
      or jsonb_typeof(requirement -> 'content') <> 'string'
      or btrim(requirement ->> 'content') = ''
      or jsonb_typeof(requirement -> 'sortOrder') <> 'number' then
      return false;
    end if;

    numeric_value := (requirement ->> 'sortOrder')::numeric;
    if numeric_value < 0
      or numeric_value > 2147483647
      or trunc(numeric_value) <> numeric_value then
      return false;
    end if;
  end loop;

  if jsonb_typeof(value -> 'suggestedTasks') <> 'array' then
    return false;
  end if;

  for suggested_task in
    select item from jsonb_array_elements(value -> 'suggestedTasks') as items (item)
  loop
    if jsonb_typeof(suggested_task) <> 'object'
      or not suggested_task ?& array[
        'title',
        'description',
        'requirementIndex',
        'sortOrder'
      ]
      or suggested_task - array[
        'title',
        'description',
        'requirementIndex',
        'sortOrder'
      ] <> '{}'::jsonb
      or jsonb_typeof(suggested_task -> 'title') <> 'string'
      or btrim(suggested_task ->> 'title') = ''
      or jsonb_typeof(suggested_task -> 'description') not in ('string', 'null')
      or (
        jsonb_typeof(suggested_task -> 'description') = 'string'
        and btrim(suggested_task ->> 'description') = ''
      )
      or jsonb_typeof(suggested_task -> 'requirementIndex') not in (
        'number',
        'null'
      )
      or jsonb_typeof(suggested_task -> 'sortOrder') <> 'number' then
      return false;
    end if;

    numeric_value := (suggested_task ->> 'sortOrder')::numeric;
    if numeric_value < 0
      or numeric_value > 2147483647
      or trunc(numeric_value) <> numeric_value then
      return false;
    end if;

    if jsonb_typeof(suggested_task -> 'requirementIndex') = 'number' then
      numeric_value := (suggested_task ->> 'requirementIndex')::numeric;
      if numeric_value < 0
        or numeric_value >= requirement_count
        or trunc(numeric_value) <> numeric_value then
        return false;
      end if;
    end if;
  end loop;

  if jsonb_typeof(value -> 'confidence') <> 'number' then
    return false;
  end if;
  numeric_value := (value ->> 'confidence')::numeric;
  if numeric_value < 0 or numeric_value > 1 then
    return false;
  end if;

  if jsonb_typeof(value -> 'warnings') <> 'array' then
    return false;
  end if;
  for warning in
    select item from jsonb_array_elements(value -> 'warnings') as items (item)
  loop
    if jsonb_typeof(warning) <> 'string' or btrim(warning #>> '{}') = '' then
      return false;
    end if;
  end loop;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function private.is_valid_ai_extraction_result(jsonb) from public;
revoke all on function private.is_valid_ai_extraction_result(jsonb) from anon;
revoke all on function private.is_valid_ai_extraction_result(jsonb) from authenticated;

create or replace function public.confirm_extraction(
  p_extraction_id uuid,
  p_result jsonb
)
returns table (
  client_id uuid,
  project_id uuid,
  requirement_ids uuid[],
  task_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  extraction public.ai_extractions%rowtype;
  created_client_id uuid;
  created_project_id uuid;
  created_requirement_ids uuid[] := array[]::uuid[];
  requirement jsonb;
  suggested_task jsonb;
  requirement_id uuid;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'authentication required';
  end if;

  select candidate.*
  into extraction
  from public.ai_extractions as candidate
  where candidate.id = p_extraction_id
    and candidate.user_id = current_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'extraction not found';
  end if;

  if extraction.status = 'confirmed' then
    return query
    select
      extraction.confirmed_client_id,
      extraction.confirmed_project_id,
      coalesce(
        array_agg(distinct requirement_row.id order by requirement_row.id),
        array[]::uuid[]
      ),
      coalesce(
        array_agg(distinct task_row.id order by task_row.id)
          filter (where task_row.id is not null),
        array[]::uuid[]
      )
    from public.requirements as requirement_row
    left join public.tasks as task_row
      on task_row.project_id = extraction.confirmed_project_id
      and task_row.user_id = current_user_id
    where requirement_row.source_extraction_id = extraction.id
      and requirement_row.user_id = current_user_id;
    return;
  end if;

  if extraction.status <> 'needs_review' then
    raise exception using
      errcode = '40001',
      message = 'extraction is not ready for confirmation';
  end if;

  if not private.is_valid_ai_extraction_result(p_result) then
    raise exception using
      errcode = '22023',
      message = 'invalid extraction result';
  end if;

  insert into public.clients (
    user_id,
    name,
    contact_handle,
    contact_channel,
    status
  )
  values (
    current_user_id,
    btrim(p_result #>> '{client,name}'),
    nullif(btrim(p_result #>> '{client,contactHandle}'), ''),
    nullif(btrim(p_result #>> '{client,contactChannel}'), ''),
    'lead'
  )
  returning id into created_client_id;

  insert into public.projects (
    user_id,
    client_id,
    name,
    summary,
    budget_amount,
    budget_currency,
    due_date,
    status
  )
  values (
    current_user_id,
    created_client_id,
    btrim(p_result #>> '{project,name}'),
    nullif(btrim(p_result #>> '{project,summary}'), ''),
    (p_result #>> '{project,budgetAmount}')::numeric,
    nullif(p_result #>> '{project,budgetCurrency}', ''),
    (p_result #>> '{project,dueDate}')::date,
    'draft'
  )
  returning id into created_project_id;

  for requirement in
    select item from jsonb_array_elements(p_result -> 'requirements') as items (item)
  loop
    insert into public.requirements (
      user_id,
      project_id,
      content,
      sort_order,
      source_extraction_id
    )
    values (
      current_user_id,
      created_project_id,
      btrim(requirement ->> 'content'),
      (requirement ->> 'sortOrder')::integer,
      extraction.id
    )
    returning id into requirement_id;

    created_requirement_ids := array_append(
      created_requirement_ids,
      requirement_id
    );
  end loop;

  for suggested_task in
    select item from jsonb_array_elements(p_result -> 'suggestedTasks') as items (item)
  loop
    insert into public.tasks (
      user_id,
      project_id,
      requirement_id,
      title,
      description,
      sort_order,
      status
    )
    values (
      current_user_id,
      created_project_id,
      case
        when jsonb_typeof(suggested_task -> 'requirementIndex') = 'null'
          then null
        else created_requirement_ids[
          (suggested_task ->> 'requirementIndex')::integer + 1
        ]
      end,
      btrim(suggested_task ->> 'title'),
      nullif(btrim(suggested_task ->> 'description'), ''),
      (suggested_task ->> 'sortOrder')::integer,
      'todo'
    );
  end loop;

  update public.ai_extractions
  set
    status = 'confirmed',
    result = p_result,
    error_code = null,
    confirmed_at = statement_timestamp(),
    confirmed_client_id = created_client_id,
    confirmed_project_id = created_project_id
  where id = extraction.id
    and user_id = current_user_id;

  return query
  select
    created_client_id,
    created_project_id,
    coalesce(
      (
        select array_agg(row.id order by row.id)
        from public.requirements as row
        where row.source_extraction_id = extraction.id
          and row.user_id = current_user_id
      ),
      array[]::uuid[]
    ),
    coalesce(
      (
        select array_agg(row.id order by row.id)
        from public.tasks as row
        where row.project_id = created_project_id
          and row.user_id = current_user_id
      ),
      array[]::uuid[]
    );
end;
$$;

revoke all on function public.confirm_extraction(uuid, jsonb) from public;
revoke all on function public.confirm_extraction(uuid, jsonb) from anon;
grant execute on function public.confirm_extraction(uuid, jsonb) to authenticated;
