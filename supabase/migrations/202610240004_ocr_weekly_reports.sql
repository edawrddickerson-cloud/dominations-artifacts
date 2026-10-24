-- Weekly private OCR review. Permanent reports contain counts/curated names only.
-- Unreviewed text stays in the original expiring sample table; links cascade.
begin;
create table research_reporting.ocr_matching_names (name text primary key);
alter table research_reporting.ocr_matching_names enable row level security;
revoke all on research_reporting.ocr_matching_names from public,anon,authenticated,service_role;
grant select on research_reporting.ocr_matching_names to service_role;
create table research_reporting.ocr_matching_cases (observed text primary key,expected text not null references research_reporting.ocr_matching_names);
create table research_reporting.ocr_matching_baseline (singleton boolean primary key check(singleton),build_hash text not null);
alter table research_reporting.ocr_matching_cases enable row level security;
alter table research_reporting.ocr_matching_baseline enable row level security;
revoke all on research_reporting.ocr_matching_cases,research_reporting.ocr_matching_baseline from public,anon,authenticated,service_role;
grant select on research_reporting.ocr_matching_cases,research_reporting.ocr_matching_baseline to service_role;
create table research_reporting.ocr_weekly_reports (
 week_start date primary key check(extract(isodow from week_start)=1),
 generated_at timestamptz not null default now(), summary jsonb not null
);
create table research_reporting.ocr_weekly_candidates (
 id uuid primary key default gen_random_uuid(),week_start date not null references research_reporting.ocr_weekly_reports on delete cascade,
 kind text not null check(kind in ('artifact-name','perk-name')),
 target_name text,occurrences integer not null,encounters integer not null,
 user_corrections integer not null,later_reads integer not null,
 screening text not null check(screening in ('review-exact-alias','already-matched','canonical-collision','ambiguous-target','unknown-target','title-review','conflicting-evidence','fixture-collision')),
 checks jsonb not null,
 decision text not null default 'pending' check(decision in ('pending','approved','rejected','needs-evidence','released')),
 reviewed_at timestamptz,review_reference text,fixture jsonb
);
create table research_reporting.ocr_weekly_sources (
 candidate_id uuid not null references research_reporting.ocr_weekly_candidates on delete cascade,
 owner_id uuid not null,sample_id uuid not null,
 primary key(candidate_id,owner_id,sample_id),
 foreign key(owner_id,sample_id) references public.planner_ocr_feedback_samples(owner_id,id) on delete cascade
);
-- Append-only reviewer history. Independent, explicitly reviewed fixtures may persist.
create table research_reporting.ocr_weekly_decisions (
 id bigint generated always as identity primary key,
 candidate_id uuid not null references research_reporting.ocr_weekly_candidates on delete cascade,
 decision text not null check(decision in ('approved','rejected','needs-evidence','released')),
 reviewed_at timestamptz not null default now(),review_reference text not null,fixture jsonb
);
alter table research_reporting.ocr_weekly_reports enable row level security;
alter table research_reporting.ocr_weekly_candidates enable row level security;
alter table research_reporting.ocr_weekly_sources enable row level security;
alter table research_reporting.ocr_weekly_decisions enable row level security;
revoke all on research_reporting.ocr_weekly_reports,research_reporting.ocr_weekly_candidates,research_reporting.ocr_weekly_sources,research_reporting.ocr_weekly_decisions from public,anon,authenticated,service_role;
grant select on research_reporting.ocr_weekly_reports,research_reporting.ocr_weekly_candidates,research_reporting.ocr_weekly_sources,research_reporting.ocr_weekly_decisions to service_role;

create function public.planner_ocr_label_key(p_text text) returns text
language sql immutable set search_path='' as $$
 select lower(btrim(regexp_replace(regexp_replace(coalesce(p_text,''),'[[:space:]]*[+-]?[0-9]+([.,][0-9]+)?[[:space:]]*%[[:space:]]*$','','g'),'[[:space:]]+',' ','g')))
$$;
create index ocr_matching_cases_key on research_reporting.ocr_matching_cases(public.planner_ocr_label_key(observed));
create index ocr_matching_names_key on research_reporting.ocr_matching_names(public.planner_ocr_label_key(name));
create index ocr_weekly_source_lookup on research_reporting.ocr_weekly_sources(owner_id,sample_id);
create index planner_ocr_feedback_received on public.planner_ocr_feedback_samples(received_at);
create index planner_ocr_feedback_updated on public.planner_ocr_feedback_samples(updated_at);
create index planner_ocr_feedback_observed on public.planner_ocr_feedback_samples(observed_at);
create function public.planner_generate_ocr_weekly_report(p_week date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare week_day date:=coalesce(p_week,(date_trunc('week',now() at time zone 'UTC')-interval '7 days')::date);
 start_at timestamptz;end_at timestamptz;row_group record;candidate uuid;summary jsonb;gate text;
begin
 if extract(isodow from week_day)<>1 or week_day>=(date_trunc('week',now() at time zone 'UTC'))::date or week_day<(date_trunc('week',now() at time zone 'UTC')-interval '84 days')::date then raise exception 'Choose a closed Monday UTC week within the retained evidence window' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('planner-ocr-week:'||week_day::text,0));
 if exists(select 1 from research_reporting.ocr_weekly_reports where week_start=week_day) then return jsonb_build_object('week',week_day,'created',false); end if;
 start_at:=week_day::timestamp at time zone 'UTC';end_at:=(week_day+7)::timestamp at time zone 'UTC';
 -- Source updates are snapshot signals, not an exhaustive event history or craft totals.
 with source as (
  select * from public.planner_ocr_feedback_samples where observed_at>=now()-interval '90 days'
   and ((received_at>=start_at and received_at<end_at) or (updated_at>=start_at and updated_at<end_at))
 ), dims as (
  select coalesce(data->>'kind','unknown') kind,
   case when data->>'scanner' in ('crafting','storage') then data->>'scanner' else 'unknown' end scanner,
   case when data->>'hall' in ('main','war') then data->>'hall' else 'unknown' end hall,
   case when data->>'resolution' in ('unresolved','later-ocr','user-correction') then data->>'resolution' else 'unknown' end resolution,
   case when data->>'match_status' in ('accepted','suggested','rejected') then data->>'match_status' else 'unknown' end match_status,
   count(*) occurrences from source group by 1,2,3,4,5
 ) select jsonb_build_object('version',1,'weekStart',week_day,'weekEnd',week_day+7,'basis','receipt-or-latest-update-snapshot',
  'samples',(select count(*) from source),'encounters',(select count(distinct (owner_id,data->>'encounter')) from source),
  'conflicts',(select count(*) from source where data->>'conflict'='true'),
  'dimensions',coalesce((select jsonb_agg(to_jsonb(dims) order by kind,scanner,hall,resolution,match_status) from dims),'[]'::jsonb)) into summary;
 insert into research_reporting.ocr_weekly_reports(week_start,summary) values(week_day,summary);
 for row_group in
  with source as (
   select *,public.planner_ocr_label_key(data->>'observed_text') source_key,
    public.planner_ocr_label_key(coalesce(data->>'corrected_name',data->>'resolved_name',data->>'matched_name')) target_key
   from public.planner_ocr_feedback_samples where observed_at>=now()-interval '90 days'
    and ((received_at>=start_at and received_at<end_at) or (updated_at>=start_at and updated_at<end_at))
  ), groups as (
   select data->>'kind' kind,source_key,target_key,count(*)::int occurrences,
    count(distinct (owner_id,data->>'encounter'))::int encounters,
    count(*) filter(where data->>'resolution'='user-correction')::int user_corrections,
    count(*) filter(where data->>'resolution'='later-ocr')::int later_reads,
    bool_or(data->>'conflict'='true') conflict
   from source group by 1,2,3
  ) select g.*,
   (select min(name) from research_reporting.ocr_matching_names where public.planner_ocr_label_key(name)=g.target_key) canonical_target,
   exists(select 1 from research_reporting.ocr_matching_names where public.planner_ocr_label_key(name)=g.source_key) source_is_canonical,
   (select count(distinct s.target_key) from source s where s.data->>'kind'=g.kind and s.source_key=g.source_key and s.target_key<>'') target_count,
   (select count(*) from research_reporting.ocr_matching_names) corpus_size,
   (select count(*) from research_reporting.ocr_matching_cases) fixture_count,
   (select count(*) from research_reporting.ocr_matching_cases b where public.planner_ocr_label_key(b.observed)=g.source_key and public.planner_ocr_label_key(b.expected)<>g.target_key) fixture_regressions,
   exists(select 1 from research_reporting.ocr_matching_cases b where public.planner_ocr_label_key(b.observed)=g.source_key and public.planner_ocr_label_key(b.expected)=g.target_key) baseline_matches
  from groups g order by occurrences desc,kind,source_key,target_key
 loop
  gate:=case when coalesce(row_group.conflict,false) then 'conflicting-evidence'
   when row_group.kind='artifact-name' then 'title-review'
   when row_group.canonical_target is null then 'unknown-target'
   when row_group.source_key=row_group.target_key then 'already-matched'
   when row_group.source_is_canonical then 'canonical-collision'
   when row_group.target_count>1 then 'ambiguous-target' when row_group.fixture_regressions>0 then 'fixture-collision' else 'review-exact-alias' end;
  insert into research_reporting.ocr_weekly_candidates(week_start,kind,target_name,occurrences,encounters,user_corrections,later_reads,screening,checks)
  values(week_day,row_group.kind,case when row_group.kind='perk-name' then row_group.canonical_target end,
   row_group.occurrences,row_group.encounters,row_group.user_corrections,row_group.later_reads,gate,
   jsonb_build_object('testKind','catalogue-exact-alias-screening','canonicalNamesChecked',row_group.corpus_size,
    'canonicalNamesChanged',case when row_group.source_is_canonical and row_group.source_key<>row_group.target_key then 1 else 0 end,
    'matcherBuild',(select build_hash from research_reporting.ocr_matching_baseline where singleton),'reviewedCasesChecked',row_group.fixture_count,'reviewedCasesRegressed',row_group.fixture_regressions,'baselineAlreadyMatches',row_group.baseline_matches,'targetKnown',row_group.canonical_target is not null,'conflictingTargets',row_group.target_count,
    'independentEncounters',row_group.encounters,'repeatEvidence',row_group.encounters>=3,
    'scannerRegression','pending-review','verified',false)) returning id into candidate;
  insert into research_reporting.ocr_weekly_sources
   select candidate,s.owner_id,s.id from public.planner_ocr_feedback_samples s
    where s.observed_at>=now()-interval '90 days'
     and ((s.received_at>=start_at and s.received_at<end_at) or (s.updated_at>=start_at and s.updated_at<end_at))
     and s.data->>'kind'=row_group.kind
     and public.planner_ocr_label_key(s.data->>'observed_text')=row_group.source_key
     and public.planner_ocr_label_key(coalesce(s.data->>'corrected_name',s.data->>'resolved_name',s.data->>'matched_name'))=row_group.target_key;
 end loop;
 return jsonb_build_object('week',week_day,'created',true,'samples',summary->'samples');
end $$;

create function public.planner_run_ocr_weekly_reports() returns jsonb
language plpgsql security definer set search_path='' as $$
declare week_day date;first_week date;last_week date:=(date_trunc('week',now() at time zone 'UTC')-interval '7 days')::date;result jsonb:='[]'::jsonb;
begin
 select coalesce(max(week_start)+7,last_week) into first_week from research_reporting.ocr_weekly_reports;
 first_week:=greatest(first_week,last_week-77);
 for week_day in select generate_series(first_week::timestamp,last_week::timestamp,interval '7 days')::date loop
  result:=result || jsonb_build_array(public.planner_generate_ocr_weekly_report(week_day));
 end loop;
 return result;
end $$;

create function public.planner_read_ocr_weekly_reports(p_week date default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('retention','indefinite-aggregates-and-reviewed-fixtures','reports',coalesce((
 select jsonb_agg(jsonb_build_object('week',r.week_start,'generatedAt',r.generated_at,'summary',r.summary,
  'candidates',coalesce((select jsonb_agg(to_jsonb(c) order by c.occurrences desc,c.id) from research_reporting.ocr_weekly_candidates c where c.week_start=r.week_start),'[]'::jsonb),
  'decisions',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from research_reporting.ocr_weekly_decisions d join research_reporting.ocr_weekly_candidates c on c.id=d.candidate_id where c.week_start=r.week_start),'[]'::jsonb)) order by r.week_start desc)
 from research_reporting.ocr_weekly_reports r where p_week is null or r.week_start=p_week),'[]'::jsonb))
$$;
create function public.planner_inspect_ocr_weekly_candidate(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('candidate',to_jsonb(c),'examples',coalesce((
 select jsonb_agg(distinct jsonb_build_object('observedText',s.data->'observed_text','proposedName',s.data->'matched_name','correctedName',s.data->'corrected_name',
  'resolvedName',s.data->'resolved_name','resolution',s.data->'resolution','score',s.data->'match_score','method',s.data->'match_method',
  'scanner',s.data->'scanner','hall',s.data->'hall','category',s.data->'category','position',s.data->'position','build',s.data->'app_build',
  'expiresAt',s.observed_at+interval '90 days'))
 from research_reporting.ocr_weekly_sources l join public.planner_ocr_feedback_samples s on s.owner_id=l.owner_id and s.id=l.sample_id
 where l.candidate_id=c.id and s.observed_at>=now()-interval '90 days'),'[]'::jsonb))
 from research_reporting.ocr_weekly_candidates c where c.id=p_id
$$;
create function public.planner_review_ocr_weekly_candidate(p_id uuid,p_decision text,p_reference text,p_expected text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate research_reporting.ocr_weekly_candidates;raw_text text;reviewed_fixture jsonb;expected text;
begin
 if p_decision is null or p_decision not in ('approved','rejected','needs-evidence','released') or p_reference is null or length(btrim(p_reference)) not between 3 and 500 or p_reference ~* '(bearer[[:space:]]|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|data:|[?&](token|key|code|secret)=)' then raise exception 'Explicit review decision and independent evidence reference required' using errcode='22023'; end if;
 select * into candidate from research_reporting.ocr_weekly_candidates where id=p_id for update;
 if not found then raise exception 'Candidate not found' using errcode='22023'; end if;
 if p_decision='released' then
  if candidate.decision<>'approved' or candidate.fixture is null or p_reference !~ '^commit:[a-f0-9]{40}$' then raise exception 'Record release only after approval, with commit:FULL_HASH' using errcode='22023'; end if;
  reviewed_fixture:=candidate.fixture || jsonb_build_object('productionRule','independently-released','releaseCommit',substr(p_reference,8));
 end if;
 if p_decision='approved' then
  if p_expected is null or length(btrim(p_expected)) not between 3 and 160 or p_expected !~ '^[[:alnum:] ''’.,%+()&/-]+$' then raise exception 'Independently verified expected name required' using errcode='22023'; end if;
  expected:=btrim(p_expected);
  if candidate.kind='perk-name' and not exists(select 1 from research_reporting.ocr_matching_names where name=expected) then raise exception 'Expected perk must be in the reviewed catalogue' using errcode='22023'; end if;
  select s.data->>'observed_text' into raw_text from research_reporting.ocr_weekly_sources l join public.planner_ocr_feedback_samples s on s.owner_id=l.owner_id and s.id=l.sample_id
   where l.candidate_id=p_id and s.observed_at>=now()-interval '90 days' order by s.observed_at,s.id limit 1;
  if raw_text is null then raise exception 'Source evidence expired; no fixture can be inferred' using errcode='22023'; end if;
  if length(raw_text)>500 or raw_text !~ '^[[:alnum:] ''’.,%+()&/-]+$' or raw_text ~* '(https?:|www\.|data:|bearer[[:space:]])' then raise exception 'Review source is not a safe OCR name fixture' using errcode='22023'; end if;
  reviewed_fixture:=jsonb_build_object('kind',candidate.kind,'observedText',raw_text,'expectedName',expected,'reviewReference',btrim(p_reference),'productionRule','not-applied','regression','pending');
 end if;
 insert into research_reporting.ocr_weekly_decisions(candidate_id,decision,review_reference,fixture) values(p_id,p_decision,btrim(p_reference),reviewed_fixture);
 update research_reporting.ocr_weekly_candidates set decision=p_decision,reviewed_at=now(),review_reference=btrim(p_reference),fixture=case when p_decision in ('approved','released') then reviewed_fixture else null end where id=p_id;
 return jsonb_build_object('id',p_id,'decision',p_decision,'productionRulesChanged',false);
end $$;
revoke all on function public.planner_ocr_label_key(text),public.planner_generate_ocr_weekly_report(date),public.planner_run_ocr_weekly_reports(),public.planner_read_ocr_weekly_reports(date),public.planner_inspect_ocr_weekly_candidate(uuid),public.planner_review_ocr_weekly_candidate(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.planner_generate_ocr_weekly_report(date),public.planner_run_ocr_weekly_reports(),public.planner_read_ocr_weekly_reports(date),public.planner_inspect_ocr_weekly_candidate(uuid),public.planner_review_ocr_weekly_candidate(uuid,text,text,text) to service_role;
commit;
