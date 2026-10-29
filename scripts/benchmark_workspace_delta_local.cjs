/* Synthetic data, new loopback-only native PostgreSQL cluster. No hosted access. */
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),vm=require('node:vm');
const {spawnSync,spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),bin=path.join(root,'data/temp/postgresql-tools/pgsql/bin');
const directory=fs.mkdtempSync(path.join(root,'data/temp/workspace-delta-benchmark-')),cluster=path.join(directory,'cluster'),log=path.join(directory,'postgres.log');
const passwordFile=path.join(directory,'password.txt'),password=crypto.randomBytes(32).toString('hex');fs.writeFileSync(passwordFile,password,{mode:0o600});
const app={window:{},TextEncoder};vm.createContext(app);for(const file of ['crafting-history','integration-core'])vm.runInContext(fs.readFileSync(path.join(root,'ui',file+'.js'),'utf8'),app);
const C=app.window.DNIntegrationCore,copy=v=>JSON.parse(JSON.stringify(v));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const row={name:'Aircraft Damage',known:true,value:11,hasPercent:true,level:1,levelSource:'observed',tier:3,tierSource:'colour',colour:'gold',base:11,max:20,rangeSource:'rules',assumed:false,inferred:false,conflict:false,tierConflict:false,outOfRange:false,nameSource:'ocr',valueSource:'ocr',unlocked:true,rerollEligible:true,rerollSource:'dice'};
const data=C.createWorkspace({'dn-profiles':JSON.stringify({activeId:'main',profiles:[{id:'main',name:'Main'}]})},[{id:'items',items:[]},{id:'collection:main',items:[]}],{version:2,items:Array.from({length:2930},(_,i)=>({id:'synthetic-'+i,firstSeen:'2026-10-30T00:00:00Z',revision:1,writer:'test-device',hall:'main',rows:Array.from({length:5},()=>({...row}))}))});
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'";
let env,started=false,finalReport;
function run(tool,args,input){const fd=tool==='pg_ctl'?fs.openSync(path.join(directory,'launcher.log'),'a'):null;try{const r=spawnSync(path.join(bin,tool+'.exe'),args,{env,input,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:32*1024*1024,...(fd!==null?{stdio:['ignore',fd,fd]}:{})});if(r.status!==0||r.error)throw Error(tool+' failed: '+String(r.stderr||r.error?.message||'see local log').split(password).join('[redacted]'));return r.stdout||'';}finally{if(fd!==null)fs.closeSync(fd);}}
const sql=text=>run('psql',['-X','-w','-A','-t','-v','ON_ERROR_STOP=1','-f','-'],text).trim();
const auth=(owner,text)=>`begin;set local role authenticated;set local request.jwt.claim.sub='${owner}';set local statement_timeout='30s';${text};commit;`;
function statement(version,args){return `with pgrst_source as (select public.planner_save_workspace_v${version}(p.p_owner,p.p_expected_revision,p.p_operation_id,p.p_data${version===3?',p.p_items_delta':''}) scalar from (select * from json_to_record(${literal(args)}::json) as args(p_owner uuid,p_expected_revision bigint,p_operation_id uuid,p_data jsonb${version===3?',p_items_delta jsonb':''}) limit 1) p) select octet_length(coalesce(json_agg(t.scalar)->0,'null')::text) from (select scalar from pgrst_source limit 1) t`;}
function profile(owner,statement){const lines=sql(auth(owner,`explain(analyze,buffers,wal,format json,timing off) ${statement}`)).split('\n');const start=lines.findIndex(l=>l.trim()==='['),end=lines.findLastIndex(l=>l.trim()===']');return JSON.parse(lines.slice(start,end+1).join('\n'))[0];}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
function asyncSql(text){return new Promise(resolve=>{const p=spawn(path.join(bin,'psql.exe'),['-X','-w','-A','-t','-v','ON_ERROR_STOP=1','-f','-'],{env,windowsHide:true});let output='',error='';p.stdout.on('data',c=>output+=c);p.stderr.on('data',c=>error+=c);p.on('error',e=>resolve({status:-1,error:e.message}));p.on('close',status=>resolve({status,output,error}));p.stdin.end(text);});}
(async()=>{
 const port=await freePort();env={...process.env,PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'planner_delta_test',PGDATABASE:'postgres',PGPASSWORD:password,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'10',PGOPTIONS:'-c timezone=UTC'};
 if(env.PGHOST!=='127.0.0.1'||!cluster.startsWith(path.join(root,'data/temp/workspace-delta-benchmark-')))throw Error('Local boundary failed');
 run('initdb',['-D',cluster,'-U',env.PGUSER,'--auth=scram-sha-256','--pwfile',passwordFile,'--encoding=UTF8','--locale=C']);
 started=true;run('pg_ctl',['-D',cluster,'-l',log,'-o',`-h 127.0.0.1 -p ${port} -c work_mem=2184kB -c track_io_timing=on -c shared_preload_libraries=pg_stat_statements`,'-w','start']);
 sql("create extension pg_stat_statements;create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;"+`insert into auth.users values('${A}'),('${B}');`);
 for(const name of ['202610180001_planner_backend.sql','202610230001_crafting_statistics_v2.sql','202610240007_shared_artwork.sql','202610250008_workspace_save_validation.sql','202610300001_workspace_delta_save.sql'])sql(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));
 for(const owner of [A,B])sql(auth(owner,`select octet_length(public.planner_save_workspace_v2('${owner}',0,'${crypto.randomUUID()}',${literal(data)}::jsonb)::text)`));
 const report={checkedAt:new Date().toISOString(),serverVersion:sql('show server_version'),workMem:sql('show work_mem'),fixtureBytes:Buffer.byteLength(JSON.stringify(data)),rounds:[]};
 let base=copy(data);
 for(let i=0;i<4;i++){
   const next=copy(base);if(i<3)next.craftingLog.items[1500].rows[0].value+=1;else next.settings['dn-p:main:dn-artifact-score-mode']='"potential"';
   const full={p_owner:A,p_expected_revision:i+1,p_operation_id:crypto.randomUUID(),p_data:next};
   const delta={p_owner:B,p_expected_revision:i+1,p_operation_id:crypto.randomUUID(),...C.workspaceSaveRequest(next,base)};
   const v2=profile(A,statement(2,full)),v3=profile(B,statement(3,delta));
   const summary=p=>({executionMs:p['Execution Time'],tempReadBlocks:p.Plan['Temp Read Blocks'],tempWrittenBlocks:p.Plan['Temp Written Blocks'],sharedReadBlocks:p.Plan['Shared Read Blocks'],walBytes:p.Plan['WAL Bytes']});
   report.rounds.push({change:i<3?'one-crafting-row':'settings-only',v2:{requestBytes:Buffer.byteLength(JSON.stringify(full)),...summary(v2)},v3:{requestBytes:Buffer.byteLength(JSON.stringify(delta)),...summary(v3)}});
   fs.writeFileSync(path.join(directory,`plans-${i}.json`),JSON.stringify({v2,v3},null,2));
   console.log(JSON.stringify({round:i+1,...report.rounds.at(-1)}));base=next;
 }
 const hashes=sql("select md5(data::text) from public.planner_workspaces order by owner_id").split(/\r?\n/);assert.equal(hashes[0],hashes[1],'both transports produce identical full workspaces');
 // True concurrent sessions: the second contender waits on the same row lock.
 const next=copy(base);next.craftingLog.items[0].rows[0].value+=1;
 const requests=[0,1].map(()=>({p_owner:B,p_expected_revision:5,p_operation_id:crypto.randomUUID(),...C.workspaceSaveRequest(next,base)}));
 const races=await Promise.all(requests.map(args=>asyncSql(`begin;set local statement_timeout='30s';select 1 from public.planner_workspaces where owner_id='${B}' for update;select pg_sleep(0.2);set local request.jwt.claim.sub='${B}';set local role authenticated;${statement(3,args)};commit;`)));
 assert.equal(races.filter(r=>r.status===0).length,1);assert(races.some(r=>r.error.includes('Workspace changed')));report.concurrentCASPassed=true;
 assert(report.rounds.every(r=>r.v3.requestBytes<r.v2.requestBytes/100));
 assert(report.rounds.every(r=>r.v3.tempWrittenBlocks===0&&r.v2.tempWrittenBlocks>0));
 report.acknowledgementBytes=JSON.parse(sql(`select json_build_object('full',octet_length(jsonb_build_object('game_key',game_key,'revision',revision,'operation_id',operation_id,'data',data,'updated_at',updated_at)::text),'metadata',octet_length(jsonb_build_object('game_key',game_key,'revision',revision,'operation_id',operation_id,'updated_at',updated_at)::text),'storedDocument',pg_column_size(data)) from public.planner_workspaces where owner_id='${B}'`));
 // Independently test a possible explanation for the attribution gap. This
 // intentionally failing SELECT runs only against synthetic, local data.
 const counters=()=>JSON.parse(sql("select json_build_object('databaseTempBytes',(select temp_bytes from pg_stat_database where datname=current_database()),'statementTempBytes',(select coalesce(sum(temp_blks_written),0)*8192 from pg_stat_statements))"));
 const before=counters();
 const failed=await asyncSql(`select 1 / (octet_length(p.p_data::text)-octet_length(p.p_data::text)) from json_to_record(${literal({p_data:data})}::json) p(p_data jsonb);`);
 assert(failed.status!==0&&failed.error.includes('division by zero'));
 const after=counters();report.failedSelectAttribution={databaseTempBytes:after.databaseTempBytes-before.databaseTempBytes,statementTempBytes:after.statementTempBytes-before.statementTempBytes};
 assert(report.failedSelectAttribution.databaseTempBytes>0);assert.equal(report.failedSelectAttribution.statementTempBytes,0);
 console.log(JSON.stringify({localFailedSelectAttribution:report.failedSelectAttribution}));
 report.clusterStoppedAfterRun=false;finalReport={...report,directory};
 console.log('Synthetic native benchmark and concurrent CAS passed. Report: data/temp/workspace-delta-local-benchmark.json');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>{try{if(started&&fs.existsSync(path.join(cluster,'postmaster.pid')))run('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);if(finalReport){finalReport.clusterStoppedAfterRun=true;fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(finalReport,null,2));fs.writeFileSync(path.join(root,'data/temp/workspace-delta-local-benchmark.json'),JSON.stringify(finalReport,null,2));}}finally{fs.unlinkSync(passwordFile);}});
