-- Apply after crafting v2. Do not apply the superseded 202610220002 migration.
begin;
create table public.planner_ocr_feedback_consent (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,policy text not null,epoch uuid not null default gen_random_uuid(),
 since timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.planner_ocr_feedback_operations (
 owner_id uuid not null references auth.users(id) on delete cascade,operation uuid not null,receipt jsonb not null,
 primary key(owner_id,operation)
);
create table public.planner_ocr_feedback_samples (
 owner_id uuid not null references auth.users(id) on delete cascade,id uuid not null,data jsonb not null,
 observed_at timestamptz not null,received_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id)
);
alter table public.planner_ocr_feedback_consent enable row level security;
alter table public.planner_ocr_feedback_operations enable row level security;
alter table public.planner_ocr_feedback_samples enable row level security;
revoke all on public.planner_ocr_feedback_consent,public.planner_ocr_feedback_operations,public.planner_ocr_feedback_samples from public,anon,authenticated;
grant select on public.planner_ocr_feedback_consent,public.planner_ocr_feedback_operations,public.planner_ocr_feedback_samples to authenticated;
grant all on public.planner_ocr_feedback_consent,public.planner_ocr_feedback_operations,public.planner_ocr_feedback_samples to service_role;
create policy own_ocr_consent on public.planner_ocr_feedback_consent for select to authenticated using(owner_id=(select auth.uid()));
create policy own_ocr_operations on public.planner_ocr_feedback_operations for select to authenticated using(owner_id=(select auth.uid()));
create policy own_ocr_samples on public.planner_ocr_feedback_samples for select to authenticated using(owner_id=(select auth.uid()));
create function public.planner_get_ocr_feedback_consent() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select jsonb_build_object('enabled',enabled,'epoch',epoch,'since',since) into result from public.planner_ocr_feedback_consent where owner_id=auth.uid();
 return coalesce(result,jsonb_build_object('enabled',false,'epoch',null,'since',null));
end $$;
create function public.planner_set_ocr_feedback_consent(p_enabled boolean,p_policy text,p_operation uuid,p_expected uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); result jsonb; current_epoch uuid;
begin
 if who is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_enabled is null or p_operation is null or p_policy is distinct from '2026-10-24-ocr-text-v2' then raise exception 'Invalid OCR policy' using errcode='22023'; end if;
 -- Serialize even initial consent and concurrent withdrawal on the account row.
 perform 1 from auth.users where id=who for update;
 select receipt into result from public.planner_ocr_feedback_operations where owner_id=who and operation=p_operation;
 if found then return result; end if;
 select epoch into current_epoch from public.planner_ocr_feedback_consent where owner_id=who;
 if p_enabled and current_epoch is distinct from p_expected then raise exception 'OCR consent changed; save preferences again' using errcode='42501'; end if;
 insert into public.planner_ocr_feedback_consent(owner_id,enabled,policy) values(who,p_enabled,p_policy)
 on conflict(owner_id) do update set enabled=excluded.enabled,policy=excluded.policy,epoch=gen_random_uuid(),since=now(),updated_at=now();
 result:=public.planner_get_ocr_feedback_consent();
 insert into public.planner_ocr_feedback_operations values(who,p_operation,result);
 return result;
end $$;
create function public.planner_submit_ocr_feedback(p_epoch uuid,p_samples jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); item jsonb; field text; stamp timestamptz; consent_since timestamptz; old jsonb;
begin
 if who is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select since into consent_since from public.planner_ocr_feedback_consent where owner_id=who and enabled and epoch=p_epoch for share;
 if not found then raise exception 'OCR consent required' using errcode='42501'; end if;
 if jsonb_typeof(p_samples) is distinct from 'array' or jsonb_array_length(p_samples)>50 or octet_length(p_samples::text)>150000 then raise exception 'Invalid OCR batch' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_samples) loop
  if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid OCR sample' using errcode='22023'; end if;
  for field in select jsonb_object_keys(item) loop
   if field not in ('id','encounter','kind','position','observed_text','matched_name','match_method','match_score','match_status','corrected_name','resolved_name','resolution','hall','category','app_build','scanner','capture_method','pass','read_ordinal','observed_at','revision','writer') then raise exception 'Unsupported OCR field' using errcode='22023'; end if;
  end loop;
  if item->>'id' is null or item->>'encounter' is null or item->>'writer' is null or
   item->>'kind' is null or item->>'kind' not in ('artifact-name','perk-name') or
   jsonb_typeof(item->'observed_text') is distinct from 'string' or length(btrim(item->>'observed_text')) not between 1 and 500 or
   jsonb_typeof(item->'position') is distinct from 'number' or (item->>'position')::numeric<>trunc((item->>'position')::numeric) or (item->>'position')::int not between 0 and 6 or
   (item->>'kind'='artifact-name' and (item->>'position')::int<>0) or (item->>'kind'='perk-name' and (item->>'position')::int=0) or
   item->>'resolution' is null or item->>'resolution' not in ('user-correction','later-ocr','unresolved') or
   item->>'match_status' is null or item->>'match_status' not in ('accepted','suggested','rejected') or
   item->>'scanner' is null or item->>'scanner' not in ('storage','crafting','unknown') or
   item->>'capture_method' is null or item->>'capture_method' not in ('live-capture','local-image','unknown') or
   (item->>'hall' is not null and item->>'hall' not in ('main','war')) or
   (item->>'match_score' is not null and (jsonb_typeof(item->'match_score')<>'number' or (item->>'match_score')::numeric not between 0 and 1)) or
   jsonb_typeof(item->'revision') is distinct from 'number' or (item->>'revision')::numeric<>trunc((item->>'revision')::numeric) or (item->>'revision')::bigint<1 or
   jsonb_typeof(item->'read_ordinal') is distinct from 'number' or (item->>'read_ordinal')::numeric<>trunc((item->>'read_ordinal')::numeric) or (item->>'read_ordinal')::int not between 1 and 42 or
   jsonb_typeof(item->'observed_at') is distinct from 'string'
   then raise exception 'Invalid OCR evidence' using errcode='22023'; end if;
  perform (item->>'id')::uuid,(item->>'encounter')::uuid,(item->>'writer')::uuid;
  foreach field in array array['matched_name','corrected_name','resolved_name','category','app_build','pass','match_method'] loop
   if (field in ('app_build','pass','match_method') and item->>field is null) or
    (item->>field is not null and (jsonb_typeof(item->field)<>'string' or length(btrim(item->>field)) not between 1 and case when field in ('matched_name','corrected_name','resolved_name') then 160 else 80 end)) then raise exception 'Invalid OCR text' using errcode='22023'; end if;
  end loop;
  -- Client filtering is repeated at the trust boundary for all structured text.
  if item::text ~* '(https?:|www\.|data:|bearer[[:space:]]|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,})' then raise exception 'Personal text rejected' using errcode='22023'; end if;
  stamp:=(item->>'observed_at')::timestamptz;
  if stamp<now()-interval '90 days' or stamp<consent_since or stamp>now()+interval '5 minutes' then continue; end if;
  perform pg_advisory_xact_lock(hashtextextended(who::text || (item->>'id'),0));
  select data into old from public.planner_ocr_feedback_samples where owner_id=who and id=(item->>'id')::uuid for update;
  if found then
   if old->>'observed_text' is distinct from item->>'observed_text' or old->>'encounter' is distinct from item->>'encounter' or old->>'position' is distinct from item->>'position' or old->>'kind' is distinct from item->>'kind' or old->>'observed_at' is distinct from item->>'observed_at' then raise exception 'OCR observation is immutable' using errcode='22023'; end if;
   if old->>'conflict'='true' and (old->>'revision')::bigint>=(item->>'revision')::bigint then continue; end if;
   if (old->>'revision')::bigint>(item->>'revision')::bigint or old->>'resolution'='user-correction' and item->>'resolution'<>'user-correction' then continue; end if;
   if (old->>'revision')::bigint=(item->>'revision')::bigint and old<>item then
    if old->>'writer'=item->>'writer' then raise exception 'Revision reused' using errcode='22023'; end if;
    -- Preserve ambiguity instead of declaring either concurrent correction true.
    item:=item || jsonb_build_object('conflict',true);
    item:=jsonb_set(item,'{resolution}','"unresolved"');item:=jsonb_set(item,'{resolved_name}','null');item:=jsonb_set(item,'{corrected_name}','null');
   end if;
  end if;
  insert into public.planner_ocr_feedback_samples(owner_id,id,data,observed_at) values(who,(item->>'id')::uuid,item,stamp)
   on conflict(owner_id,id) do update set data=excluded.data,updated_at=now() where planner_ocr_feedback_samples.data<>excluded.data;
 end loop;
 return jsonb_build_object('accepted',true);
end $$;
create function public.planner_delete_ocr_feedback() returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.planner_set_ocr_feedback_consent(false,'2026-10-24-ocr-text-v2',gen_random_uuid(),null);
 delete from public.planner_ocr_feedback_samples where owner_id=auth.uid();
end $$;
-- Preserve the deployed v2 wrappers in full, including private history and research retention.
alter function public.planner_export_account() rename to planner_export_before_ocr_v2;
revoke all on function public.planner_export_before_ocr_v2() from public,anon,authenticated;
create function public.planner_export_account() returns jsonb language sql security definer set search_path='' as $$
 select public.planner_export_before_ocr_v2() || jsonb_build_object(
 'ocr_feedback_consent',(select to_jsonb(t)-'owner_id' from public.planner_ocr_feedback_consent t where owner_id=auth.uid()),
 'ocr_feedback_operations',coalesce((select jsonb_agg(to_jsonb(t)-'owner_id') from public.planner_ocr_feedback_operations t where owner_id=auth.uid()),'[]'::jsonb),
 'ocr_feedback_samples',coalesce((select jsonb_agg(data) from public.planner_ocr_feedback_samples where owner_id=auth.uid()),'[]'::jsonb))
$$;
alter function public.planner_prune_expired_data() rename to planner_prune_before_ocr_v2;
revoke all on function public.planner_prune_before_ocr_v2() from public,anon,authenticated;
create function public.planner_prune_expired_data() returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.planner_prune_before_ocr_v2();
 delete from public.planner_ocr_feedback_samples where observed_at<now()-interval '90 days';
end $$;
revoke all on function public.planner_get_ocr_feedback_consent(),public.planner_set_ocr_feedback_consent(boolean,text,uuid,uuid),public.planner_submit_ocr_feedback(uuid,jsonb),public.planner_delete_ocr_feedback(),public.planner_export_account(),public.planner_prune_expired_data() from public,anon;
grant execute on function public.planner_get_ocr_feedback_consent(),public.planner_set_ocr_feedback_consent(boolean,text,uuid,uuid),public.planner_submit_ocr_feedback(uuid,jsonb),public.planner_delete_ocr_feedback(),public.planner_export_account() to authenticated;
revoke all on function public.planner_prune_expired_data() from authenticated;
grant execute on function public.planner_prune_expired_data() to service_role;
commit;
