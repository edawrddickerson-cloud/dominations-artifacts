-- Draft only. Apply after v1 real-game acceptance, backup and database tests.
-- Private history lives in planner_workspaces; these tables are opt-in evidence.
create table public.planner_crafting_consent (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null, epoch uuid not null, updated_at timestamptz not null default now()
);
create table public.planner_crafting_consent_operations (
  owner_id uuid references auth.users(id) on delete cascade, operation_id uuid,
  enabled boolean not null, epoch uuid not null, created_at timestamptz not null default now(),
  primary key(owner_id,operation_id)
);
create table public.planner_crafting_evidence (
  owner_id uuid references auth.users(id) on delete cascade, id text,
  revision bigint not null, writer text not null, deleted boolean not null,
  observed_at timestamptz, received_at timestamptz not null default now(),
  data jsonb not null, primary key(owner_id,id)
);
create table public.planner_crafting_rules (
  hall text, category text, perk text, starts numeric[] not null,
  primary key(hall,category,perk)
);
create table public.planner_crafting_contexts (
  kind text check(kind in ('event','version')), id text, primary key(kind,id)
);
create table public.planner_crafting_report_clock (
  singleton boolean primary key default true check(singleton), updated_at timestamptz not null default now()
);
insert into public.planner_crafting_report_clock(singleton) values(true);
alter table public.planner_crafting_report_clock enable row level security;
revoke all on public.planner_crafting_report_clock from public,anon,authenticated;
grant all on public.planner_crafting_report_clock to service_role;
create function public.planner_touch_crafting_report() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin update public.planner_crafting_report_clock set updated_at=clock_timestamp() where singleton;return null;end $$;
revoke all on function public.planner_touch_crafting_report() from public,anon,authenticated;
create trigger crafting_report_changed after insert or update or delete on public.planner_crafting_evidence for each row execute function public.planner_touch_crafting_report();
alter table public.planner_crafting_consent enable row level security;
alter table public.planner_crafting_consent_operations enable row level security;
alter table public.planner_crafting_evidence enable row level security;
alter table public.planner_crafting_rules enable row level security;
alter table public.planner_crafting_contexts enable row level security;
revoke all on public.planner_crafting_consent,public.planner_crafting_consent_operations,public.planner_crafting_evidence,public.planner_crafting_rules,public.planner_crafting_contexts from public,anon,authenticated;
grant select on public.planner_crafting_consent,public.planner_crafting_evidence to authenticated;
grant all on public.planner_crafting_consent,public.planner_crafting_consent_operations,public.planner_crafting_evidence,public.planner_crafting_rules,public.planner_crafting_contexts to service_role;
create policy own_crafting_consent on public.planner_crafting_consent for select to authenticated using(owner_id=(select auth.uid()));
create policy own_crafting_evidence on public.planner_crafting_evidence for select to authenticated using(owner_id=(select auth.uid()));

-- Bind requests to the account inspected by the browser even if its SDK changes
-- session while obtaining a refreshed JWT. The existing CAS protocol is retained.
create function public.planner_save_workspace_v2(p_owner uuid,p_expected_revision bigint,p_operation_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_owner then raise exception 'Account changed' using errcode='42501'; end if;
  return public.planner_save_workspace(p_expected_revision,p_operation_id,p_data);
end $$;
revoke all on function public.planner_save_workspace_v2(uuid,bigint,uuid,jsonb) from public,anon;
grant execute on function public.planner_save_workspace_v2(uuid,bigint,uuid,jsonb) to authenticated;

create function public.planner_set_crafting_consent(p_enabled boolean,p_policy text,p_operation uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid(); receipt public.planner_crafting_consent_operations%rowtype; token uuid;
begin
  if who is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_enabled is null or p_policy is distinct from '2026-10-23' or p_operation is null then raise exception 'Invalid consent' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(who::text,230001));
  select * into receipt from public.planner_crafting_consent_operations where owner_id=who and operation_id=p_operation;
  if found then
    if receipt.enabled<>p_enabled then raise exception 'Consent operation reused' using errcode='22023'; end if;
    return jsonb_build_object('epoch',receipt.epoch);
  end if;
  token:=gen_random_uuid();
  insert into public.planner_crafting_consent values(who,p_enabled,token,now()) on conflict(owner_id) do update set enabled=excluded.enabled,epoch=excluded.epoch,updated_at=now();
  insert into public.planner_crafting_consent_operations values(who,p_operation,p_enabled,token,now());
  -- Withdrawal removes observations immediately. Old device receipts cannot upload.
  if not p_enabled then delete from public.planner_crafting_evidence where owner_id=who; end if;
  return jsonb_build_object('epoch',token);
end $$;

create function public.planner_submit_crafting(p_epoch uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid(); item jsonb; row_data jsonb; old public.planner_crafting_evidence%rowtype; stamp timestamptz;
begin
  if who is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(who::text,230001));
  perform 1 from public.planner_crafting_consent where owner_id=who and enabled and epoch=p_epoch for share;
  if not found then raise exception 'Contribution consent required' using errcode='42501'; end if;
  if p_payload->>'version' is distinct from '2' or p_payload->>'policy' is distinct from '2026-10-23' or p_payload->>'rules' is distinct from 'ordinary-starts-2026-10-23'
    or jsonb_typeof(p_payload->'records') is distinct from 'array' or jsonb_array_length(p_payload->'records')>100 or octet_length(p_payload::text)>262144
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('version','policy','rules','records')) then raise exception 'Invalid contribution batch' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_payload->'records') loop
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','revision','writer','deleted','observed_at','hall','category','event_id','game_version','exclusion','rows'))
      or coalesce(length(item->>'id'),0) not between 1 and 512 or coalesce(length(item->>'writer'),0)>128
      or coalesce(item->>'revision','') !~ '^[0-9]{1,15}$' or jsonb_typeof(item->'deleted') is distinct from 'boolean'
      or jsonb_typeof(item->'rows') is distinct from 'array' or jsonb_array_length(item->'rows')>5
      or item->>'hall' not in ('main','war','unknown') or length(item->>'category')>80
      or item->>'exclusion' is not null and item->>'exclusion' not in ('archived','conflict','identity','starting-unknown','incomplete','upgraded','uncertain','range')
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
      elsif old.revision>(item->>'revision')::bigint then continue;
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

create function public.planner_crafting_metric(p_hits bigint,p_total bigint) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
  select jsonb_build_object('hits',p_hits,'total',p_total,'rate',case when p_total>0 then p_hits::numeric/p_total end,
    'bounds',case when p_total>0 then jsonb_build_array(greatest(0,c-h),least(1,c+h)) end)
  from (select (p+z*z/(2*n))/(1+z*z/n) c,z*sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n) h
    from (select p_hits::numeric/nullif(p_total,0) p,p_total::numeric n,1.959963984540054::numeric z) q) bounds
$$;

create function public.planner_crafting_report(p_hall text default null,p_category text default null,p_event text default null,p_version text default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  -- Exact allowlisted filters; no owner or record-level reporting endpoint.
  with sample as (
    select e.* from public.planner_crafting_evidence e join public.planner_crafting_consent c on c.owner_id=e.owner_id and c.enabled
    where not e.deleted and e.observed_at>=now()-interval '730 days'
      and (p_hall is null or e.data->>'hall'=p_hall) and (p_category is null or e.data->>'category'=p_category)
      and (p_event is null or coalesce(e.data->>'event_id','unknown')=p_event) and (p_version is null or coalesce(e.data->>'game_version','unknown')=p_version)
  ), per_item as (
    select s.owner_id,s.id,s.received_at,s.data->>'exclusion' exclusion,
      count(*) filter(where 11=any(r.starts) or -11=any(r.starts)) eligible_rows,
      count(*) filter(where abs((p->>'value')::numeric)=11) hits,
      count(distinct p->>'perk') distinct_perks
    from sample s left join lateral jsonb_array_elements(s.data->'rows') p on true
      left join public.planner_crafting_rules r on r.hall=s.data->>'hall' and r.category=s.data->>'category' and r.perk=p->>'perk'
    group by s.owner_id,s.id,s.received_at,s.data
  ), counts as (
    select count(*) recorded,count(distinct owner_id) contributors,max(received_at) updated,
      count(*) filter(where exclusion is not null) excluded,
      coalesce(sum(eligible_rows) filter(where exclusion is null),0)::bigint row_total,
      coalesce(sum(hits) filter(where exclusion is null),0)::bigint row_hits,
      count(*) filter(where exclusion is null and eligible_rows>0) artifact_total,
      count(*) filter(where exclusion is null and eligible_rows>0 and hits>=1) any_hits,
      count(*) filter(where exclusion is null and eligible_rows>0 and hits>=2) two_hits,
      count(*) filter(where exclusion is null) duplicate_total,
      count(*) filter(where exclusion is null and distinct_perks<5) duplicate_hits from per_item
  ) select case when contributors<5 then jsonb_build_object('status','insufficient-sample','minimumContributors',5,'updatedAt',null)
    else jsonb_build_object('status','ready','recorded',recorded,'excluded',excluded,'updatedAt',(select updated_at from public.planner_crafting_report_clock where singleton),'rules','ordinary-starts-2026-10-23',
      'metrics',jsonb_build_object('rows11',public.planner_crafting_metric(row_hits,row_total),'any11',public.planner_crafting_metric(any_hits,artifact_total),
      'two11',public.planner_crafting_metric(two_hits,artifact_total),'duplicate',public.planner_crafting_metric(duplicate_hits,duplicate_total)),
      'exclusions',(select coalesce(jsonb_object_agg(reason,n),'{}') from (select data->>'exclusion' reason,count(*) n from sample where data->>'exclusion' is not null group by data->>'exclusion') q)) end
    into result from counts;
  return result || jsonb_build_object('contexts',jsonb_build_object(
    'event',coalesce((select jsonb_agg(id order by id) from public.planner_crafting_contexts where kind='event'),'[]'::jsonb),
    'version',coalesce((select jsonb_agg(id order by id) from public.planner_crafting_contexts where kind='version'),'[]'::jsonb)));
end $$;

-- Extend existing account exports/deletion/retention without changing old data.
alter function public.planner_export_account() rename to planner_export_account_before_crafting_v2;
revoke all on function public.planner_export_account_before_crafting_v2() from public,anon,authenticated;
create function public.planner_export_account() returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select public.planner_export_account_before_crafting_v2() || jsonb_build_object('crafting_consent',(select to_jsonb(c)-'owner_id' from public.planner_crafting_consent c where owner_id=auth.uid()),
    'crafting_consent_operations',coalesce((select jsonb_agg(to_jsonb(o)-'owner_id') from public.planner_crafting_consent_operations o where owner_id=auth.uid()),'[]'::jsonb),
    'crafting_evidence',coalesce((select jsonb_agg(data) from public.planner_crafting_evidence where owner_id=auth.uid()),'[]'::jsonb))
$$;
alter function public.planner_delete_research() rename to planner_delete_research_before_crafting_v2;
revoke all on function public.planner_delete_research_before_crafting_v2() from public,anon,authenticated;
create function public.planner_delete_research() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.planner_delete_research_before_crafting_v2();
  perform public.planner_set_crafting_consent(false,'2026-10-23',gen_random_uuid());
end $$;
alter function public.planner_prune_expired_data() rename to planner_prune_before_crafting_v2;
revoke all on function public.planner_prune_before_crafting_v2() from public,anon,authenticated;
create function public.planner_prune_expired_data() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.planner_prune_before_crafting_v2();
  delete from public.planner_crafting_evidence where observed_at<now()-interval '730 days';
  -- Consent operations are minimal revocation receipts, retained until account deletion.
end $$;
revoke all on function public.planner_set_crafting_consent(boolean,text,uuid),public.planner_submit_crafting(uuid,jsonb),public.planner_crafting_metric(bigint,bigint),public.planner_crafting_report(text,text,text,text),public.planner_export_account(),public.planner_delete_research(),public.planner_prune_expired_data() from public,anon;
grant execute on function public.planner_set_crafting_consent(boolean,text,uuid),public.planner_submit_crafting(uuid,jsonb),public.planner_export_account(),public.planner_delete_research() to authenticated;
grant execute on function public.planner_crafting_report(text,text,text,text) to anon,authenticated;
revoke all on function public.planner_crafting_metric(bigint,bigint),public.planner_prune_expired_data() from authenticated;
grant execute on function public.planner_prune_expired_data() to service_role;
