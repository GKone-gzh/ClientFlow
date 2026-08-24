create index clients_user_updated_at_id_idx
  on public.clients (user_id, updated_at desc, id desc);

create index tasks_user_created_at_id_idx
  on public.tasks (user_id, created_at desc, id desc);

create index tasks_user_project_sort_order_id_idx
  on public.tasks (user_id, project_id, sort_order, id);
