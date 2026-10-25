-- Preserve the exact workspace envelope, invoker rights and RLS. Avoid
-- serializing the entire large document twice to remove the owner column.
create or replace function public.planner_read_workspace() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('game_key',w.game_key,'revision',w.revision,
    'operation_id',w.operation_id,'data',w.data,'updated_at',w.updated_at)
  from public.planner_workspaces w where w.owner_id=(select auth.uid());
$$;
