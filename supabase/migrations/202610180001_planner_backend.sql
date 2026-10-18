-- Authority: Approved additive backend; existing browser schemas/scoring retained.
-- Private app state is one versioned document for the first release. Research is
-- independently consented and queryable; none of its rows are publicly readable.
begin;

create table public.planner_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  game_key text not null default 'dominations' check (game_key='dominations'),
  revision bigint not null check (revision>0),
  operation_id uuid not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.planner_workspace_history (
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  data jsonb not null,
  saved_at timestamptz not null default now(),
  primary key(owner_id,revision)
);
create table public.planner_research_consent (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  policy text not null,
  updated_at timestamptz not null default now()
);
create table public.planner_consent_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null,
  policy text not null,
  recorded_at timestamptz not null default now()
);
create index planner_consent_events_owner on public.planner_consent_events(owner_id);
create table public.planner_research_sessions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  revision bigint not null check (revision>0),
  data jsonb not null,
  received_at timestamptz not null default now(),
  primary key(owner_id,id)
);
create table public.planner_research_outcomes (
  owner_id uuid not null,
  id uuid not null,
  session_id uuid not null,
  revision bigint not null check (revision>0),
  data jsonb not null,
  received_at timestamptz not null default now(),
  primary key(owner_id,id),
  foreign key(owner_id,session_id) references public.planner_research_sessions(owner_id,id) on delete cascade
);
create index planner_research_outcomes_session on public.planner_research_outcomes(owner_id,session_id);

alter table public.planner_workspaces enable row level security;
alter table public.planner_workspace_history enable row level security;
alter table public.planner_research_consent enable row level security;
alter table public.planner_consent_events enable row level security;
alter table public.planner_research_sessions enable row level security;
alter table public.planner_research_outcomes enable row level security;

revoke all on public.planner_workspaces,public.planner_workspace_history,public.planner_research_consent,public.planner_consent_events,public.planner_research_sessions,public.planner_research_outcomes from public,anon,authenticated;
grant select on public.planner_workspaces,public.planner_workspace_history,public.planner_research_consent,public.planner_consent_events,public.planner_research_sessions,public.planner_research_outcomes to authenticated;
grant all on public.planner_workspaces,public.planner_workspace_history,public.planner_research_consent,public.planner_consent_events,public.planner_research_sessions,public.planner_research_outcomes to service_role;

create policy own_workspace on public.planner_workspaces for select to authenticated using(owner_id=(select auth.uid()));
create policy own_workspace_history on public.planner_workspace_history for select to authenticated using(owner_id=(select auth.uid()));
create policy own_research_consent on public.planner_research_consent for select to authenticated using(owner_id=(select auth.uid()));
create policy own_consent_history on public.planner_consent_events for select to authenticated using(owner_id=(select auth.uid()));
create policy own_research_sessions on public.planner_research_sessions for select to authenticated using(owner_id=(select auth.uid()));
create policy own_research_outcomes on public.planner_research_outcomes for select to authenticated using(owner_id=(select auth.uid()));

create function public.planner_read_workspace() returns jsonb
language sql stable security invoker set search_path='' as $$
  select to_jsonb(w)-'owner_id' from public.planner_workspaces w where owner_id=auth.uid();
$$;

create function public.planner_save_workspace(p_expected_revision bigint,p_operation_id uuid,p_data jsonb) returns jsonb
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
      return to_jsonb(current_row)-'owner_id';
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
  return to_jsonb(current_row)-'owner_id';
end;
$$;

create function public.planner_set_research_consent(p_enabled boolean,p_policy text) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); previous public.planner_research_consent%rowtype;
begin
  if who is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_enabled is null or p_policy is distinct from '2026-10-18' then raise exception 'Unsupported consent policy' using errcode='22023'; end if;
  select * into previous from public.planner_research_consent where owner_id=who for update;
  if not found or previous.enabled<>p_enabled or previous.policy<>p_policy then
    insert into public.planner_consent_events(owner_id,enabled,policy) values(who,p_enabled,p_policy);
    insert into public.planner_research_consent(owner_id,enabled,policy) values(who,p_enabled,p_policy)
      on conflict(owner_id) do update set enabled=excluded.enabled,policy=excluded.policy,updated_at=now();
  end if;
end;
$$;

create function public.planner_research_payload_safe(p_payload jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
  with recursive nodes(value) as (
    select p_payload
    union all
    select child.value from nodes n cross join lateral (
      select e.value from jsonb_each(case when jsonb_typeof(n.value)='object' then n.value else '{}'::jsonb end) e
      union all
      select a.value from jsonb_array_elements(case when jsonb_typeof(n.value)='array' then n.value else '[]'::jsonb end) a
    ) child
  ) select not exists(select 1 from nodes where
    (jsonb_typeof(value)='object' and value ?| array['image','artwork','screenshot','screenshots','frame','frames','canvas','raw','rawType','observations','access_token','refresh_token','authorization'])
    or (jsonb_typeof(value)='string' and (value #>> '{}') ~* '^(data:|blob:)'));
$$;
revoke all on function public.planner_research_payload_safe(jsonb) from public,anon,authenticated;

create function public.planner_submit_research(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); item jsonb; perk jsonb; previous jsonb; old_revision bigint; item_id uuid; session_id uuid; incoming_revision bigint; position bigint;
begin
  if who is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- The lock serializes submission with consent withdrawal in this transaction.
  perform 1 from public.planner_research_consent where owner_id=who and enabled and policy='2026-10-18' for share;
  if not found then raise exception 'Research consent required' using errcode='42501'; end if;
  if p_payload->>'version' is distinct from '1' or p_payload->>'policy' is distinct from '2026-10-18' or
    jsonb_typeof(p_payload->'sessions') is distinct from 'array' or jsonb_typeof(p_payload->'outcomes') is distinct from 'array' or
    jsonb_array_length(p_payload->'outcomes')>100 or jsonb_array_length(p_payload->'sessions')>2000 or octet_length(p_payload::text)>8388608 then
    raise exception 'Invalid research batch' using errcode='22023';
  end if;
  if not public.planner_research_payload_safe(p_payload) then raise exception 'Unsupported research evidence' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_payload->'sessions') loop
    item_id:=(item->>'id')::uuid; incoming_revision:=(item->>'revision')::bigint;
    if item_id is null or incoming_revision is null or incoming_revision<1 or item->>'policy' is distinct from '2026-10-18' or
      item->>'started_at' is null or length(coalesce(item->>'game_version',''))>80 or length(coalesce(item->>'event_context',''))>120 or
      (item->>'expected_crafts' is not null and (item->>'expected_crafts')::integer not between 0 and 100000) or
      (item->>'attempted_crafts' is not null and (item->>'attempted_crafts')::integer not between 0 and 100000) then
      raise exception 'Invalid research session' using errcode='22023';
    end if;
    if item->>'ended_at' is not null and (item->>'ended_at')::timestamptz<(item->>'started_at')::timestamptz then raise exception 'Invalid session timestamps' using errcode='22023'; end if;
    select data,revision into previous,old_revision from public.planner_research_sessions where owner_id=who and id=item_id for update;
    if found and old_revision=incoming_revision and previous<>item then raise exception 'Session revision conflict' using errcode='40001'; end if;
    insert into public.planner_research_sessions(owner_id,id,revision,data) values(who,item_id,incoming_revision,item)
      on conflict(owner_id,id) do update set revision=excluded.revision,data=excluded.data
      where public.planner_research_sessions.revision<excluded.revision;
  end loop;
  for item in select value from jsonb_array_elements(p_payload->'outcomes') loop
    item_id:=(item->>'id')::uuid; session_id:=(item->>'session_id')::uuid; incoming_revision:=(item->>'revision')::bigint;
    if item_id is null or session_id is null or incoming_revision is null or incoming_revision<1 or
      item->>'source' is distinct from 'crafting' or item->>'new_craft' is distinct from 'true' or item->>'identity_source' is distinct from 'user-confirmed' or
      item->>'disposition' is null or item->>'disposition' not in ('retained','rejected','unknown') or
      jsonb_typeof(item->'perks') is distinct from 'array' or jsonb_array_length(item->'perks')>6 or
      item->>'expected_rows' is null or (item->>'expected_rows')::integer not between 1 and 6 or
      (item->>'hall' is not null and item->>'hall' not in ('main','war')) or length(coalesce(item->>'category',''))>80 or
      item ?| array['image','artwork','raw','observations','screenshot','frames'] then
      raise exception 'Invalid crafting outcome' using errcode='22023';
    end if;
    for perk,position in select value,ordinality from jsonb_array_elements(item->'perks') with ordinality loop
      if perk->>'position' is null or (perk->>'position')::integer<>position or length(coalesce(perk->>'name',''))>160 or
        (perk->>'current_value' is not null and jsonb_typeof(perk->'current_value')<>'number') or
        (perk->>'level' is not null and (perk->>'level')::integer not between 1 and 10) or
        (perk->>'tier' is not null and perk->>'tier' not in ('white','green','blue')) or
        jsonb_typeof(perk->'sources') is distinct from 'object' or
        perk->'sources'->>'value' is null or perk->'sources'->>'value' not in ('direct','inferred','user-corrected','unknown') or
        perk ?| array['image','artwork','raw','screenshot'] then raise exception 'Invalid perk evidence' using errcode='22023'; end if;
    end loop;
    select data,revision into previous,old_revision from public.planner_research_outcomes where owner_id=who and id=item_id for update;
    if found and previous->>'session_id' is distinct from item->>'session_id' then raise exception 'Outcome identity conflict' using errcode='40001'; end if;
    if found and previous->'first_read' is distinct from item->'first_read' then raise exception 'Original evidence is immutable' using errcode='40001'; end if;
    if found and old_revision=incoming_revision and previous<>item then raise exception 'Outcome revision conflict' using errcode='40001'; end if;
    insert into public.planner_research_outcomes(owner_id,id,session_id,revision,data) values(who,item_id,session_id,incoming_revision,item)
      on conflict(owner_id,id) do update set revision=excluded.revision,data=excluded.data
      where public.planner_research_outcomes.revision<excluded.revision;
  end loop;
  return jsonb_build_object('accepted',jsonb_array_length(p_payload->'outcomes'));
end;
$$;

create function public.planner_prune_expired_data() returns void
language sql security definer set search_path='' as $$
  delete from public.planner_workspace_history where saved_at<now()-interval '30 days';
  delete from public.planner_research_sessions where received_at<now()-interval '730 days';
$$;
revoke all on function public.planner_prune_expired_data() from public,anon,authenticated;
grant execute on function public.planner_prune_expired_data() to service_role;

create function public.planner_export_account() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('workspace',public.planner_read_workspace(),
    'workspace_history',coalesce((select jsonb_agg(to_jsonb(t)-'owner_id') from public.planner_workspace_history t where owner_id=auth.uid()),'[]'::jsonb),
    'research_consent',(select to_jsonb(t)-'owner_id' from public.planner_research_consent t where owner_id=auth.uid()),
    'consent_history',coalesce((select jsonb_agg(to_jsonb(t)-'owner_id') from public.planner_consent_events t where owner_id=auth.uid()),'[]'::jsonb),
    'research_sessions',coalesce((select jsonb_agg(data) from public.planner_research_sessions where owner_id=auth.uid()),'[]'::jsonb),
    'research_outcomes',coalesce((select jsonb_agg(data) from public.planner_research_outcomes where owner_id=auth.uid()),'[]'::jsonb));
$$;
create function public.planner_delete_research() returns void
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();
begin
  if who is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.planner_set_research_consent(false,'2026-10-18');
  delete from public.planner_research_sessions where owner_id=who;
end;
$$;

revoke all on function public.planner_read_workspace(),public.planner_save_workspace(bigint,uuid,jsonb),public.planner_set_research_consent(boolean,text),public.planner_submit_research(jsonb),public.planner_export_account(),public.planner_delete_research() from public,anon;
grant execute on function public.planner_read_workspace(),public.planner_save_workspace(bigint,uuid,jsonb),public.planner_set_research_consent(boolean,text),public.planner_submit_research(jsonb),public.planner_export_account(),public.planner_delete_research() to authenticated;

-- Initial administrator-only reporting, not a community analytics interface.
create schema research_reporting;
revoke all on schema research_reporting from public,anon,authenticated;
grant usage on schema research_reporting to service_role;
create view research_reporting.qualifying_crafts with(security_invoker=true) as
select o.owner_id,o.id,o.session_id,o.data,s.data->>'game_version' as game_version,s.data->>'event_context' as event_context
from public.planner_research_outcomes o join public.planner_research_sessions s on s.owner_id=o.owner_id and s.id=o.session_id
where o.data->>'source'='crafting' and o.data->>'identity_source'='user-confirmed' and o.data->>'new_craft'='true'
  and o.data->>'hall' in ('main','war') and o.data->>'category' is not null
  and jsonb_array_length(o.data->'perks')=(o.data->>'expected_rows')::integer
  and not exists(select 1 from jsonb_array_elements(o.data->'perks') p where p->>'name' is null or p->>'current_value' is null
    or p->>'has_percent' is distinct from 'true' or p->'sources'->>'value' not in ('direct','user-corrected')
    or p->>'conflict' is distinct from 'false' or p->>'inferred' is distinct from 'false');
create view research_reporting.perk_slots with(security_invoker=true) as
select c.owner_id,c.id,c.game_version,c.event_context,c.data->>'hall' as hall,c.data->>'category' as category,
  p.value->>'name' as perk,p.value->>'position' as position,p.value->'current_value' as current_value,p.value->'sources' as sources
from research_reporting.qualifying_crafts c cross join lateral jsonb_array_elements(c.data->'perks') p;
revoke all on research_reporting.qualifying_crafts,research_reporting.perk_slots from public,anon,authenticated;
grant select on research_reporting.qualifying_crafts,research_reporting.perk_slots to service_role;

commit;
