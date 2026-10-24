// Generate the immutable initial registry from reviewed public assets.
const fs=require('node:fs');
const catalog=JSON.parse(fs.readFileSync('ui/data/artwork_catalog.json','utf8'));
const rows=catalog.entries.map(e=>{if(!/^art-[a-f0-9]{16}$/.test(e.id))throw Error('Invalid ID');return "('"+e.id+"')";}).join(',\n');
const sql=`-- Approved artwork references only. No user image storage or upload endpoint.
begin;
create table public.planner_artwork_catalog (
 id text primary key check (id ~ '^art-[a-f0-9]{16}$')
);
alter table public.planner_artwork_catalog enable row level security;
revoke all on public.planner_artwork_catalog from public,anon,authenticated;
grant select on public.planner_artwork_catalog to anon,authenticated;
grant all on public.planner_artwork_catalog to service_role;
create policy approved_artwork_read on public.planner_artwork_catalog for select to anon,authenticated using(true);
insert into public.planner_artwork_catalog(id) values
${rows};

create function public.planner_validate_artwork_workspace() returns trigger
language plpgsql security definer set search_path='' as $$
declare node jsonb; ref jsonb;
begin
 -- Older clients must reload rather than silently discard new references.
 if tg_op='UPDATE' and old.data->>'artworkSchema'='1' and new.data->>'artworkSchema' is distinct from '1' then
  raise exception 'Reload the planner before syncing artwork references' using errcode='22023';
 end if;
 if new.data ? 'artworkSchema' and new.data->'artworkSchema'<>'1'::jsonb then
  raise exception 'Unsupported artwork schema' using errcode='22023';
 end if;
 for node in
  with recursive nodes(value) as (
   select new.data
   union all
   select child.value from nodes n cross join lateral (
    select e.value from jsonb_each(case when jsonb_typeof(n.value)='object' then n.value else '{}'::jsonb end) e
    union all
    select a.value from jsonb_array_elements(case when jsonb_typeof(n.value)='array' then n.value else '[]'::jsonb end) a
   ) child
  ) select value from nodes
 loop
  if jsonb_typeof(node)='object' then
   if node ?| array['image','artwork','artworkMatch','artworkDescriptor','artworkFingerprint','artworkEmbedding','screenshot','screenshots','frame','frames','canvas','raw','rawType','observations','access_token','refresh_token','authorization'] then
    raise exception 'Image and raw capture data cannot enter workspace sync' using errcode='22023';
   end if;
   if node ? 'artworkId' and node->'artworkId'<>'null'::jsonb then
    ref:=node->'artworkId';
    if new.data->>'artworkSchema' is distinct from '1' or jsonb_typeof(ref)<>'string' or
       not exists(select 1 from public.planner_artwork_catalog a where a.id=node->>'artworkId') then
     raise exception 'Unapproved artwork reference' using errcode='22023';
    end if;
   end if;
  elsif jsonb_typeof(node)='string' and (node #>> '{}') ~* '^(data:|blob:)' then
   raise exception 'Embedded images cannot enter workspace sync' using errcode='22023';
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.planner_validate_artwork_workspace() from public,anon,authenticated;
create trigger planner_workspace_artwork before insert or update on public.planner_workspaces
 for each row execute function public.planner_validate_artwork_workspace();
notify pgrst, 'reload schema';
commit;
`;
fs.writeFileSync('supabase/migrations/202610240007_shared_artwork.sql',sql);
console.log('Generated '+catalog.entries.length+' approved artwork IDs.');
