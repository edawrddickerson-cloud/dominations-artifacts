-- Read-only aggregate model inputs. No history, consent or event labels change.
-- Historical periods are inferred calibration samples, not registered events.
create or replace function public.planner_crafting_probability_model(p_hall text,p_category text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if p_hall not in ('main','war') or p_hall is null or p_category is null
    or not (p_hall='main' and p_category in ('weapon','armor','jewelry','pottery') or p_hall='war' and p_category in ('weapon','armor','equipment'))
    then raise exception 'Select a Hall and category' using errcode='22023'; end if;
  with sample as materialized (
    select e.data,e.observed_at from public.planner_crafting_evidence e
    join public.planner_crafting_consent c on c.owner_id=e.owner_id and c.enabled
    where not e.deleted and e.observed_at>=now()-interval '730 days'
      and e.observed_at<=now()+interval '1 day'
      and e.data->>'hall'=p_hall and e.data->>'category'=p_category
      and e.data->>'exclusion' is null and jsonb_array_length(e.data->'rows')=5
      and not exists(select 1 from jsonb_array_elements(e.data->'rows') r where not exists(
        select 1 from public.planner_crafting_rules rule where rule.hall=p_hall and rule.category=p_category
          and rule.perk=r->>'perk' and (r->>'value')::numeric=any(rule.starts)))
  ), rows as (
    select p->>'perk' perk,abs((p->>'value')::numeric) magnitude,
      case when observed_at>='2026-10-13T00:00:00Z' and observed_at<'2026-10-19T00:00:00Z' then 'event'
        when observed_at>='2026-10-20T00:00:00Z' and observed_at<'2026-10-25T00:00:00Z' then 'normal' end period
    from sample cross join lateral jsonb_array_elements(data->'rows') p
  ), perks as (select perk,count(*) n from rows group by perk)
  select jsonb_build_object('version',1,'hall',p_hall,'category',initcap(p_category),'artifacts',(select count(*) from sample),'rows',(select count(*) from rows),
    'perks',coalesce((select jsonb_agg(jsonb_build_object('name',perk,'rows',n) order by perk) from perks),'[]'::jsonb),
    'profiles',(select jsonb_object_agg(period,jsonb_build_object('artifacts',n/5,'tiers',jsonb_build_array(low,mid,high))) from (
      select periods.period,count(r.perk) n,count(*) filter(where magnitude=1) low,
        count(*) filter(where magnitude=case when p_hall='war' then 3 else 6 end) mid,
        count(*) filter(where magnitude=case when p_hall='war' then 6 else 11 end) high
      from (values('event'),('normal')) periods(period) left join rows r on r.period=periods.period group by periods.period) q),
    'calibration',jsonb_build_object('id','inferred-october-2026-v1',
      'event',jsonb_build_array('2026-10-13T00:00:00.000Z','2026-10-19T00:00:00.000Z'),
      'normal',jsonb_build_array('2026-10-20T00:00:00.000Z','2026-10-25T00:00:00.000Z')),
    'updatedAt',(select updated_at from public.planner_crafting_report_clock where singleton)) into result;
  return result;
end $$;
revoke all on function public.planner_crafting_probability_model(text,text) from public;
grant execute on function public.planner_crafting_probability_model(text,text) to anon,authenticated;
