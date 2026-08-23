create table private.ai_rate_limit_config (
  id smallint primary key default 1,
  concurrent_limit integer not null,
  minute_limit integer not null,
  hour_limit integer not null,
  daily_limit integer not null,
  processing_lease_seconds integer not null,
  constraint ai_rate_limit_config_singleton check (id = 1),
  constraint ai_rate_limit_config_positive check (
    concurrent_limit > 0
    and minute_limit > 0
    and hour_limit >= minute_limit
    and daily_limit >= hour_limit
    and processing_lease_seconds between 60 and 3600
  )
);

insert into private.ai_rate_limit_config (
  id,
  concurrent_limit,
  minute_limit,
  hour_limit,
  daily_limit,
  processing_lease_seconds
)
values (1, 1, 5, 30, 100, 600);

create table private.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  extraction_id uuid not null unique
    references public.ai_extractions (id) on delete cascade,
  request_id uuid not null unique,
  provider text not null,
  model text not null,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  status text not null default 'processing',
  duration_ms integer,
  attempt_count integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  error_code text,
  constraint ai_usage_provider_not_blank check (btrim(provider) <> ''),
  constraint ai_usage_model_not_blank check (btrim(model) <> ''),
  constraint ai_usage_status_allowed check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint ai_usage_completion_consistent check (
    (status = 'processing' and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  ),
  constraint ai_usage_completion_order check (
    completed_at is null or completed_at >= started_at
  ),
  constraint ai_usage_duration_nonnegative check (
    duration_ms is null or duration_ms >= 0
  ),
  constraint ai_usage_attempt_count_nonnegative check (attempt_count >= 0),
  constraint ai_usage_input_tokens_nonnegative check (
    input_tokens is null or input_tokens >= 0
  ),
  constraint ai_usage_output_tokens_nonnegative check (
    output_tokens is null or output_tokens >= 0
  ),
  constraint ai_usage_error_code_not_blank check (
    error_code is null or btrim(error_code) <> ''
  )
);

create index ai_usage_user_started_at_idx
  on private.ai_usage (user_id, started_at desc);

create index ai_usage_active_user_started_at_idx
  on private.ai_usage (user_id, started_at desc)
  where status = 'processing';

revoke all on table private.ai_rate_limit_config from public;
revoke all on table private.ai_rate_limit_config from anon;
revoke all on table private.ai_rate_limit_config from authenticated;
revoke all on table private.ai_rate_limit_config from service_role;
revoke all on table private.ai_usage from public;
revoke all on table private.ai_usage from anon;
revoke all on table private.ai_usage from authenticated;
revoke all on table private.ai_usage from service_role;

create or replace function public.reserve_ai_extraction(
  p_user_id uuid,
  p_upload_id uuid,
  p_request_id uuid,
  p_provider text,
  p_model text
)
returns table (
  extraction_id uuid,
  extraction_status public.ai_extraction_status,
  should_invoke_provider boolean,
  usage_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_time timestamptz := clock_timestamp();
  limits private.ai_rate_limit_config%rowtype;
  upload public.uploads%rowtype;
  extraction public.ai_extractions%rowtype;
  created_usage_id uuid;
  accepted_count integer;
begin
  if p_user_id is null
    or p_upload_id is null
    or p_request_id is null
    or nullif(btrim(p_provider), '') is null
    or nullif(btrim(p_model), '') is null
    or length(p_provider) > 100
    or length(p_model) > 100 then
    raise exception using
      errcode = '22023',
      message = 'invalid extraction reservation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select candidate.*
  into extraction
  from public.ai_extractions as candidate
  where candidate.upload_id = p_upload_id
    and candidate.user_id = p_user_id
  for update;

  if found then
    if extraction.status in ('needs_review', 'confirmed') then
      return query
      select
        extraction.id,
        extraction.status,
        false,
        (
          select usage_row.id
          from private.ai_usage as usage_row
          where usage_row.extraction_id = extraction.id
        );
      return;
    end if;

    if extraction.status = 'processing' then
      raise exception using
        errcode = 'CF003',
        message = 'an extraction is already processing';
    end if;

    if extraction.status = 'failed' then
      raise exception using
        errcode = 'CF004',
        message = 'a failed extraction cannot be retried automatically';
    end if;
  end if;

  select candidate.*
  into upload
  from public.uploads as candidate
  where candidate.id = p_upload_id
    and candidate.user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'upload not found';
  end if;

  if upload.status <> 'uploaded' then
    raise exception using
      errcode = 'CF004',
      message = 'upload is not ready for extraction';
  end if;

  select config.*
  into strict limits
  from private.ai_rate_limit_config as config
  where config.id = 1;

  select count(*)::integer
  into accepted_count
  from private.ai_usage as usage_row
  where usage_row.user_id = p_user_id
    and usage_row.status = 'processing'
    and usage_row.started_at >= reservation_time
      - pg_catalog.make_interval(secs => limits.processing_lease_seconds);

  if accepted_count >= limits.concurrent_limit then
    raise exception using
      errcode = 'CF003',
      message = 'concurrent extraction limit reached';
  end if;

  select count(*)::integer
  into accepted_count
  from private.ai_usage as usage_row
  where usage_row.user_id = p_user_id
    and usage_row.started_at >= reservation_time - interval '1 minute';

  if accepted_count >= limits.minute_limit then
    raise exception using
      errcode = 'CF001',
      message = 'minute extraction limit reached';
  end if;

  select count(*)::integer
  into accepted_count
  from private.ai_usage as usage_row
  where usage_row.user_id = p_user_id
    and usage_row.started_at >= reservation_time - interval '1 hour';

  if accepted_count >= limits.hour_limit then
    raise exception using
      errcode = 'CF001',
      message = 'hour extraction limit reached';
  end if;

  select count(*)::integer
  into accepted_count
  from private.ai_usage as usage_row
  where usage_row.user_id = p_user_id
    and usage_row.started_at >= reservation_time - interval '24 hours';

  if accepted_count >= limits.daily_limit then
    raise exception using
      errcode = 'CF002',
      message = 'daily extraction quota reached';
  end if;

  if extraction.id is null then
    insert into public.ai_extractions (
      user_id,
      upload_id,
      status,
      provider,
      model,
      result,
      error_code
    )
    values (
      p_user_id,
      p_upload_id,
      'processing',
      btrim(p_provider),
      btrim(p_model),
      null,
      null
    )
    returning * into extraction;
  else
    update public.ai_extractions
    set
      status = 'processing',
      provider = btrim(p_provider),
      model = btrim(p_model),
      result = null,
      error_code = null
    where id = extraction.id
      and user_id = p_user_id
      and status = 'queued'
    returning * into extraction;

    if not found then
      raise exception using
        errcode = 'CF003',
        message = 'extraction state changed concurrently';
    end if;
  end if;

  insert into private.ai_usage (
    user_id,
    extraction_id,
    request_id,
    provider,
    model,
    started_at
  )
  values (
    p_user_id,
    extraction.id,
    p_request_id,
    btrim(p_provider),
    btrim(p_model),
    reservation_time
  )
  returning id into created_usage_id;

  update public.uploads
  set
    status = 'processing',
    error_code = null
  where id = upload.id
    and user_id = p_user_id
    and status = 'uploaded';

  if not found then
    raise exception using
      errcode = 'CF003',
      message = 'upload state changed concurrently';
  end if;

  return query
  select extraction.id, extraction.status, true, created_usage_id;
end;
$$;

create or replace function public.complete_ai_extraction(
  p_user_id uuid,
  p_extraction_id uuid,
  p_result jsonb,
  p_duration_ms integer,
  p_attempt_count integer,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns setof public.ai_extractions
language plpgsql
security definer
set search_path = ''
as $$
declare
  extraction public.ai_extractions%rowtype;
begin
  if p_user_id is null
    or p_extraction_id is null
    or p_duration_ms is null
    or p_duration_ms < 0
    or p_attempt_count is null
    or p_attempt_count < 1
    or coalesce(p_input_tokens, 0) < 0
    or coalesce(p_output_tokens, 0) < 0
    or not private.is_valid_ai_extraction_result(p_result) then
    raise exception using
      errcode = '22023',
      message = 'invalid extraction completion';
  end if;

  select candidate.*
  into extraction
  from public.ai_extractions as candidate
  where candidate.id = p_extraction_id
    and candidate.user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'extraction not found';
  end if;

  if extraction.status = 'needs_review' then
    return next extraction;
    return;
  end if;

  if extraction.status <> 'processing' then
    raise exception using
      errcode = 'CF004',
      message = 'extraction is not processing';
  end if;

  update private.ai_usage
  set
    status = 'completed',
    completed_at = clock_timestamp(),
    duration_ms = p_duration_ms,
    attempt_count = p_attempt_count,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    error_code = null
  where user_id = p_user_id
    and extraction_id = extraction.id
    and status = 'processing';

  if not found then
    raise exception using
      errcode = 'CF004',
      message = 'usage reservation is not processing';
  end if;

  update public.uploads
  set
    status = 'completed',
    error_code = null
  where id = extraction.upload_id
    and user_id = p_user_id
    and status = 'processing';

  if not found then
    raise exception using
      errcode = 'CF004',
      message = 'upload is not processing';
  end if;

  update public.ai_extractions
  set
    status = 'needs_review',
    result = p_result,
    error_code = null
  where id = extraction.id
    and user_id = p_user_id
    and status = 'processing'
  returning * into extraction;

  return next extraction;
end;
$$;

create or replace function public.fail_ai_extraction(
  p_user_id uuid,
  p_extraction_id uuid,
  p_error_code text,
  p_duration_ms integer,
  p_attempt_count integer
)
returns setof public.ai_extractions
language plpgsql
security definer
set search_path = ''
as $$
declare
  extraction public.ai_extractions%rowtype;
begin
  if p_user_id is null
    or p_extraction_id is null
    or nullif(btrim(p_error_code), '') is null
    or length(p_error_code) > 100
    or p_duration_ms is null
    or p_duration_ms < 0
    or p_attempt_count is null
    or p_attempt_count < 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid extraction failure';
  end if;

  select candidate.*
  into extraction
  from public.ai_extractions as candidate
  where candidate.id = p_extraction_id
    and candidate.user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'extraction not found';
  end if;

  if extraction.status = 'failed' then
    return next extraction;
    return;
  end if;

  if extraction.status <> 'processing' then
    raise exception using
      errcode = 'CF004',
      message = 'extraction is not processing';
  end if;

  update private.ai_usage
  set
    status = 'failed',
    completed_at = clock_timestamp(),
    duration_ms = p_duration_ms,
    attempt_count = p_attempt_count,
    input_tokens = null,
    output_tokens = null,
    error_code = btrim(p_error_code)
  where user_id = p_user_id
    and extraction_id = extraction.id
    and status = 'processing';

  if not found then
    raise exception using
      errcode = 'CF004',
      message = 'usage reservation is not processing';
  end if;

  update public.uploads
  set
    status = 'failed',
    error_code = btrim(p_error_code)
  where id = extraction.upload_id
    and user_id = p_user_id
    and status = 'processing';

  if not found then
    raise exception using
      errcode = 'CF004',
      message = 'upload is not processing';
  end if;

  update public.ai_extractions
  set
    status = 'failed',
    result = null,
    error_code = btrim(p_error_code)
  where id = extraction.id
    and user_id = p_user_id
    and status = 'processing'
  returning * into extraction;

  return next extraction;
end;
$$;

revoke all on function public.reserve_ai_extraction(uuid, uuid, uuid, text, text)
  from public;
revoke all on function public.reserve_ai_extraction(uuid, uuid, uuid, text, text)
  from anon;
revoke all on function public.reserve_ai_extraction(uuid, uuid, uuid, text, text)
  from authenticated;
grant execute on function public.reserve_ai_extraction(uuid, uuid, uuid, text, text)
  to service_role;

revoke all on function public.complete_ai_extraction(
  uuid,
  uuid,
  jsonb,
  integer,
  integer,
  integer,
  integer
) from public;
revoke all on function public.complete_ai_extraction(
  uuid,
  uuid,
  jsonb,
  integer,
  integer,
  integer,
  integer
) from anon;
revoke all on function public.complete_ai_extraction(
  uuid,
  uuid,
  jsonb,
  integer,
  integer,
  integer,
  integer
) from authenticated;
grant execute on function public.complete_ai_extraction(
  uuid,
  uuid,
  jsonb,
  integer,
  integer,
  integer,
  integer
) to service_role;

revoke all on function public.fail_ai_extraction(uuid, uuid, text, integer, integer)
  from public;
revoke all on function public.fail_ai_extraction(uuid, uuid, text, integer, integer)
  from anon;
revoke all on function public.fail_ai_extraction(uuid, uuid, text, integer, integer)
  from authenticated;
grant execute on function public.fail_ai_extraction(uuid, uuid, text, integer, integer)
  to service_role;
