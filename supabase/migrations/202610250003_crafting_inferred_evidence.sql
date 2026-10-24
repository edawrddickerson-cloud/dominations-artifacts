-- Complete inferred observations count; manual stats are excluded.
-- Versioned re-projection preserves canonical revisions and blocks stale clients.
create or replace function public.planner_submit_crafting(p_epoch uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid(); item jsonb; row_data jsonb; old public.planner_crafting_evidence%rowtype; stamp timestamptz;
begin
  if who is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(who::text,230001));
  perform 1 from public.planner_crafting_consent where owner_id=who and enabled and epoch=p_epoch for share;
  if not found then raise exception 'Contribution consent required' using errcode='42501'; end if;
  if p_payload->>'version' is distinct from '2' or p_payload->>'policy' is distinct from '2026-10-23' or coalesce(p_payload->>'rules','') not in ('ordinary-starts-2026-10-23','complete-stats-2026-10-25')
    or jsonb_typeof(p_payload->'records') is distinct from 'array' or jsonb_array_length(p_payload->'records')>100 or octet_length(p_payload::text)>262144
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('version','policy','rules','records')) then raise exception 'Invalid contribution batch' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_payload->'records') loop
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','revision','writer','deleted','observed_at','hall','category','event_id','game_version','exclusion','rows','projection'))
      or coalesce(length(item->>'id'),0) not between 1 and 512 or coalesce(length(item->>'writer'),0)>128
      or coalesce(item->>'revision','') !~ '^[0-9]{1,15}$' or jsonb_typeof(item->'deleted') is distinct from 'boolean'
      or jsonb_typeof(item->'rows') is distinct from 'array' or jsonb_array_length(item->'rows')>5
      or item->>'hall' not in ('main','war','unknown') or length(item->>'category')>80
      or coalesce(item->>'projection','1') not in ('1','2')
      or item->>'exclusion' is not null and item->>'exclusion' not in ('archived','conflict','identity','starting-unknown','incomplete','upgraded','uncertain','range','manual')
      then raise exception 'Invalid contribution record' using errcode='22023'; end if;
    stamp:=(item->>'observed_at')::timestamptz;
    -- Unknown/expired times never become fresh observations on retransmission.
    if stamp is null or stamp<now()-interval '730 days' or stamp>now()+interval '1 day' then continue; end if;
    if item->>'event_id' is not null and not exists(select 1 from public.planner_crafting_contexts where kind='event' and id=item->>'event_id') then item:=jsonb_set(item,'{event_id}','null'); end if;
    if item->>'game_version' is not null and not exists(select 1 from public.planner_crafting_contexts where kind='version' and id=item->>'game_version') then item:=jsonb_set(item,'{game_version}','null'); end if;
    if item->>'exclusion' is null then
      if jsonb_array_length(item->'rows')<>5 then raise exception 'Five starting rows required' using errcode='22023'; end if;
      for row_data in select value from jsonb_array_elements(item->'rows') loop
        if exists(select 1 from jsonb_object_keys(row_data) k where k not in ('perk','value')) or jsonb_typeof(row_data->'value') is distinct from 'number'
          or not exists(select 1 from public.planner_crafting_rules r where r.hall=item->>'hall' and r.category=item->>'category' and r.perk=row_data->>'perk' and (row_data->>'value')::numeric=any(r.starts))
          then raise exception 'Unsupported starting roll' using errcode='22023'; end if;
      end loop;
    elsif jsonb_array_length(item->'rows')<>0 then raise exception 'Excluded evidence must omit rows' using errcode='22023'; end if;
    select * into old from public.planner_crafting_evidence where owner_id=who and id=item->>'id' for update;
    if found then
      if old.deleted then continue; end if;
      if (item->>'deleted')::boolean then null;
      elsif coalesce(old.data->>'projection','1')='2' and coalesce(item->>'projection','1')='1' then continue;
      elsif old.revision>(item->>'revision')::bigint then continue;
      elsif old.revision=(item->>'revision')::bigint and coalesce(old.data->>'projection','1')='1' and item->>'projection'='2' then null;
      elsif old.revision=(item->>'revision')::bigint then
        if old.data=item then continue; end if;
        if old.writer=coalesce(item->>'writer','') then raise exception 'Revision reused' using errcode='22023'; end if;
        -- Concurrent corrections stay out of metrics until a later revision.
        item:=jsonb_set(jsonb_set(item,'{exclusion}','"conflict"'),'{rows}','[]');
        if old.writer>coalesce(item->>'writer','') then item:=jsonb_set(item,'{writer}',to_jsonb(old.writer)); end if;
      end if;
    end if;
    insert into public.planner_crafting_evidence values(who,item->>'id',(item->>'revision')::bigint,coalesce(item->>'writer',''),(item->>'deleted')::boolean,stamp,now(),item)
      on conflict(owner_id,id) do update set revision=excluded.revision,writer=excluded.writer,deleted=excluded.deleted,data=excluded.data,observed_at=excluded.observed_at,received_at=now();
  end loop;
  return jsonb_build_object('accepted',true);
end $$;
