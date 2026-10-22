-- Separate opt-in OCR text samples. No image/full-log upload and no public reads.
begin;
create table public.planner_ocr_feedback_consent (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null, policy text not null check(policy='2026-10-22-ocr-text-v1'),
  updated_at timestamptz not null default now()
);
create table public.planner_ocr_feedback_samples (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null, data jsonb not null,
  received_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id)
);
alter table public.planner_ocr_feedback_consent enable row level security;
alter table public.planner_ocr_feedback_samples enable row level security;
revoke all on public.planner_ocr_feedback_consent,public.planner_ocr_feedback_samples from public,anon,authenticated;
grant select on public.planner_ocr_feedback_consent,public.planner_ocr_feedback_samples to authenticated;
grant all on public.planner_ocr_feedback_consent,public.planner_ocr_feedback_samples to service_role;
create policy own_ocr_feedback_consent on public.planner_ocr_feedback_consent for select to authenticated using(owner_id=(select auth.uid()));
create policy own_ocr_feedback_samples on public.planner_ocr_feedback_samples for select to authenticated using(owner_id=(select auth.uid()));

create function public.planner_set_ocr_feedback_consent(p_enabled boolean,p_policy text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_enabled is null or p_policy is distinct from '2026-10-22-ocr-text-v1' then raise exception 'Invalid OCR policy' using errcode='22023'; end if;
  insert into public.planner_ocr_feedback_consent(owner_id,enabled,policy) values(auth.uid(),p_enabled,p_policy)
    on conflict(owner_id) do update set enabled=excluded.enabled,policy=excluded.policy,updated_at=now();
end;
$$;
create function public.planner_submit_ocr_feedback(p_samples jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); item jsonb; sample_id uuid; key text;
begin
  if who is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from public.planner_ocr_feedback_consent where owner_id=who and enabled and policy='2026-10-22-ocr-text-v1' for share;
  if not found then raise exception 'OCR consent required' using errcode='42501'; end if;
  if jsonb_typeof(p_samples) is distinct from 'array' or jsonb_array_length(p_samples)>50 or octet_length(p_samples::text)>100000 then
    raise exception 'Invalid OCR batch' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_samples) loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid OCR sample' using errcode='22023'; end if;
    for key in select jsonb_object_keys(item) loop
      if key not in ('id','kind','position','observed_text','matched_name','match_score','corrected_name','hall','category','app_build') then
        raise exception 'Unsupported OCR field' using errcode='22023'; end if;
    end loop;
    sample_id:=(item->>'id')::uuid;
    if sample_id is null or item->>'kind' is null or item->>'kind' not in ('artifact-name','perk-name') or
      jsonb_typeof(item->'observed_text') is distinct from 'string' or length(item->>'observed_text') not between 1 and 500 or
      jsonb_typeof(item->'app_build') is distinct from 'string' or length(item->>'app_build') not between 1 and 80 or
      jsonb_typeof(item->'position') is distinct from 'number' or (item->>'position')::numeric<>trunc((item->>'position')::numeric) or
      (item->>'position')::integer not between 0 and 6 or
      (item->>'kind'='artifact-name' and (item->>'position')::integer<>0) or
      (item->>'kind'='perk-name' and (item->>'position')::integer=0) or
      (item->>'hall' is not null and item->>'hall' not in ('main','war')) or
      (item->>'category' is not null and (jsonb_typeof(item->'category')<>'string' or length(item->>'category')>80)) or
      (item->>'matched_name' is not null and (jsonb_typeof(item->'matched_name')<>'string' or length(item->>'matched_name')>160)) or
      (item->>'corrected_name' is not null and (jsonb_typeof(item->'corrected_name')<>'string' or length(item->>'corrected_name') not between 1 and 160)) or
      (item->>'match_score' is not null and (jsonb_typeof(item->'match_score')<>'number' or (item->>'match_score')::numeric not between 0 and 1)) then
      raise exception 'Invalid OCR evidence' using errcode='22023'; end if;
    insert into public.planner_ocr_feedback_samples(owner_id,id,data) values(who,sample_id,item)
      on conflict(owner_id,id) do update set data=excluded.data,updated_at=now()
      where (excluded.data->>'corrected_name' is not null or planner_ocr_feedback_samples.data->>'corrected_name' is null)
        and planner_ocr_feedback_samples.data<>excluded.data;
  end loop;
  return jsonb_build_object('accepted',jsonb_array_length(p_samples));
end;
$$;
create function public.planner_delete_ocr_feedback() returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.planner_set_ocr_feedback_consent(false,'2026-10-22-ocr-text-v1');
  delete from public.planner_ocr_feedback_samples where owner_id=auth.uid();
end;
$$;
revoke all on function public.planner_set_ocr_feedback_consent(boolean,text),public.planner_submit_ocr_feedback(jsonb),public.planner_delete_ocr_feedback() from public,anon;
grant execute on function public.planner_set_ocr_feedback_consent(boolean,text),public.planner_submit_ocr_feedback(jsonb),public.planner_delete_ocr_feedback() to authenticated;

create or replace function public.planner_prune_expired_data() returns void
language sql security definer set search_path='' as $$
  delete from public.planner_workspace_history where saved_at<now()-interval '30 days';
  delete from public.planner_research_sessions where received_at<now()-interval '730 days';
  delete from public.planner_ocr_feedback_samples where updated_at<now()-interval '90 days';
$$;
create or replace function public.planner_export_account() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('workspace',public.planner_read_workspace(),
    'workspace_history',coalesce((select jsonb_agg(to_jsonb(t)-'owner_id') from public.planner_workspace_history t where owner_id=auth.uid()),'[]'::jsonb),
    'research_consent',(select to_jsonb(t)-'owner_id' from public.planner_research_consent t where owner_id=auth.uid()),
    'consent_history',coalesce((select jsonb_agg(to_jsonb(t)-'owner_id') from public.planner_consent_events t where owner_id=auth.uid()),'[]'::jsonb),
    'research_sessions',coalesce((select jsonb_agg(data) from public.planner_research_sessions where owner_id=auth.uid()),'[]'::jsonb),
    'research_outcomes',coalesce((select jsonb_agg(data) from public.planner_research_outcomes where owner_id=auth.uid()),'[]'::jsonb),
    'ocr_feedback_consent',(select to_jsonb(t)-'owner_id' from public.planner_ocr_feedback_consent t where owner_id=auth.uid()),
    'ocr_feedback_samples',coalesce((select jsonb_agg(data) from public.planner_ocr_feedback_samples where owner_id=auth.uid()),'[]'::jsonb));
$$;
commit;
