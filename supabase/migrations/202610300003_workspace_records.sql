-- Additive private record transport. Accounts remain on the legacy protocol
-- until planner_records_activate is explicitly called for that owner.
begin;

create table public.planner_record_heads (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check(revision>=0), operation_id uuid,
 updated_at timestamptz not null default now(), game_key text not null default 'dominations',
 activated_at timestamptz not null default now(),
 live_bytes bigint not null default 0, record_count integer not null default 0,
 artwork_schema text
);
create table public.planner_record_snapshots (
 owner_id uuid not null references auth.users(id) on delete cascade, revision bigint not null,
 operation_id uuid not null, updated_at timestamptz not null, saved_at timestamptz not null default now(),
 primary key(owner_id,revision)
);
create table public.planner_record_versions (
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text collate "C" not null, scope text collate "C" not null, key text collate "C" not null,
 revision bigint not null, position integer not null, data jsonb, deleted boolean not null default false,
 bytes integer not null, artwork_ids text[] not null default '{}',
 primary key(owner_id,kind,scope,key,revision)
);
create index planner_record_versions_revision on public.planner_record_versions(owner_id,revision);
create table public.planner_record_current (
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text collate "C" not null, scope text collate "C" not null, key text collate "C" not null,
 revision bigint not null, position integer not null, bytes integer not null, artwork_ids text[] not null default '{}',
 primary key(owner_id,kind,scope,key)
);
create index planner_record_current_positions on public.planner_record_current(owner_id,kind,scope,position);
create table public.planner_record_groups (
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null, scope text not null, records_count integer not null check(records_count>0),
 primary key(owner_id,kind,scope)
);
create table public.planner_record_operations (
 owner_id uuid not null references auth.users(id) on delete cascade, operation_id uuid not null,
 expected_revision bigint not null, batch_count integer not null, staged_bytes bigint not null default 0,
 created_at timestamptz not null default now(), primary key(owner_id,operation_id)
);
create table public.planner_record_artwork_refs (
 owner_id uuid not null references auth.users(id) on delete cascade,
 artwork_id text not null, references_count integer not null check(references_count>0),
 primary key(owner_id,artwork_id)
);
create table public.planner_record_batches (
 owner_id uuid not null, operation_id uuid not null, batch_index integer not null,
 changes jsonb not null, request_hash bytea not null, bytes integer not null,
 primary key(owner_id,operation_id,batch_index),
 foreign key(owner_id,operation_id) references public.planner_record_operations(owner_id,operation_id) on delete cascade
);
create table public.planner_record_receipts (
 owner_id uuid primary key references auth.users(id) on delete cascade, operation_id uuid not null,
 expected_revision bigint not null, batch_count integer not null, batch_hashes jsonb not null
);

alter table public.planner_record_heads enable row level security;
alter table public.planner_record_snapshots enable row level security;
alter table public.planner_record_versions enable row level security;
alter table public.planner_record_current enable row level security;
alter table public.planner_record_operations enable row level security;
alter table public.planner_record_batches enable row level security;
alter table public.planner_record_receipts enable row level security;
alter table public.planner_record_artwork_refs enable row level security;
alter table public.planner_record_groups enable row level security;
revoke all on public.planner_record_artwork_refs,public.planner_record_groups from public,anon,authenticated;
grant all on public.planner_record_artwork_refs,public.planner_record_groups to service_role;
revoke all on public.planner_record_heads,public.planner_record_snapshots,public.planner_record_versions,public.planner_record_current,public.planner_record_operations,public.planner_record_batches,public.planner_record_receipts from public,anon,authenticated;
grant all on public.planner_record_heads,public.planner_record_snapshots,public.planner_record_versions,public.planner_record_current,public.planner_record_operations,public.planner_record_batches,public.planner_record_receipts to service_role;
-- Only the head is directly readable, for the legacy SELECT policy's fence.
grant select on public.planner_record_heads to authenticated;
create policy own_record_head on public.planner_record_heads for select to authenticated using(owner_id=(select auth.uid()));

create function public.planner_records_lock(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from p_owner then raise exception 'Account changed' using errcode='42501'; end if;
 -- Both protocols take this lock before creating/updating an owner's head.
 perform 1 from auth.users where id=p_owner for update;
 if not found then raise exception 'Account changed' using errcode='42501'; end if;
end $$;

create function public.planner_records_validate(p_row jsonb) returns text[]
language plpgsql security definer set search_path='' as $$
declare refs text[]; value jsonb:=p_row->'data'; k text:=p_row->>'kind';
begin
 if jsonb_typeof(p_row) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_row) field where field<>all(array['kind','scope','key','position','data','deleted'])) or k is null or
    k not in ('workspace','setting','collection','inventory','log','craft','archive') or
    jsonb_typeof(p_row->'scope') is distinct from 'string' or jsonb_typeof(p_row->'key') is distinct from 'string' or
    octet_length(p_row->>'scope')+octet_length(p_row->>'key')>1024 or p_row->>'key'='' or
    (k<>'inventory' and p_row->>'scope'<>'') or
    (k in ('workspace','log') and p_row->>'key'<>'root') or
    jsonb_typeof(p_row->'position') is distinct from 'number' or (p_row->>'position')!~'^(0|[1-9][0-9]{0,8})$' or
    (p_row ? 'deleted' and jsonb_typeof(p_row->'deleted') is distinct from 'boolean') then
  raise exception 'Invalid workspace record' using errcode='22023';
 end if;
 if p_row->>'deleted'='true' then
  if value is distinct from 'null'::jsonb then raise exception 'Invalid record deletion' using errcode='22023'; end if;
  return '{}';
 end if;
 -- A setting identity becomes an object key in the reconstructed document;
 -- validate it as such, rather than only scanning its scalar value.
 if k='setting' and p_row->>'key'=any(array['image','artwork','artworkMatch','artworkDescriptor','artworkFingerprint','artworkEmbedding','screenshot','screenshots','frame','frames','canvas','raw','rawType','observations','access_token','refresh_token','authorization']) then
  raise exception 'Capture data cannot enter workspace sync' using errcode='22023';
 end if;
 if value is null or (k='setting' and jsonb_typeof(value)<>'string') or
    (k<>'setting' and jsonb_typeof(value)<>'object') or
    (k in ('inventory','craft','archive','collection') and (jsonb_typeof(value->'id') is distinct from 'string' or value->>'id' is distinct from p_row->>'key')) or
    (k='collection' and value-'id'<>'{}'::jsonb) or
    (k='workspace' and (value->>'kind' is distinct from 'dominations-cloud-workspace' or value->'version' is distinct from '1'::jsonb or value->>'game' is distinct from 'dominations' or value ?| array['settings','records','craftingLog'])) or
    (k='log' and (value->'version' is distinct from '2'::jsonb or jsonb_typeof(value->'ledger') is distinct from 'object' or value->'ledger'->'version' is distinct from '1'::jsonb or value ? 'items' or value->'ledger' ? 'archived')) then
  raise exception 'Invalid record payload' using errcode='22023';
 end if;
 if (k='craft' and jsonb_typeof(value->'rows') is distinct from 'array') or
    (k in ('craft','archive') and value->'revision' is not null and value->'revision'<>'null'::jsonb and
      (jsonb_typeof(value->'revision')<>'number' or (value->>'revision')!~'^(0|[1-9][0-9]{0,15})$' or (value->>'revision')::numeric>9007199254740991)) then
  raise exception 'Invalid crafting record' using errcode='22023';
 end if;
 if k='inventory' then
  if jsonb_typeof(value->'name') is distinct from 'string' or jsonb_typeof(value->'type') is distinct from 'string' or value->>'hall' is null or value->>'hall' not in ('main','war') or jsonb_typeof(value->'rows') is distinct from 'array' then raise exception 'Invalid inventory record' using errcode='22023'; end if;
  if jsonb_array_length(value->'rows') not between 1 and 6 or exists(select 1 from jsonb_array_elements(value->'rows') row_value where jsonb_typeof(row_value->'name') is distinct from 'string' or jsonb_typeof(row_value->'value') is distinct from 'number') then raise exception 'Invalid inventory rows' using errcode='22023'; end if;
 end if;
 if k='workspace' and value ? 'artworkSchema' and value->'artworkSchema'<>'1'::jsonb then raise exception 'Unsupported artwork schema' using errcode='22023'; end if;
 if jsonb_path_exists(value,'strict $.** ? (@.type() == "object" && (exists (@."image") || exists (@."artwork") || exists (@."artworkMatch") || exists (@."artworkDescriptor") || exists (@."artworkFingerprint") || exists (@."artworkEmbedding") || exists (@."screenshot") || exists (@."screenshots") || exists (@."frame") || exists (@."frames") || exists (@."canvas") || exists (@."raw") || exists (@."rawType") || exists (@."observations") || exists (@."access_token") || exists (@."refresh_token") || exists (@."authorization")))') or
    jsonb_path_exists(value,'strict $.** ? (@.type() == "string" && @ like_regex "^(data:|blob:)" flag "i")') then
  raise exception 'Capture data cannot enter workspace sync' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_path_query(value,'strict $.** ? (@.type() == "object" && exists (@.artworkId) && @.artworkId.type() != "null").artworkId') r where jsonb_typeof(r)<>'string') then
  raise exception 'Unapproved artwork reference' using errcode='22023';
 end if;
 select coalesce(array_agg(distinct r #>> '{}'),'{}') into refs from jsonb_path_query(value,'strict $.** ? (@.type() == "object" && exists (@.artworkId) && @.artworkId.type() != "null").artworkId') r;
 -- This scalar will become settings.artworkId in the reconstructed object.
 if k='setting' and p_row->>'key'='artworkId' then refs:=array_append(refs,value #>> '{}'); end if;
 if exists(select 1 from unnest(refs) id where not exists(select 1 from public.planner_artwork_catalog a where a.id=id)) then raise exception 'Unapproved artwork reference' using errcode='22023'; end if;
 return refs;
end $$;

create function public.planner_records_split(p_data jsonb) returns setof jsonb
language plpgsql immutable set search_path='' as $$
declare r record; i record; l jsonb;
begin
 return next jsonb_build_object('kind','workspace','scope','','key','root','position',0,'data',p_data-'settings'-'records'-'craftingLog');
 for r in select * from jsonb_each(p_data->'settings') loop return next jsonb_build_object('kind','setting','scope','','key',r.key,'position',0,'data',r.value); end loop;
 for r in select value,ordinality from jsonb_array_elements(p_data->'records') with ordinality loop
  return next jsonb_build_object('kind','collection','scope','','key',r.value->>'id','position',r.ordinality-1,'data',jsonb_build_object('id',r.value->>'id'));
  for i in select value,ordinality from jsonb_array_elements(r.value->'items') with ordinality loop return next jsonb_build_object('kind','inventory','scope',r.value->>'id','key',i.value->>'id','position',i.ordinality-1,'data',i.value); end loop;
 end loop;
 l:=p_data->'craftingLog';
 if l is not null and l<>'null'::jsonb then
  return next jsonb_build_object('kind','log','scope','','key','root','position',0,'data',jsonb_set(l-'items','{ledger}',(l->'ledger')-'archived'));
  for i in select value,ordinality from jsonb_array_elements(l->'items') with ordinality loop return next jsonb_build_object('kind','craft','scope','','key',i.value->>'id','position',i.ordinality-1,'data',i.value); end loop;
  for i in select value,ordinality from jsonb_array_elements(l->'ledger'->'archived') with ordinality loop return next jsonb_build_object('kind','archive','scope','','key',i.value->>'id','position',i.ordinality-1,'data',i.value); end loop;
 end if;
end $$;

create function public.planner_records_put(p_owner uuid,p_revision bigint,p_row jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare refs text[]; n integer; gone boolean:=coalesce((p_row->>'deleted')::boolean,false); previous public.planner_record_current%rowtype; ref text; group_size integer; separator_delta integer:=0;
begin
 refs:=public.planner_records_validate(p_row);
 select * into previous from public.planner_record_current where owner_id=p_owner and kind=p_row->>'kind' and scope=p_row->>'scope' and key=p_row->>'key';
 -- Exact jsonb::text document bytes: record values plus their structural
 -- wrappers and separators. Each nonempty array/object removes one trailing
 -- separator below, without reconstructing the complete document.
 n:=case when gone then 0 else octet_length((p_row->'data')::text)+case p_row->>'kind'
  when 'workspace' then 31 when 'setting' then octet_length(to_jsonb(p_row->>'key')::text)+4
  when 'collection' then 15 when 'log' then 46 else 2 end end;
 insert into public.planner_record_versions(owner_id,kind,scope,key,revision,position,data,deleted,bytes,artwork_ids)
 values(p_owner,p_row->>'kind',p_row->>'scope',p_row->>'key',p_revision,(p_row->>'position')::integer,p_row->'data',gone,n,refs);
 if gone then delete from public.planner_record_current where owner_id=p_owner and kind=p_row->>'kind' and scope=p_row->>'scope' and key=p_row->>'key';
 else insert into public.planner_record_current values(p_owner,p_row->>'kind',p_row->>'scope',p_row->>'key',p_revision,(p_row->>'position')::integer,n,refs)
 on conflict(owner_id,kind,scope,key) do update set revision=excluded.revision,position=excluded.position,bytes=excluded.bytes,artwork_ids=excluded.artwork_ids;
 end if;
 if p_row->>'kind' in ('setting','collection','inventory','craft','archive') then
  if previous.owner_id is null and not gone then
   insert into public.planner_record_groups values(p_owner,p_row->>'kind',p_row->>'scope',1)
    on conflict(owner_id,kind,scope) do update set records_count=planner_record_groups.records_count+1 returning records_count into group_size;
   if group_size=1 then separator_delta:=-2; end if;
  elsif previous.owner_id is not null and gone then
   delete from public.planner_record_groups where owner_id=p_owner and kind=p_row->>'kind' and scope=p_row->>'scope' and records_count=1;
   if found then separator_delta:=2;
   else update public.planner_record_groups set records_count=records_count-1 where owner_id=p_owner and kind=p_row->>'kind' and scope=p_row->>'scope'; end if;
  end if;
 end if;
 update public.planner_record_heads set live_bytes=live_bytes+n-coalesce(previous.bytes,0)+separator_delta,
  record_count=record_count+case when gone then 0 else 1 end-case when previous.owner_id is null then 0 else 1 end where owner_id=p_owner;
 foreach ref in array coalesce(previous.artwork_ids,'{}') loop
  delete from public.planner_record_artwork_refs where owner_id=p_owner and artwork_id=ref and references_count=1;
  if not found then update public.planner_record_artwork_refs set references_count=references_count-1 where owner_id=p_owner and artwork_id=ref; end if;
 end loop;
 foreach ref in array refs loop
  insert into public.planner_record_artwork_refs values(p_owner,ref,1) on conflict(owner_id,artwork_id) do update set references_count=planner_record_artwork_refs.references_count+1;
 end loop;
end $$;

create function public.planner_records_check(p_owner uuid,p_old_schema text,p_relationships boolean default true) returns void
language plpgsql security definer set search_path='' as $$
declare root jsonb; schema_value text; total bigint; n integer;
begin
 select v.data into root from public.planner_record_current c join public.planner_record_versions v using(owner_id,kind,scope,key,revision) where c.owner_id=p_owner and c.kind='workspace';
 if root is null then raise exception 'Workspace metadata missing' using errcode='22023'; end if;
 schema_value:=root->>'artworkSchema';
 if p_old_schema='1' and schema_value is distinct from '1' then raise exception 'Artwork schema cannot be downgraded' using errcode='22023'; end if;
 if exists(select 1 from public.planner_record_artwork_refs ref where ref.owner_id=p_owner and
   (schema_value is distinct from '1' or not exists(select 1 from public.planner_artwork_catalog a where a.id=ref.artwork_id))) then raise exception 'Unapproved artwork reference' using errcode='22023'; end if;
 if p_relationships and (not exists(select 1 from public.planner_record_current where owner_id=p_owner and kind='collection' and key='items') or
    not exists(select 1 from public.planner_record_current where owner_id=p_owner and kind='setting' and key='dn-profiles') or
    exists(select 1 from public.planner_record_current c where c.owner_id=p_owner and c.kind='inventory' and not exists(select 1 from public.planner_record_current p where p.owner_id=p_owner and p.kind='collection' and p.key=c.scope)) or
    (exists(select 1 from public.planner_record_current where owner_id=p_owner and kind in ('craft','archive')) and not exists(select 1 from public.planner_record_current where owner_id=p_owner and kind='log')) or
    exists(select 1 from public.planner_record_current c join public.planner_record_current a on a.owner_id=c.owner_id and a.key=c.key and a.kind='archive' where c.owner_id=p_owner and c.kind='craft')) then
  raise exception 'Incomplete workspace records' using errcode='22023';
 end if;
 select live_bytes,record_count into total,n from public.planner_record_heads where owner_id=p_owner;
 if total>16777216 or n>200000 then raise exception 'Workspace exceeds record quota' using errcode='22023'; end if;
 update public.planner_record_heads set artwork_schema=schema_value where owner_id=p_owner;
end $$;

create function public.planner_records_metadata(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare h public.planner_record_heads%rowtype; result jsonb;
begin
 if auth.uid() is null or auth.uid() is distinct from p_owner then raise exception 'Account changed' using errcode='42501'; end if;
 select * into h from public.planner_record_heads where owner_id=p_owner;
 if found then
  if h.revision=0 then return null; end if;
  return jsonb_build_object('game_key',h.game_key,'revision',h.revision,'operation_id',h.operation_id,'updated_at',h.updated_at,'format',4);
 end if;
 select jsonb_build_object('game_key',game_key,'revision',revision,'operation_id',operation_id,'updated_at',updated_at,'format',3) into result from public.planner_workspaces where owner_id=p_owner;
 return result;
end $$;

create function public.planner_records_activate(p_owner uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.planner_workspaces%rowtype; s record; r jsonb; c record; old_schema text; found_head public.planner_record_heads%rowtype;
begin
 perform public.planner_records_lock(p_owner);
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid expected revision' using errcode='22023'; end if;
 select * into found_head from public.planner_record_heads where owner_id=p_owner;
 if found then
  if found_head.revision<>p_expected_revision then raise exception 'Workspace changed' using errcode='40001'; end if;
  return public.planner_records_metadata(p_owner);
 end if;
 select * into w from public.planner_workspaces where owner_id=p_owner for update;
 if coalesce(w.revision,0)<>p_expected_revision then raise exception 'Workspace changed' using errcode='40001'; end if;
 insert into public.planner_record_heads(owner_id) values(p_owner);
 if w.owner_id is null then return null; end if;
 -- A second account can be converted in the same administrator transaction.
 drop table if exists pg_temp.planner_records_activation_keys;
 create temporary table planner_records_activation_keys(kind text,scope text,key text,primary key(kind,scope,key)) on commit drop;
 for s in select data,revision,operation_id,updated_at from (
   select h.data,h.revision,w.operation_id,h.saved_at updated_at from public.planner_workspace_history h where h.owner_id=p_owner and h.saved_at>=now()-interval '30 days' order by h.revision desc limit 3
  ) older union all select w.data,w.revision,w.operation_id,w.updated_at order by revision loop
  truncate pg_temp.planner_records_activation_keys;
  for r in select * from public.planner_records_split(s.data) loop
   insert into pg_temp.planner_records_activation_keys values(r->>'kind',r->>'scope',r->>'key');
   if not exists(select 1 from public.planner_record_current current_record join public.planner_record_versions version_record using(owner_id,kind,scope,key,revision)
     where current_record.owner_id=p_owner and current_record.kind=r->>'kind' and current_record.scope=r->>'scope' and current_record.key=r->>'key' and version_record.position=(r->>'position')::integer and version_record.data=r->'data') then
    perform public.planner_records_put(p_owner,s.revision,r);
   end if;
  end loop;
  for c in select * from public.planner_record_current p where p.owner_id=p_owner and not exists(select 1 from pg_temp.planner_records_activation_keys k where k.kind=p.kind and k.scope=p.scope and k.key=p.key) loop
   perform public.planner_records_put(p_owner,s.revision,jsonb_build_object('kind',c.kind,'scope',c.scope,'key',c.key,'position',0,'data',null,'deleted',true));
  end loop;
  perform public.planner_records_check(p_owner,old_schema);old_schema:=s.data->>'artworkSchema';
  insert into public.planner_record_snapshots values(p_owner,s.revision,s.operation_id,s.updated_at,s.updated_at);
 end loop;
 update public.planner_record_heads set revision=w.revision,operation_id=w.operation_id,updated_at=w.updated_at where owner_id=p_owner;
 return public.planner_records_metadata(p_owner);
end $$;

create function public.planner_records_stage(p_owner uuid,p_expected_revision bigint,p_operation_id uuid,p_batch_index integer,p_batch_count integer,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.planner_record_heads%rowtype; op public.planner_record_operations%rowtype; receipt public.planner_record_receipts%rowtype;
 digest bytea; n integer; existing bytea; r jsonb;
begin
 perform public.planner_records_lock(p_owner);
 if p_operation_id is null or p_expected_revision is null or p_expected_revision<0 or p_batch_count is null or p_batch_count not between 1 and 1024 or p_batch_index is null or p_batch_index<0 or p_batch_index>=p_batch_count or jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>256 then raise exception 'Invalid record batch' using errcode='22023'; end if;
 n:=octet_length(p_changes::text);
 if n>524288 and (jsonb_array_length(p_changes)<>1 or n>16781312) then raise exception 'Record batch too large' using errcode='22023'; end if;
 digest:=sha256(convert_to(p_changes::text,'UTF8'));
 select * into h from public.planner_record_heads where owner_id=p_owner;
 if not found then raise exception 'Activate record storage first' using errcode='55000'; end if;
 if h.operation_id=p_operation_id then
  select * into receipt from public.planner_record_receipts where owner_id=p_owner;
  if receipt.operation_id is distinct from p_operation_id or receipt.expected_revision<>p_expected_revision or receipt.batch_count<>p_batch_count or receipt.batch_hashes->>p_batch_index::text is distinct from encode(digest,'hex') then raise exception 'Operation ID reused' using errcode='22023'; end if;
  return jsonb_build_object('staged',true,'index',p_batch_index,'committed',true);
 end if;
 if h.revision<>p_expected_revision then raise exception 'Workspace changed' using errcode='40001'; end if;
 for r in select * from jsonb_array_elements(p_changes) loop perform public.planner_records_validate(r); end loop;
 if exists(select 1 from jsonb_array_elements(p_changes) change_value group by change_value->>'kind',change_value->>'scope',change_value->>'key' having count(*)>1) then raise exception 'Duplicate record change' using errcode='22023'; end if;
 select * into op from public.planner_record_operations where owner_id=p_owner and operation_id=p_operation_id;
 if found then
  if op.expected_revision<>p_expected_revision or op.batch_count<>p_batch_count then raise exception 'Operation ID reused' using errcode='22023'; end if;
 else
  delete from public.planner_record_operations where owner_id=p_owner and (created_at<now()-interval '1 day' or expected_revision<h.revision);
  if (select count(*) from public.planner_record_operations where owner_id=p_owner)>=4 then
   -- Staging is expendable; the browser retains immutable retry batches.
   -- Evict only an uncommitted operation, never the committed receipt.
   delete from public.planner_record_operations where owner_id=p_owner and operation_id=(select operation_id from public.planner_record_operations where owner_id=p_owner order by created_at,operation_id limit 1);
  end if;
  insert into public.planner_record_operations(owner_id,operation_id,expected_revision,batch_count) values(p_owner,p_operation_id,p_expected_revision,p_batch_count);
 end if;
 select request_hash into existing from public.planner_record_batches where owner_id=p_owner and operation_id=p_operation_id and batch_index=p_batch_index;
 if found then
  if existing<>digest then raise exception 'Batch ID reused' using errcode='22023'; end if;
  return jsonb_build_object('staged',true,'index',p_batch_index);
 end if;
 if exists(select 1 from public.planner_record_batches b cross join lateral jsonb_array_elements(b.changes) old cross join jsonb_array_elements(p_changes) fresh where b.owner_id=p_owner and b.operation_id=p_operation_id and old->>'kind'=fresh->>'kind' and old->>'scope'=fresh->>'scope' and old->>'key'=fresh->>'key') then raise exception 'Record appears in two batches' using errcode='22023'; end if;
 while (select coalesce(sum(staged_bytes),0) from public.planner_record_operations where owner_id=p_owner)+n>67108864 loop
  delete from public.planner_record_operations where owner_id=p_owner and operation_id=(select operation_id from public.planner_record_operations where owner_id=p_owner and operation_id<>p_operation_id order by created_at,operation_id limit 1);
  if not found then raise exception 'Staging quota exceeded' using errcode='54000'; end if;
 end loop;
 insert into public.planner_record_batches values(p_owner,p_operation_id,p_batch_index,p_changes,digest,n);
 update public.planner_record_operations set staged_bytes=staged_bytes+n where owner_id=p_owner and operation_id=p_operation_id;
 return jsonb_build_object('staged',true,'index',p_batch_index);
end $$;

create function public.planner_records_commit(p_owner uuid,p_expected_revision bigint,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.planner_record_heads%rowtype; op public.planner_record_operations%rowtype; receipt public.planner_record_receipts%rowtype; r jsonb; hashes jsonb; relationships boolean:=false;
begin
 perform public.planner_records_lock(p_owner);
 if p_operation_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid operation' using errcode='22023'; end if;
 select * into h from public.planner_record_heads where owner_id=p_owner for update;
 if not found then raise exception 'Activate record storage first' using errcode='55000'; end if;
 if h.operation_id=p_operation_id then
  select * into receipt from public.planner_record_receipts where owner_id=p_owner;
  if receipt.operation_id is distinct from p_operation_id or receipt.expected_revision<>p_expected_revision then raise exception 'Operation ID reused' using errcode='22023'; end if;
  return public.planner_records_metadata(p_owner);
 end if;
 if h.revision<>p_expected_revision then raise exception 'Workspace changed' using errcode='40001'; end if;
 select * into op from public.planner_record_operations where owner_id=p_owner and operation_id=p_operation_id;
 if not found or op.expected_revision<>p_expected_revision or (select count(*) from public.planner_record_batches where owner_id=p_owner and operation_id=p_operation_id)<>op.batch_count then raise exception 'Incomplete record operation' using errcode='22023'; end if;
 for r in select row from public.planner_record_batches b cross join lateral jsonb_array_elements(b.changes) row where b.owner_id=p_owner and b.operation_id=p_operation_id order by b.batch_index loop
  perform public.planner_records_put(p_owner,h.revision+1,r);
  relationships:=relationships or r->>'kind' in ('collection','log','workspace') or (r->>'kind'='setting' and r->>'key'='dn-profiles');
 end loop;
 -- Only identities touched by the operation need ordinary relationship checks.
 for r in select row from public.planner_record_batches b cross join lateral jsonb_array_elements(b.changes) row where b.owner_id=p_owner and b.operation_id=p_operation_id loop
  if r->>'deleted' is distinct from 'true' and (
   (r->>'kind'='inventory' and not exists(select 1 from public.planner_record_current where owner_id=p_owner and kind='collection' and key=r->>'scope')) or
   (r->>'kind' in ('craft','archive') and (not exists(select 1 from public.planner_record_current where owner_id=p_owner and kind='log') or exists(select 1 from public.planner_record_current where owner_id=p_owner and key=r->>'key' and kind=case r->>'kind' when 'craft' then 'archive' else 'craft' end)))
  ) then raise exception 'Incomplete workspace records' using errcode='22023'; end if;
  if r->>'deleted' is distinct from 'true' and r->>'kind' in ('collection','inventory','craft','archive') and
   exists(select 1 from public.planner_record_current c where c.owner_id=p_owner and c.kind=r->>'kind' and c.scope=r->>'scope' and c.position=(r->>'position')::integer and c.key<>r->>'key') then raise exception 'Duplicate cloud record order' using errcode='22023'; end if;
 end loop;
 perform public.planner_records_check(p_owner,h.artwork_schema,relationships);
 -- History retention starts when a revision is superseded, matching the
 -- legacy pre-update safety snapshot, even after a long idle period.
 update public.planner_record_snapshots set saved_at=now() where owner_id=p_owner and revision=h.revision;
 update public.planner_record_heads set revision=h.revision+1,operation_id=p_operation_id,updated_at=now() where owner_id=p_owner;
 insert into public.planner_record_snapshots values(p_owner,h.revision+1,p_operation_id,now(),now());
 select jsonb_object_agg(batch_index::text,encode(request_hash,'hex')) into hashes from public.planner_record_batches where owner_id=p_owner and operation_id=p_operation_id;
 insert into public.planner_record_receipts values(p_owner,p_operation_id,p_expected_revision,op.batch_count,hashes) on conflict(owner_id) do update set operation_id=excluded.operation_id,expected_revision=excluded.expected_revision,batch_count=excluded.batch_count,batch_hashes=excluded.batch_hashes;
 -- All other operations staged against the previous revision are now unable
 -- to commit. Retaining them would consume upload slots until the TTL.
 delete from public.planner_record_operations where owner_id=p_owner and expected_revision<=h.revision;
 return public.planner_records_metadata(p_owner);
end $$;

create function public.planner_records_history(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or auth.uid() is distinct from p_owner then raise exception 'Account changed' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('game_key','dominations','revision',s.revision,'operation_id',s.operation_id,'updated_at',s.updated_at,'saved_at',s.saved_at,'format',4) order by s.revision desc),'[]') into result
 from (select s.* from public.planner_record_snapshots s join public.planner_record_heads h using(owner_id) where s.owner_id=p_owner and s.revision<h.revision and s.saved_at>=now()-interval '30 days' order by s.revision desc limit 3) s;
 return result;
end $$;

create function public.planner_records_page(p_owner uuid,p_revision bigint default null,p_since bigint default null,p_after jsonb default null,p_limit integer default 128,p_max_bytes integer default 524288) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare h public.planner_record_heads%rowtype; s public.planner_record_snapshots%rowtype; target bigint; r record; value jsonb; result jsonb:='[]'; cursor_value jsonb:=null; used_bytes integer:=2; more boolean:=false; n integer:=0;
begin
 if auth.uid() is null or auth.uid() is distinct from p_owner then raise exception 'Account changed' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 256 or p_max_bytes is null or p_max_bytes not between 1024 and 524288 or (p_after is not null and (jsonb_typeof(p_after)<>'array' or jsonb_array_length(p_after)<>3 or exists(select 1 from jsonb_array_elements(p_after) e where jsonb_typeof(e)<>'string'))) then raise exception 'Invalid record cursor' using errcode='22023'; end if;
 select * into h from public.planner_record_heads where owner_id=p_owner;
 if not found or h.revision=0 then raise exception 'No record workspace' using errcode='55000'; end if;
 target:=coalesce(p_revision,h.revision);
 select * into s from public.planner_record_snapshots where owner_id=p_owner and revision=target;
 if not found or (target<>h.revision and (s.saved_at<now()-interval '30 days' or target not in (select revision from public.planner_record_snapshots where owner_id=p_owner order by revision desc limit 4))) or
    (p_since is not null and (p_since>target or not exists(select 1 from public.planner_record_snapshots where owner_id=p_owner and revision=p_since))) then raise exception 'Workspace snapshot expired' using errcode='40001'; end if;
 for r in with identities as (
  select distinct v.kind,v.scope,v.key from public.planner_record_versions v
  where v.owner_id=p_owner and v.revision<=target and (p_since is null or v.revision>p_since) and
   (p_after is null or (v.kind,v.scope,v.key)>((p_after->>0) collate "C",(p_after->>1) collate "C",(p_after->>2) collate "C"))
 ) select latest.* from identities i cross join lateral (
  select v.kind,v.scope,v.key,v.position,v.data,v.deleted,v.revision from public.planner_record_versions v
  where v.owner_id=p_owner and v.kind=i.kind and v.scope=i.scope and v.key=i.key and v.revision<=target order by v.revision desc limit 1
 ) latest where p_since is not null or not latest.deleted order by latest.kind,latest.scope,latest.key limit p_limit+1 loop
  value:=jsonb_build_object('kind',r.kind,'scope',r.scope,'key',r.key,'position',r.position,'data',r.data);
  if r.deleted then value:=value||'{"deleted":true}'::jsonb; end if;
  if n>=p_limit or (n>0 and used_bytes+octet_length(value::text)+2>p_max_bytes) then more:=true;exit; end if;
  if octet_length(value::text)>16781312 then raise exception 'Record exceeds transfer limit' using errcode='54000'; end if;
  result:=result||jsonb_build_array(value);used_bytes:=used_bytes+octet_length(value::text)+2;n:=n+1;
  cursor_value:=jsonb_build_array(r.kind,r.scope,r.key);
 end loop;
 return jsonb_build_object('head',jsonb_build_object('game_key','dominations','revision',target,'operation_id',s.operation_id,'updated_at',s.updated_at,'format',4),'records',result,'next',case when more then cursor_value else null end,'complete',not more);
end $$;

-- The complete protocol switch is one transaction, including all retained
-- snapshots. Old rows remain available to administrators for rollback.
create function public.planner_records_legacy_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.planner_records_lock(new.owner_id);
 if exists(select 1 from public.planner_record_heads where owner_id=new.owner_id) then raise exception 'Reload the planner to use record storage' using errcode='55000'; end if;
 return new;
end $$;
create trigger a_planner_workspace_protocol before insert or update on public.planner_workspaces for each row execute function public.planner_records_legacy_guard();
-- Preserve function OIDs: an already prepared legacy statement must execute
-- the fence too, including its idempotent early-return path.
do $fence$
declare signature text; owner_expression text; source text; guarded text; prefix text;
begin
 for signature,owner_expression in select * from (values
  ('public.planner_save_workspace(bigint,uuid,jsonb)','auth.uid()'),
  ('public.planner_save_workspace_v2(uuid,bigint,uuid,jsonb)','p_owner'),
  ('public.planner_save_workspace_v3(uuid,bigint,uuid,jsonb,jsonb)','p_owner')) functions(signature,owner_expression) loop
  source:=pg_get_functiondef(signature::regprocedure);
  prefix:=E'\nBEGIN\n PERFORM public.planner_records_lock('||owner_expression||E');\n IF EXISTS(SELECT 1 FROM public.planner_record_heads WHERE owner_id='||owner_expression||E') THEN RAISE EXCEPTION ''Reload the planner to use record storage'' USING ERRCODE=''55000''; END IF;\n';
  guarded:=regexp_replace(source,E'\\n[ \\t]*[bB][eE][gG][iI][nN][ \\t]*\\r?\\n',prefix);
  if guarded=source then raise exception 'Legacy writer fence could not be installed: %',signature; end if;
  execute guarded;
 end loop;
end $fence$;
alter policy own_workspace on public.planner_workspaces using(owner_id=(select auth.uid()) and not exists(select 1 from public.planner_record_heads h where h.owner_id=planner_workspaces.owner_id));
create or replace function public.planner_read_workspace() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('game_key',w.game_key,'revision',w.revision,'operation_id',w.operation_id,'data',w.data,'updated_at',w.updated_at) from public.planner_workspaces w where w.owner_id=auth.uid() and not exists(select 1 from public.planner_record_heads h where h.owner_id=w.owner_id);
$$;
alter function public.planner_export_account() rename to planner_export_before_records;
revoke all on function public.planner_export_before_records() from public,anon,authenticated;
create function public.planner_export_account() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 result:=public.planner_export_before_records();
 if exists(select 1 from public.planner_record_heads where owner_id=auth.uid()) then
  result:=result||jsonb_build_object('workspace',null,'workspace_history','[]'::jsonb,'workspace_records',public.planner_records_metadata(auth.uid()),'workspace_record_history',public.planner_records_history(auth.uid()));
 end if;
 return result;
end $$;

alter function public.planner_prune_expired_data() rename to planner_prune_before_records;
revoke all on function public.planner_prune_before_records() from public,anon,authenticated;
create function public.planner_prune_expired_data() returns void language plpgsql security definer set search_path='' as $$
declare h public.planner_record_heads%rowtype; owner_row record; floor_revision bigint;
begin
 for owner_row in select owner_id from public.planner_record_heads order by owner_id loop
  -- Coordinate retention with commits; pages use one statement snapshot.
  -- Take the same owner -> operation/record lock order as every writer.
  perform 1 from auth.users where id=owner_row.owner_id for update;
  select * into h from public.planner_record_heads where owner_id=owner_row.owner_id;
  if not found then continue; end if;
  delete from public.planner_record_operations where owner_id=h.owner_id and created_at<now()-interval '1 day';
  -- Conversion rollback copies have an explicit lifetime. Current normalized
  -- data and its three retained prior snapshots remain independently usable.
  if h.activated_at<now()-interval '30 days' then
   delete from public.planner_workspace_save_receipts where owner_id=h.owner_id;
   delete from public.planner_workspaces where owner_id=h.owner_id;
  end if;
  delete from public.planner_record_snapshots s where s.owner_id=h.owner_id and s.revision<>h.revision and (s.saved_at<now()-interval '30 days' or s.revision not in(select revision from public.planner_record_snapshots where owner_id=h.owner_id order by revision desc limit 4));
  select min(revision) into floor_revision from public.planner_record_snapshots where owner_id=h.owner_id;
  delete from public.planner_record_versions v where v.owner_id=h.owner_id and v.revision<floor_revision and exists(select 1 from public.planner_record_versions newer where newer.owner_id=v.owner_id and newer.kind=v.kind and newer.scope=v.scope and newer.key=v.key and newer.revision>v.revision and newer.revision<=floor_revision);
  delete from public.planner_record_versions v where v.owner_id=h.owner_id and v.deleted and v.revision<=floor_revision and not exists(select 1 from public.planner_record_current c where c.owner_id=v.owner_id and c.kind=v.kind and c.scope=v.scope and c.key=v.key);
 end loop;
 -- Legacy history rows must not be locked before the owner locks above.
 perform public.planner_prune_before_records();
end $$;

revoke all on function public.planner_records_lock(uuid),public.planner_records_validate(jsonb),public.planner_records_split(jsonb),public.planner_records_put(uuid,bigint,jsonb),public.planner_records_check(uuid,text,boolean),public.planner_records_legacy_guard() from public,anon,authenticated;
revoke all on function public.planner_records_activate(uuid,bigint),public.planner_records_metadata(uuid),public.planner_records_page(uuid,bigint,bigint,jsonb,integer,integer),public.planner_records_stage(uuid,bigint,uuid,integer,integer,jsonb),public.planner_records_commit(uuid,bigint,uuid),public.planner_records_history(uuid),public.planner_save_workspace(bigint,uuid,jsonb),public.planner_save_workspace_v3(uuid,bigint,uuid,jsonb,jsonb),public.planner_export_account(),public.planner_prune_expired_data() from public,anon;
grant execute on function public.planner_records_activate(uuid,bigint),public.planner_records_metadata(uuid),public.planner_records_page(uuid,bigint,bigint,jsonb,integer,integer),public.planner_records_stage(uuid,bigint,uuid,integer,integer,jsonb),public.planner_records_commit(uuid,bigint,uuid),public.planner_records_history(uuid),public.planner_save_workspace(bigint,uuid,jsonb),public.planner_save_workspace_v3(uuid,bigint,uuid,jsonb,jsonb),public.planner_export_account() to authenticated;
grant execute on function public.planner_prune_expired_data() to service_role;
notify pgrst,'reload schema';
commit;
