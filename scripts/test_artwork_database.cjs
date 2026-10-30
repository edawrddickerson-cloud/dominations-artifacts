const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require('../data/temp/backend-tests/node_modules/@electric-sql/pglite');
const catalog=JSON.parse(fs.readFileSync('ui/data/artwork_catalog.json','utf8')),db=new PGlite();
const A=crypto.randomUUID(),B=crypto.randomUUID(),id=catalog.entries[0].id;
const workspace=()=>({kind:'dominations-cloud-workspace',version:1,game:'dominations',artworkSchema:1,settings:{},records:[{id:'collection:main',items:[{id:'item-a',artworkId:id}]}]});
async function user(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);}
async function save(data,rev=0){return (await db.query('select public.planner_save_workspace($1,$2,$3) result',[rev,crypto.randomUUID(),data])).rows[0].result;}
async function denied(fn,code='22023'){await assert.rejects(fn,e=>e.code===code);}
(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;");
 await db.query('insert into auth.users values($1),($2)',[A,B]);
 await db.exec(fs.readFileSync('supabase/migrations/202610180001_planner_backend.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/202610240007_shared_artwork.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/202610250008_workspace_save_validation.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/202610300001_workspace_delta_save.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/202610300002_workspace_save_memory.sql','utf8'));
 await user(null,'anon');assert.equal((await db.query('select count(*)::int n from public.planner_artwork_catalog')).rows[0].n,catalog.entries.length);
 await denied(()=>save(workspace()),'42501');
 await user(A);const w=workspace();assert.equal((await save(w)).revision,1);
 for(const bad of ['https://evil.invalid/image.jpg','data:image/jpeg;base64,AAAA','art-0000000000000000',{},3]){const d=workspace();d.records[0].items[0].artworkId=bad;await denied(()=>save(d,1));}
 for(const key of ['image','artworkDescriptor','artworkFingerprint','artworkEmbedding']){const d=workspace();d.records[0].items[0].revisions=[{[key]:'private'}];await denied(()=>save(d,1));}
 const embedded=workspace();embedded.records[0].items[0].unexpected='data:image/jpeg;base64,AAAA';await denied(()=>save(embedded,1));
 const old=workspace();delete old.artworkSchema;delete old.records[0].items[0].artworkId;await denied(()=>save(old,1));
 const nullable=workspace();nullable.records[0].items[0].artworkId=null;assert.equal((await save(nullable,1)).revision,2);
 await denied(()=>db.query('insert into public.planner_artwork_catalog values($1)',['art-0000000000000000']),'42501');
 await user(B);assert.equal((await db.query('select count(*)::int n from public.planner_workspaces')).rows[0].n,0);
 const legacy=workspace();delete legacy.artworkSchema;delete legacy.records[0].items[0].artworkId;assert.equal((await save(legacy)).revision,1,'legacy workspaces remain supported before adopting artwork schema');
 // Even an unchanged reference must fail when the catalog entry is removed.
 await user(A);const referenced=workspace(),referencedSave=await save(referenced,2);
 const before=(await db.query('select data,revision,operation_id from public.planner_workspaces')).rows;
 const historyBefore=(await db.query('select revision,data from public.planner_workspace_history order by revision')).rows;
 await db.exec('reset role');await db.query('delete from public.planner_artwork_catalog where id=$1',[id]);
 await user(A);await denied(()=>save(referenced,referencedSave.revision));
 assert.deepEqual((await db.query('select data,revision,operation_id from public.planner_workspaces')).rows,before);
 assert.deepEqual((await db.query('select revision,data from public.planner_workspace_history order by revision')).rows,historyBefore,'failed validation rolls back its complete history insert');
 await db.exec('reset role');await db.query('insert into public.planner_artwork_catalog values($1)',[id]);
 await user(A);
 for(const value of [true,false,[],[id],{nested:id}]){const bad=workspace();bad.extra={deep:[{artworkId:value}]};await denied(()=>save(bad,referencedSave.revision));}
 const nested=workspace();nested.extra={deep:[{artworkId:null},{artworkId:id}]};await save(nested,referencedSave.revision);
 await db.close();console.log('Approved IDs, nullable/nested references, catalog invalidation, rejection rollback, nested pixel rejection, old-client guard, anonymous denial and owner isolation passed.');
})().catch(async e=>{console.error(e);await db.close();process.exitCode=1;});
