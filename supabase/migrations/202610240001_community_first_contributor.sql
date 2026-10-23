-- Aggregate reports start with one opted-in contributor. Existing grants and RLS remain.
create or replace function public.planner_crafting_report(p_hall text default null,p_category text default null,p_event text default null,p_version text default null) returns jsonb
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
  ) select case when contributors<1 then jsonb_build_object('status','insufficient-sample','minimumContributors',1,'updatedAt',null)
    else jsonb_build_object('status','ready','recorded',recorded,'excluded',excluded,'updatedAt',(select updated_at from public.planner_crafting_report_clock where singleton),'rules','ordinary-starts-2026-10-23',
      'metrics',jsonb_build_object('rows11',public.planner_crafting_metric(row_hits,row_total),'any11',public.planner_crafting_metric(any_hits,artifact_total),
      'two11',public.planner_crafting_metric(two_hits,artifact_total),'duplicate',public.planner_crafting_metric(duplicate_hits,duplicate_total)),
      'exclusions',(select coalesce(jsonb_object_agg(reason,n),'{}') from (select data->>'exclusion' reason,count(*) n from sample where data->>'exclusion' is not null group by data->>'exclusion') q)) end
    into result from counts;
  return result || jsonb_build_object('contexts',jsonb_build_object(
    'event',coalesce((select jsonb_agg(id order by id) from public.planner_crafting_contexts where kind='event'),'[]'::jsonb),
    'version',coalesce((select jsonb_agg(id order by id) from public.planner_crafting_contexts where kind='version'),'[]'::jsonb)));
end $$;
