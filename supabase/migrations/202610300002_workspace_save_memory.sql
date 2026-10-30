-- Reduce transient workspace-save allocations while preserving complete
-- validation, consent-independent private storage, history and retry contracts.
begin;
create or replace function public.planner_save_workspace_v3(
  p_owner uuid,p_expected_revision bigint,p_operation_id uuid,p_data jsonb,p_items_delta jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  who uuid:=auth.uid(); current_row public.planner_workspaces%rowtype;
  payload jsonb:=p_data; base_items jsonb; patched_items jsonb; target_length integer;
  request_hash bytea; receipt public.planner_workspace_save_receipts%rowtype; change record;
begin
  if who is null or who is distinct from p_owner then
    raise exception 'Account changed' using errcode='42501';
  end if;
  if p_operation_id is null or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'Invalid workspace operation' using errcode='22023';
  end if;
  select * into current_row from public.planner_workspaces where owner_id=who for update;
  -- A retry may follow a committed save whose acknowledgement was lost.
  -- All other stale requests fail before any delta can be applied.
  if current_row.owner_id is not null then
    if current_row.operation_id<>p_operation_id and current_row.revision<>p_expected_revision then
      raise exception 'Workspace changed' using errcode='40001';
    end if;
  elsif p_expected_revision<>0 then
    raise exception 'Workspace changed' using errcode='40001';
  end if;
  request_hash:=sha256(convert_to(jsonb_build_object('revision',p_expected_revision,
    'data',p_data,'delta',p_items_delta)::text,'UTF8'));
  if current_row.operation_id=p_operation_id then
    -- Legacy clients can reuse an older UUID after another operation. A stale
    -- receipt must never acknowledge a different committed workspace revision.
    if current_row.revision-1<>p_expected_revision then
      raise exception 'Operation revision reused' using errcode='22023';
    end if;
    select * into receipt from public.planner_workspace_save_receipts where owner_id=who;
    if receipt.operation_id=p_operation_id then
      if receipt.request_hash<>request_hash then raise exception 'Operation ID reused' using errcode='22023'; end if;
      return jsonb_build_object('game_key',current_row.game_key,'revision',current_row.revision,
        'operation_id',current_row.operation_id,'updated_at',current_row.updated_at);
    elsif p_items_delta is not null then
      raise exception 'Delta operation has no receipt' using errcode='22023';
    end if;
  end if;
  if p_items_delta is not null then
    if current_row.owner_id is null or jsonb_typeof(current_row.data->'craftingLog'->'items') is distinct from 'array' or
       jsonb_typeof(payload->'craftingLog') is distinct from 'object' or payload->'craftingLog' ? 'items' or
       jsonb_typeof(p_items_delta) is distinct from 'object' or
       jsonb_typeof(p_items_delta->'changes') is distinct from 'object' or
       jsonb_typeof(p_items_delta->'length') is distinct from 'number' or
       (p_items_delta->>'length') !~ '^(0|[1-9][0-9]{0,5})$' then
      raise exception 'Invalid crafting delta' using errcode='22023';
    end if;
    target_length:=(p_items_delta->>'length')::integer;
    if target_length>100000 then raise exception 'Crafting delta too large' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(p_items_delta->'changes') k
              where k !~ '^(0|[1-9][0-9]{0,5})$') then
      raise exception 'Invalid crafting position' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_each(p_items_delta->'changes') e
              where e.key::integer>=target_length or jsonb_typeof(e.value)<>'object') then
      raise exception 'Invalid crafting replacement' using errcode='22023';
    end if;
    base_items:=current_row.data->'craftingLog'->'items';
    if exists(select 1 from generate_series(jsonb_array_length(base_items),target_length-1) i
              where not (p_items_delta->'changes' ? i::text)) then
      raise exception 'Missing appended crafting record' using errcode='22023';
    end if;
    if target_length=jsonb_array_length(base_items) and p_items_delta->'changes'='{}'::jsonb then
      patched_items:=base_items;
    elsif target_length>=jsonb_array_length(base_items) and
          (select count(*) from jsonb_object_keys(p_items_delta->'changes'))<=1 then
      -- A single validated replacement or append avoids rebuilding every item.
      -- Truncation and larger deltas retain the aggregate path below.
      patched_items:=base_items;
      for change in select key,value from jsonb_each(p_items_delta->'changes') order by key::integer loop
        patched_items:=jsonb_set(patched_items,array[change.key],change.value,true);
      end loop;
    else
      select coalesce(jsonb_agg(coalesce(p_items_delta->'changes'->i::text,base_items->i) order by i),'[]'::jsonb)
        into patched_items from generate_series(0,target_length-1) i;
    end if;
    payload:=jsonb_set(payload,'{craftingLog,items}',patched_items);
    -- These arrays have no further semantic use; release their references
    -- before size/privacy validation and the workspace update.
    base_items:=null;patched_items:=null;
  end if;
  -- Validate the complete reconstructed document, including the existing
  -- artwork trigger below. Delta requests cannot bypass the 16 MiB limit.
  if payload is null or payload->>'kind' is distinct from 'dominations-cloud-workspace' or
     payload->>'version' is distinct from '1' or payload->>'game' is distinct from 'dominations' or
     jsonb_typeof(payload->'settings') is distinct from 'object' or
     jsonb_typeof(payload->'records') is distinct from 'array' or octet_length(payload::text)>16777216 then
    raise exception 'Invalid workspace' using errcode='22023';
  end if;
  if current_row.owner_id is not null then
    if current_row.operation_id=p_operation_id then
      if current_row.data<>payload then raise exception 'Operation ID reused' using errcode='22023'; end if;
    else
      insert into public.planner_workspace_history(owner_id,revision,data) values(who,current_row.revision,current_row.data);
      current_row.data:=null;
      update public.planner_workspaces set revision=revision+1,operation_id=p_operation_id,data=payload,updated_at=now()
        where owner_id=who returning game_key,revision,operation_id,updated_at
        into current_row.game_key,current_row.revision,current_row.operation_id,current_row.updated_at;
      payload:=null;
      delete from public.planner_workspace_history h where h.owner_id=who and
        (h.saved_at<now()-interval '30 days' or h.revision not in
          (select revision from public.planner_workspace_history where owner_id=who order by revision desc limit 3));
    end if;
  else
    insert into public.planner_workspaces(owner_id,revision,operation_id,data) values(who,1,p_operation_id,payload)
      on conflict(owner_id) do nothing returning game_key,revision,operation_id,updated_at
        into current_row.game_key,current_row.revision,current_row.operation_id,current_row.updated_at;
    if not found then raise exception 'Workspace changed' using errcode='40001'; end if;
    payload:=null;
  end if;
  insert into public.planner_workspace_save_receipts(owner_id,operation_id,request_hash)
    values(who,p_operation_id,request_hash)
    on conflict(owner_id) do update set operation_id=excluded.operation_id,request_hash=excluded.request_hash;
  return jsonb_build_object('game_key',current_row.game_key,'revision',current_row.revision,
    'operation_id',current_row.operation_id,'updated_at',current_row.updated_at);
end $$;

create or replace function public.planner_validate_artwork_workspace() returns trigger
language plpgsql security definer set search_path='' as $$
declare artwork_schema text:=new.data->>'artworkSchema';
begin
 if tg_op='UPDATE' and old.data->>'artworkSchema'='1' and artwork_schema is distinct from '1' then
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
 -- Extract only each reference scalar; validate every reference on every save.
 -- A removed catalog entry therefore still invalidates unchanged documents.
 if exists(
  select 1 from jsonb_path_query(new.data,
   'strict $.** ? (@.type() == "object" && exists (@.artworkId) && @.artworkId.type() != "null").artworkId') as refs(value)
  where artwork_schema is distinct from '1' or jsonb_typeof(refs.value)<>'string' or
    not exists(select 1 from public.planner_artwork_catalog a where a.id=refs.value #>> '{}')
 ) then
  raise exception 'Unapproved artwork reference' using errcode='22023';
 end if;
 return new;
end $$;

commit;
