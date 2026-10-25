-- Preserve the save contract and privacy checks while avoiding per-node
-- PL/pgSQL work for large private crafting histories. No data or grants change.
begin;

create or replace function public.planner_save_workspace(p_expected_revision bigint,p_operation_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); current_row public.planner_workspaces%rowtype;
begin
  if who is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_operation_id is null or p_expected_revision is null or p_expected_revision<0 or
    p_data->>'kind' is distinct from 'dominations-cloud-workspace' or p_data->>'version' is distinct from '1' or
    p_data->>'game' is distinct from 'dominations' or jsonb_typeof(p_data->'settings') is distinct from 'object' or
    jsonb_typeof(p_data->'records') is distinct from 'array' or octet_length(p_data::text)>16777216 then
    raise exception 'Invalid workspace' using errcode='22023';
  end if;
  select * into current_row from public.planner_workspaces where owner_id=who for update;
  if found then
    if current_row.operation_id=p_operation_id then
      if current_row.data<>p_data then raise exception 'Operation ID reused' using errcode='22023'; end if;
      return jsonb_build_object('game_key',current_row.game_key,'revision',current_row.revision,
        'operation_id',current_row.operation_id,'data',current_row.data,'updated_at',current_row.updated_at);
    end if;
    if current_row.revision<>p_expected_revision then raise exception 'Workspace changed' using errcode='40001'; end if;
    insert into public.planner_workspace_history(owner_id,revision,data) values(who,current_row.revision,current_row.data);
    update public.planner_workspaces set revision=revision+1,operation_id=p_operation_id,data=p_data,updated_at=now()
      where owner_id=who returning * into current_row;
    delete from public.planner_workspace_history h where h.owner_id=who and
      (h.saved_at<now()-interval '30 days' or h.revision not in
        (select revision from public.planner_workspace_history where owner_id=who order by revision desc limit 3));
  else
    if p_expected_revision<>0 then raise exception 'Workspace changed' using errcode='40001'; end if;
    insert into public.planner_workspaces(owner_id,revision,operation_id,data) values(who,1,p_operation_id,p_data)
      on conflict(owner_id) do nothing returning * into current_row;
    if not found then raise exception 'Workspace changed' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('game_key',current_row.game_key,'revision',current_row.revision,
        'operation_id',current_row.operation_id,'data',current_row.data,'updated_at',current_row.updated_at);
end;
$$;

create or replace function public.planner_validate_artwork_workspace() returns trigger
language plpgsql security definer set search_path='' as $$
declare node jsonb; ref jsonb;
begin
 if tg_op='UPDATE' and old.data->>'artworkSchema'='1' and new.data->>'artworkSchema' is distinct from '1' then
  raise exception 'Reload the planner before syncing artwork references' using errcode='22023';
 end if;
 if new.data ? 'artworkSchema' and new.data->'artworkSchema'<>'1'::jsonb then
  raise exception 'Unsupported artwork schema' using errcode='22023';
 end if;
 -- Strict recursive descent visits every container and scalar without array
 -- unwrapping. Keep validation in PostgreSQL's JSON walker; only references
 -- need catalog lookups, rather than a PL/pgSQL iteration for every JSON node.
 if jsonb_path_exists(new.data,'strict $.** ? (@.type() == "object" && (exists (@."image") || exists (@."artwork") || exists (@."artworkMatch") || exists (@."artworkDescriptor") || exists (@."artworkFingerprint") || exists (@."artworkEmbedding") || exists (@."screenshot") || exists (@."screenshots") || exists (@."frame") || exists (@."frames") || exists (@."canvas") || exists (@."raw") || exists (@."rawType") || exists (@."observations") || exists (@."access_token") || exists (@."refresh_token") || exists (@."authorization")))') then
  raise exception 'Image and raw capture data cannot enter workspace sync' using errcode='22023';
 end if;
 if jsonb_path_exists(new.data,'strict $.** ? (@.type() == "string" && @ like_regex "^(data:|blob:)" flag "i")') then
  raise exception 'Embedded images cannot enter workspace sync' using errcode='22023';
 end if;
 for node in select value from jsonb_path_query(new.data,
  'strict $.** ? (@.type() == "object" && exists (@.artworkId) && @.artworkId.type() != "null")') as refs(value)
 loop
  ref:=node->'artworkId';
  if new.data->>'artworkSchema' is distinct from '1' or jsonb_typeof(ref)<>'string' or
     not exists(select 1 from public.planner_artwork_catalog a where a.id=node->>'artworkId') then
   raise exception 'Unapproved artwork reference' using errcode='22023';
  end if;
 end loop;
 return new;
end $$;

notify pgrst,'reload schema';
commit;
