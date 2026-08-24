begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(3);

select has_index(
  'public',
  'clients',
  'clients_user_updated_at_id_idx',
  'client cursor pagination has a matching index'
);

select has_index(
  'public',
  'tasks',
  'tasks_user_created_at_id_idx',
  'current-user task cursor pagination has a matching index'
);

select has_index(
  'public',
  'tasks',
  'tasks_user_project_sort_order_id_idx',
  'project task batches have a matching index'
);

select * from finish();
rollback;
