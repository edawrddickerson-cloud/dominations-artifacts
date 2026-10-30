/* Compare original, JSON-path and memory-reduced workspace validators.
 * This exercises actual PostgreSQL JSON semantics and the unchanged privacy policy. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('../data/temp/backend-tests/node_modules/@electric-sql/pglite');
const db=new PGlite(),approved=JSON.parse(fs.readFileSync('ui/data/artwork_catalog.json','utf8')).entries[0].id;
const banned=['image','artwork','artworkMatch','artworkDescriptor','artworkFingerprint','artworkEmbedding','screenshot','screenshots','frame','frames','canvas','raw','rawType','observations','access_token','refresh_token','authorization'];
const cases=[],add=(name,data,rejected=false)=>cases.push({name,data,rejected});
add('empty',{});add('scalars',{a:null,b:false,c:1,d:'ordinary text'});add('empty arrays',{a:[[],{},null,false,3]});
for(const key of banned)for(const value of [null,false,[],{},'private']){
 add('forbidden '+key+' '+JSON.stringify(value),{['quoted.\"key / ??']:[{['123']:[{[key]:value}]}]},true);
}
for(const value of [null,approved])add('approved nullable '+JSON.stringify(value),{artworkSchema:1,deep:[[[{artworkId:value}]]]});
for(const value of [true,false,0,1,{},[],[approved],[null],{nested:approved},'art-0000000000000000'])add('invalid reference '+JSON.stringify(value),{artworkSchema:1,a:[{artworkId:value}]},true);
add('unversioned reference',{artworkId:approved},true);
for(const value of [null,'1',0,2,[],{}])add('invalid schema '+JSON.stringify(value),{artworkSchema:value},true);
for(const text of ['data:','DATA:','DaTa:image/png;base64,AAA','blob:','BlOb:123'])add('embedded '+text,{['unicode\u{1f512}']:['plain',[{v:text}]]},true);
for(const text of ['https://example.invalid/photo','some data:text',' data:text','database','blob',''])add('ordinary '+text,{v:text});
add('case sensitive key names',{IMAGE:null,Artwork:null,'im?ge':null,'image\\u0000':null});
add('escaped forbidden key',JSON.parse('{"nested":{"\\u0069mage":null}}'),true);
add('Unicode and numeric path containers',{'\u00e9':{'0123':{'\u{1f512}':{'artworkId':approved}}},artworkSchema:1});
let deep={image:null};for(let i=0;i<40;i++)deep=[deep];add('deep arrays',{deep},true);
add('large valid workspace',{artworkSchema:1,records:Array.from({length:6000},(_,i)=>({id:'record-'+i,artworkId:i%100===0?approved:null,values:Array.from({length:15},(_,n)=>({name:'perk '+n,value:n,valid:true}))}))});
async function classify(){const results=[];for(const test of cases){await db.exec('delete from validation_probe');try{await db.query('insert into validation_probe(data) values($1)',[test.data]);results.push(null);}catch(error){results.push(error.code);} }return results;}
async function lifecycle(label){
 await db.exec('delete from validation_probe');await db.query('insert into validation_probe values($1)',[{artworkSchema:1}]);
 await assert.rejects(()=>db.query('update validation_probe set data=$1',[{}]),error=>error.code==='22023',label+' cannot downgrade schema adoption');
 const data={artworkSchema:1,deep:[{artworkId:approved},{artworkId:null}]};
 await db.exec('delete from validation_probe');await db.query('insert into validation_probe values($1)',[data]);
 await db.query('delete from public.planner_artwork_catalog where id=$1',[approved]);
 await assert.rejects(()=>db.query('update validation_probe set data=$1',[data]),error=>error.code==='22023',label+' rechecks unchanged references against the current catalog');
 assert.deepEqual((await db.query('select data from validation_probe')).rows[0].data,data,label+' rejects without changing the document');
 await db.query('insert into public.planner_artwork_catalog values($1)',[approved]);
 await db.query('update validation_probe set data=$1',[data]);
}

(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
 await db.exec(fs.readFileSync('supabase/migrations/202610180001_planner_backend.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/202610240007_shared_artwork.sql','utf8'));
 await db.exec('create temp table validation_probe(data jsonb);create trigger validation_probe_trigger before insert or update on validation_probe for each row execute function public.planner_validate_artwork_workspace();');
 const original=await classify();await lifecycle('original');
 await db.exec(fs.readFileSync('supabase/migrations/202610250008_workspace_save_validation.sql','utf8'));
 const optimized=await classify();await lifecycle('JSON-path');
 await db.exec(fs.readFileSync('supabase/migrations/202610300001_workspace_delta_save.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/202610300002_workspace_save_memory.sql','utf8'));
 const memoryReduced=await classify();await lifecycle('memory-reduced');
 for(const [name,results] of [['original',original],['JSON-path',optimized],['memory-reduced',memoryReduced]])for(let i=0;i<cases.length;i++){
  assert.equal(results[i],original[i],name+': '+cases[i].name+' differs from original');
  assert.equal(results[i],cases[i].rejected?'22023':null,name+': '+cases[i].name+' violates policy');
 }
 console.log('Original/JSON-path/memory-reduced PostgreSQL validation parity passed '+cases.length+' cases each, including schema adoption, catalog invalidation, large histories and nested privacy/reference attacks.');
 await db.close();
})().catch(async error=>{console.error(error);await db.close();process.exitCode=1;});
