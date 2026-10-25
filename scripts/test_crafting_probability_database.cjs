const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {PGlite}=require('../data/temp/backend-tests/node_modules/@electric-sql/pglite');
const db=new PGlite();
(async()=>{
 await db.exec(`create role anon;create role authenticated;create table planner_crafting_consent(owner_id text,enabled boolean);create table planner_crafting_evidence(owner_id text,id text,deleted boolean,observed_at timestamptz,data jsonb);create table planner_crafting_rules(hall text,category text,perk text,starts numeric[]);create table planner_crafting_report_clock(singleton boolean,updated_at timestamptz);insert into planner_crafting_report_clock values(true,now());insert into planner_crafting_rules values('main','weapon','Heavy Infantry Damage',array[1,6,11]),('main','weapon','Bomber Damage',array[1,6,11]);insert into planner_crafting_consent values('one',true),('two',true),('off',false);revoke all on planner_crafting_evidence from public,anon,authenticated;`);
 await db.exec(fs.readFileSync('supabase/migrations/202610250006_crafting_probability_model.sql','utf8'));
 const app={window:{}};vm.createContext(app);for(const f of ['data/artifact_stat_context','crafted-log-stats','crafting-community','crafting-probability'])vm.runInContext(fs.readFileSync('ui/'+f+'.js','utf8'),app);
 const records=[];for(let n=0;n<42;n++)records.push({id:'item'+n,hall:'main',type:'Weapon',firstSeen:n<21?'2026-10-18T21:00:00Z':'2026-10-21T21:00:00Z',rows:[1,6,11,1,6].map((value,i)=>({name:i%2?'Bomber Damage':'Heavy Infantry Damage',value,known:true,hasPercent:true}))});
 const C=app.window.DNCraftingCommunity,index=C.rules();
 for(const item of records){const e=C.encode(item,index);await db.query('insert into planner_crafting_evidence values($1,$2,false,$3,$4)',[item.id==='item0'?'two':'one',item.id,e.observed_at,e]);}
 const extra=C.encode(records[0],index);await db.query("insert into planner_crafting_evidence values('off','off',false,$1,$2),('one','deleted',true,$1,$2),('one','expired',false,'2020-01-01',$2),('one','future',false,now()+interval '5 days',$2)",[extra.observed_at,extra]);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from planner_crafting_evidence'));
 const call=async(hall='main',category='weapon')=>(await db.query('select planner_crafting_probability_model($1,$2) result',[hall,category])).rows[0].result;
 const model=await call(),personal=JSON.parse(JSON.stringify(app.window.DNCraftingProbability.model(records,'main','Weapon')));delete model.updatedAt;assert.deepEqual(model,personal);
 assert.equal(model.artifacts,42);assert.equal(model.profiles.event.artifacts,21);assert.equal(model.profiles.normal.artifacts,21);assert(!JSON.stringify(model).includes('item0'));assert(!JSON.stringify(model).includes('owner_id'));
 assert.equal((await call('war','weapon')).artifacts,0);assert.equal((await call('war','weapon')).profiles.normal.artifacts,0);
 await assert.rejects(()=>call('main','equipment'));await assert.rejects(()=>call(null,'weapon'));
 await db.exec('reset role');await db.exec("update planner_crafting_consent set enabled=false where owner_id='one'");await db.exec('set role anon');assert.equal((await call()).artifacts,1);
 console.log('Probability model database: personal parity, owner-separated counts, exclusions, withdrawal and anonymous aggregate access passed.');
 await db.close();
})().catch(async error=>{console.error(error);await db.close();process.exitCode=1;});
