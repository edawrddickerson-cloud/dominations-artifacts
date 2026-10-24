-- Approved artwork references only. No user image storage or upload endpoint.
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
('art-de49634649ce9c23'),
('art-4daf0a8c759002e4'),
('art-d8f115f991c791cb'),
('art-a498e9e16bdd973e'),
('art-666a346483d794ce'),
('art-c3bb0ecf9d6e556f'),
('art-067faf3759730b81'),
('art-091e26d42885a50b'),
('art-b689404a8fd10755'),
('art-51de5d5c070b5608'),
('art-4af12e1aff8f6cbe'),
('art-241586bcffda9d9a'),
('art-eeca1c8e7122455c'),
('art-ea2c2d6ee73fb850'),
('art-330d2e61895181dc'),
('art-4970bcfe954340f0'),
('art-e3348affe6e21f20'),
('art-842df5ab9a1d7d61'),
('art-959260a7beeba4c1'),
('art-30d8bd6023f74d82'),
('art-e4c48c094738e5d6'),
('art-39bb88726ccb0830'),
('art-ea8912105925c327'),
('art-d30c0dd4fc85f198'),
('art-b246e246e0f13d58'),
('art-1987bc1977e56d6e'),
('art-76e384a4bc967536'),
('art-e273b0a19a3756aa'),
('art-af893298c5f60859'),
('art-93982d05c67ef381'),
('art-baefd115f84c0d4f'),
('art-c5d554b6b534a50c'),
('art-d54610ef8271b8ad'),
('art-752babac62897e48'),
('art-2ba79d21b76ae5d6'),
('art-e6e9e59bdf723a1b'),
('art-313599f86f24613b'),
('art-897c7e4b71bdf5e2'),
('art-f3391b173705bb6c'),
('art-1aa68ddcf707e148'),
('art-599042556ba1fe2f'),
('art-95f8fdd79e32980f'),
('art-c2937acf28912832'),
('art-672784be6a42da33'),
('art-a61adeb32cd109c7'),
('art-ce6fae8a2a8a2870'),
('art-0a6407e72f2e37aa'),
('art-320dee0ef3c44749'),
('art-dac8ade637dced35'),
('art-8e9dd2dc29a27199'),
('art-60e76e4bf8eedaa5'),
('art-49a29eb7021b51b4'),
('art-41cf202af1d709e0'),
('art-a0ec8f06b5b97f3f'),
('art-5b17b2a054bc0388'),
('art-72929cf055f4d672'),
('art-0c0c309ef557843c'),
('art-b0ece21936816823'),
('art-11c75ad34bda0128'),
('art-32d940c4439e1426'),
('art-71ea095ac34809f9'),
('art-28eb2224c49a5b8f'),
('art-d04109929ccdfd9c'),
('art-7555338d570f103d'),
('art-5370a39dfe4b3d68'),
('art-486ff37e0f7b0b4f'),
('art-5d014a3d88b55c4b'),
('art-8db03677d544d059'),
('art-b1182c6a4f720e5c'),
('art-3c5dab10f1b76cc8'),
('art-49d11b8bd06ffe56'),
('art-54ed0f88dd7cc6c9'),
('art-eb5aabe22aa5d246'),
('art-6975b264d5146cd6'),
('art-42e5debeb7e24806'),
('art-f922faf26516af17'),
('art-5159ec4297f51836'),
('art-c686e3f58d6be28f'),
('art-ad2f5c8665b2f8e8'),
('art-cc4d493154eab85f'),
('art-eca13a292a036f26'),
('art-6e2801f48b159498'),
('art-e0c886ae8c2bcf12'),
('art-93d112a8ef6e71eb'),
('art-2179e4ad542edf69'),
('art-92f66e5dc4494b7a'),
('art-0bd4a1c7cfd4d246'),
('art-0abfc51c8f9a265e'),
('art-4bfeeaa8c62039ee'),
('art-04dea5c16fc28f9a'),
('art-eddf20f49169d7b3'),
('art-8ad8675a8e05df40'),
('art-026775412306e0dd'),
('art-a5840f49443f1463'),
('art-20b6d2f409587866'),
('art-9638fde4772b82eb'),
('art-86a2be0fefc03c55'),
('art-6e984368de192e8e'),
('art-30d3b7eeca59d4e8'),
('art-6ae73077c5c96f2c'),
('art-ab4675fb69af8d17'),
('art-3b60358c88c1b84f'),
('art-80d745c72efee9e7'),
('art-0e7cfef22daf840d'),
('art-9bf37f86d66a7e82'),
('art-92b5ce34e1609fae'),
('art-9cdc954d6f173cd5'),
('art-24f31f0cac923aca'),
('art-ef2aa04b691ac26b'),
('art-3dd7055c60efa1c3'),
('art-ca60d49335394398'),
('art-45254b852af26eaa'),
('art-64cdf1468538a40b'),
('art-2089791e229b5bb0'),
('art-608d14784ba462b2'),
('art-27bae7a4d5f3a174'),
('art-7443e7ef16880e36'),
('art-80f27a0598acec18'),
('art-05364334ed6c1e55'),
('art-788ca6f0ea8a9359'),
('art-a295ec354ba633c7'),
('art-dbc508954aff817f'),
('art-d3ff165972837f8f'),
('art-22a48fbff66c84e8'),
('art-50724e7a3756d919'),
('art-fef2ef3537e2bc32'),
('art-0254b6b23ab798fc'),
('art-71a1e92c7299ada8'),
('art-fcc582e415e1f9dc'),
('art-d6c2c803605fca3f'),
('art-3870d742c48d1ef1'),
('art-e38ce1be2ea82a19'),
('art-ce08e26cd3d1e14f'),
('art-209b1a906525ca5d'),
('art-b8c8b51fdb770d69'),
('art-b44b899c4b2866f2'),
('art-cef0d588e0f7a7a2'),
('art-c1f2646858e5c814'),
('art-604fabde3bb148b8'),
('art-3af80d37874e0af4'),
('art-7b9fe9732569488d'),
('art-88a681b370edb336'),
('art-d58bfc6579a2fb45'),
('art-e6949950a22ef3c6'),
('art-9e12cfa9b16fae95'),
('art-6b0593de6a6daac0'),
('art-d8917fa30682d18a'),
('art-299e0c5d43d1d69b'),
('art-08f24e5a5dfaad3c'),
('art-3af073e1a823334b'),
('art-a6a3bc15fe2004c4'),
('art-0c19660a714a7679'),
('art-7dc1aa006363e7fc');

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
