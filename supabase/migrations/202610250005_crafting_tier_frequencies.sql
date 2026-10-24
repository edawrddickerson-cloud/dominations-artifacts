-- Normalize per-perk row frequencies into low/mid/high tiers before combining halls.
create or replace function public.planner_crafting_summary(p_hall text default null,p_category text default null,p_event text default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  -- Exact allowlisted filters; no owner or record-level reporting endpoint.
  with sample as (
    select e.* from public.planner_crafting_evidence e join public.planner_crafting_consent c on c.owner_id=e.owner_id and c.enabled
    where not e.deleted and e.observed_at>=now()-interval '730 days'
      and (p_hall is null or e.data->>'hall'=p_hall) and (p_category is null or e.data->>'category'=p_category)
      and (p_event is null or coalesce(e.data->>'event_id','unknown')=p_event)
  ), per_item as (
    select s.owner_id,s.id,s.received_at,s.data->>'exclusion' exclusion,s.data->>'hall' hall,
      count(*) filter(where 11=any(r.starts) or -11=any(r.starts)) eligible_rows,
      count(*) filter(where abs((p->>'value')::numeric)=11) hits,
      count(*) filter(where abs((p->>'value')::numeric)=6) six_hits,
      count(distinct p->>'perk') distinct_perks
    from sample s left join lateral jsonb_array_elements(s.data->'rows') p on true
      left join public.planner_crafting_rules r on r.hall=s.data->>'hall' and r.category=s.data->>'category' and r.perk=p->>'perk'
    group by s.owner_id,s.id,s.received_at,s.data
  ), eligible_rows as (
    select s.owner_id,s.id,s.data->>'hall' hall,p->>'perk' perk,(p->>'value')::numeric value
    from sample s cross join lateral jsonb_array_elements(s.data->'rows') p
    where s.data->>'exclusion' is null
  ), perk_groups as (
    select owner_id,id,perk,count(*) n from eligible_rows group by owner_id,id,perk
  ), multiplicities as (
    select owner_id,id,max(n) n from perk_groups group by owner_id,id
  ), value_counts as (
    select perk,value,count(*) n from eligible_rows group by perk,value
  ), tier_counts as (
    select perk,
      count(*) filter(where abs(value)=1) low,
      count(*) filter(where abs(value)=case when hall='war' then 3 else 6 end) mid,
      count(*) filter(where abs(value)=case when hall='war' then 6 else 11 end) high
    from eligible_rows group by perk
  ), perk_counts as (
    select perk,sum(n)::bigint rows,count(*)::bigint items from perk_groups group by perk
  ), counts as (
    select count(*) recorded,count(distinct owner_id) contributors,max(received_at) updated,
      count(*) filter(where exclusion is not null) excluded,
      coalesce(sum(eligible_rows) filter(where exclusion is null),0)::bigint row_total,
      coalesce(sum(hits) filter(where exclusion is null),0)::bigint row_hits,
      count(*) filter(where exclusion is null and eligible_rows>0) artifact_total,
      count(*) filter(where exclusion is null and eligible_rows>0 and hits>=1) any_hits,
      count(*) filter(where exclusion is null and eligible_rows>0 and hits>=2) two_hits,
      count(*) filter(where exclusion is null and hall='war') war_total,
      count(*) filter(where exclusion is null) duplicate_total,
      count(*) filter(where exclusion is null and distinct_perks<5) duplicate_hits from per_item
  ) select case when contributors<1 then jsonb_build_object('status','insufficient-sample','minimumContributors',1,'updatedAt',null)
    else jsonb_build_object('status','ready','recorded',recorded,'excluded',excluded,'updatedAt',(select updated_at from public.planner_crafting_report_clock where singleton),'rules','complete-stats-2026-10-25',
      'metrics',jsonb_build_object('rows11',public.planner_crafting_metric(row_hits,row_total),'any11',public.planner_crafting_metric(any_hits,artifact_total),
      'two11',public.planner_crafting_metric(two_hits,artifact_total),'duplicate',public.planner_crafting_metric(duplicate_hits,duplicate_total)),
      'frequencies',(select coalesce(jsonb_agg(jsonb_build_object('name',pc.perk,'items',pc.items,'rows',pc.rows,
        'tiers',(select jsonb_build_array(tc.low::numeric/pc.rows,tc.mid::numeric/pc.rows,tc.high::numeric/pc.rows) from tier_counts tc where tc.perk=pc.perk),
        'repeats',(select jsonb_agg(jsonb_build_object('count',bins.n)||public.planner_crafting_metric((select count(*) from perk_groups pg where pg.perk=pc.perk and pg.n=bins.n),duplicate_total) order by bins.n) from generate_series(2,5) bins(n)),
        'values',(select jsonb_agg(jsonb_build_object('value',v.value,'count',v.n,'rate',v.n::numeric/pc.rows) order by v.value) from value_counts v where v.perk=pc.perk)) order by pc.items desc,pc.perk),'[]'::jsonb) from perk_counts pc),
      'distributions',jsonb_build_object(
        'six',(select jsonb_agg(jsonb_build_object('count',bins.n,
          'exact',public.planner_crafting_metric((select count(*) from per_item where exclusion is null and hall='war' and six_hits=bins.n),war_total),
          'atLeast',public.planner_crafting_metric((select count(*) from per_item where exclusion is null and hall='war' and six_hits>=bins.n),war_total)) order by bins.n) from generate_series(0,5) bins(n)),
        'eleven',(select jsonb_agg(jsonb_build_object('count',n,
          'exact',public.planner_crafting_metric((select count(*) from per_item where exclusion is null and eligible_rows>0 and hits=n),artifact_total),
          'atLeast',public.planner_crafting_metric((select count(*) from per_item where exclusion is null and eligible_rows>0 and hits>=n),artifact_total)) order by n) from generate_series(0,5) n),
        'duplicates',(select jsonb_agg(jsonb_build_object('count',bins.n,
          'exact',public.planner_crafting_metric((select count(*) from multiplicities m where m.n=bins.n),duplicate_total),
          'atLeast',public.planner_crafting_metric((select count(*) from multiplicities m where m.n>=bins.n),duplicate_total)) order by bins.n) from generate_series(2,5) bins(n))),
      'exclusions',(select coalesce(jsonb_object_agg(reason,n),'{}') from (select data->>'exclusion' reason,count(*) n from sample where data->>'exclusion' is not null group by data->>'exclusion') q)) end
    into result from counts;
  return result || jsonb_build_object('contexts',jsonb_build_object(
    'event',coalesce((select jsonb_agg(id order by id) from public.planner_crafting_contexts where kind='event'),'[]'::jsonb)));
end $$;
