/* Real deployed deletion acceptance, restricted to one operator-created test
 * email/UUID with an email-only identity created within the last 24 hours.
 * Never reads a personal browser session. Tokens/passwords stay in memory.
 * --check verifies identity only; --execute seeds and deletes this test user.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {root,readValues,readAdmin,publicConfig,client}=require('./posthog_api.cjs');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const email='planner-delete-test-20261022@example.com';
const tables=['planner_workspaces','planner_workspace_history','planner_research_consent','planner_consent_events','planner_research_sessions','planner_research_outcomes'];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  const credentials=readValues(path.join(root,'data/temp/deletion-test-credentials.txt'));
  const id=credentials.TEST_USER_ID;
  if(credentials.TEST_USER_EMAIL!==email || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id || '') || !credentials.TEST_USER_PASSWORD)throw Error('Fill in the exact disposable test email, user UUID and password.');
  const config=publicConfig(),database=sourceEnvironment();
  const reportFile=path.join(root,'data/temp/live-account-deletion.json');
  setLog(path.join(root,'data/temp/live-account-deletion-database.log'));
  const report={status:'checking',syntheticUserId:id,checkedAt:new Date().toISOString(),checks:{}};
  const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
  const check=(name,condition)=>{if(!condition)throw Error(name);report.checks[name]=true;save();console.log('PASS: '+name);};
  const row=JSON.parse(query(database,`select coalesce((select json_build_object('email',email,'providers',raw_app_meta_data->'providers','confirmed',email_confirmed_at is not null,'created',created_at) from auth.users where id='${id}'),'null'::json)`));
  check('exact disposable identity verified',row?.email===email && row.confirmed && row.providers?.length===1 && row.providers[0]==='email' && Date.now()-Date.parse(row.created)<86400000 && Date.now()>=Date.parse(row.created)-60000);
  if(!process.argv.includes('--execute')){report.status='identity-verified';save();return;}
  const configOrigin=new URL(config.supabaseUrl);
  if(configOrigin.protocol!=='https:' || !configOrigin.hostname.endsWith('.supabase.co'))throw Error('Unexpected configured Auth host.');
  const otherAccounts=()=>query(database,`select md5(coalesce(string_agg(id::text,',' order by id),'')) from auth.users where id<>'${id}'`);
  const otherPlanner=()=>query(database,tables.map(table=>`select '${table}:'||count(*)||':'||md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from public.${table} t where owner_id<>'${id}';`).join('\n'));
  const baselineAccounts=otherAccounts(),baselinePlanner=otherPlanner();
  let accessToken=null,refreshToken=null;
  async function request(route,{method='GET',body,token=accessToken,origin='https://dominations-planner.ededed84.workers.dev'}={}){
    const response=await fetch(new URL(route,configOrigin),{method,headers:{apikey:config.supabasePublishableKey,Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
    let data;try{data=await response.json();}catch{}
    return {ok:response.ok,status:response.status,data};
  }
  async function rpc(name,body={}){const result=await request('/rest/v1/rpc/'+name,{method:'POST',body});if(!result.ok)throw Error('Disposable account RPC failed: '+name+' (HTTP '+result.status+').');return result.data;}
  try {
    const login=await request('/auth/v1/token?grant_type=password',{method:'POST',token:null,body:{email,password:credentials.TEST_USER_PASSWORD}});
    if(!login.ok || login.data?.user?.id!==id || login.data?.user?.email!==email || !login.data.access_token)throw Error('Disposable account sign-in failed or identity did not match.');
    accessToken=login.data.access_token;refreshToken=login.data.refresh_token;
    const identity=await request('/auth/v1/user');
    check('fresh authenticated test session verified',identity.ok && identity.data?.id===id && identity.data?.email===email);
    check('test account initially has no workspace',await rpc('planner_read_workspace')===null);
    const isolated=await request('/rest/v1/planner_workspaces?select=owner_id&owner_id=neq.'+id);
    check('real second authenticated user cannot read other accounts',isolated.ok && Array.isArray(isolated.data) && isolated.data.length===0);
    const workspace={kind:'dominations-cloud-workspace',version:1,game:'dominations',settings:{'dn-profiles':JSON.stringify({v:1,activeId:'main',profiles:[{id:'main',name:'Disposable deletion check'}]})},records:[{id:'items',items:[]},{id:'collection:main',items:[{id:'deletion-check-item',name:'Synthetic deletion check',type:'Weapon',hall:'main',rows:[{name:'Aircraft Damage',value:6}]}]}]};
    let saved=await rpc('planner_save_workspace',{p_expected_revision:0,p_operation_id:crypto.randomUUID(),p_data:workspace});
    check('test account can save its own workspace',saved?.revision===1);
    workspace.records[1].items[0].name='Synthetic deletion check revised';
    saved=await rpc('planner_save_workspace',{p_expected_revision:1,p_operation_id:crypto.randomUUID(),p_data:workspace});
    await rpc('planner_set_research_consent',{p_enabled:false,p_policy:'2026-10-18'});
    check('test history and consent records created',saved?.revision===2 && query(database,`select (select count(*) from public.planner_workspace_history where owner_id='${id}')>0 and (select count(*) from public.planner_research_consent where owner_id='${id}')=1 and (select count(*) from public.planner_consent_events where owner_id='${id}')>0`)==='t');
    const admin=readAdmin(),deletion=readAdmin(path.join(root,'data/temp/posthog-deletion.txt'));
    if(admin.host!==deletion.host || admin.project!==deletion.project || config.posthogHost!=='https://eu.i.posthog.com' || deletion.host!=='https://eu.posthog.com')throw Error('Analytics project or region binding failed.');
    const project=await client(admin).request('/api/projects/'+admin.project+'/');
    if(project.api_token!==config.posthogToken)throw Error('Analytics token/project binding failed.');
    const api=client(deletion),distinct='u:'+id,nonce=crypto.randomUUID();
    const lookup=()=>api.request(api.base+'persons/?distinct_id='+encodeURIComponent(distinct));
    const existing=await lookup();
    check('test analytics identity starts empty',Array.isArray(existing.results) && existing.results.length===0 && !existing.next);
    const capture=await fetch(config.posthogHost+'/i/v0/e/',{method:'POST',headers:{'Content-Type':'text/plain',Origin:'https://dominations-planner.ededed84.workers.dev'},redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({api_key:config.posthogToken,event:'feature_used',distinct_id:distinct,timestamp:new Date().toISOString(),properties:{distinct_id:distinct,feature:'deletion-check',environment:'test',app_build:'live-account-deletion-check',identity_kind:'account',$process_person_profile:true,$set:{dn_setup_check:'live-account-deletion-v1',dn_setup_nonce:nonce},$geoip_disable:true,$ip:null,$insert_id:crypto.randomUUID(),$session_id:crypto.randomUUID()}})});
    if(!capture.ok)throw Error('Synthetic account analytics capture failed.');
    let persons;let notice=Date.now()+20000;
    for(let attempt=0;attempt<40;attempt++) {
      persons=await lookup();if(persons.results?.length)break;
      if(Date.now()>=notice){console.log('Waiting for the disposable analytics identity to become available.');notice=Date.now()+20000;}
      await pause(3000);
    }
    check('synthetic account-linked analytics identity verified',persons?.results?.length===1 && !persons.next && persons.results[0].distinct_ids?.length===1 && persons.results[0].distinct_ids[0]===distinct && persons.results[0].properties?.dn_setup_check==='live-account-deletion-v1' && persons.results[0].properties?.dn_setup_nonce===nonce);
    // Recheck the exact target immediately before the only deletion request.
    const target=await request('/auth/v1/user');
    if(!target.ok || target.data?.id!==id || target.data?.email!==email)throw Error('Deletion target changed; nothing was deleted.');
    report.status='deletion-requesting';save();
    const removed=await request('/functions/v1/delete-account',{method:'POST',body:{confirmation:'DELETE'}});
    check('deployed function accepted authenticated account and analytics deletion',removed.ok && removed.data?.deleted===true && removed.data?.analyticsDeletionRequested===true);
    report.status='deletion-accepted';save();
    check('disposable Auth user was removed',query(database,`select count(*) from auth.users where id='${id}'`)==='0');
    check('all disposable planner data cascaded away',query(database,tables.map(table=>`select count(*) from public.${table} where owner_id='${id}';`).join('\n')).split(/\r?\n/).every(value=>value==='0'));
    const oldSession=await request('/auth/v1/user');
    check('deleted account is rejected by Auth user verification',!oldSession.ok && [401,403].includes(oldSession.status));
    if(refreshToken){const refresh=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',token:null,body:{refresh_token:refreshToken}});check('deleted account cannot refresh its session',!refresh.ok && [400,401,403].includes(refresh.status));}
    const remaining=await lookup();
    check('synthetic analytics person no longer appears',Array.isArray(remaining.results) && remaining.results.length===0 && !remaining.next);
    check('other Auth accounts remain unchanged',otherAccounts()===baselineAccounts);
    check('other planner workspaces and records remain unchanged',otherPlanner()===baselinePlanner);
    report.status='passed';report.providerEventDeletionIsAsynchronous=true;report.discordLoginTestedByThisCheck=false;save();
    console.log('Live disposable-account deletion passed. Provider event erasure remains asynchronous.');
  } catch(error){report.failure=error.message;report.status=report.status==='deletion-accepted'?'post-deletion-verification-failed':'failed';save();throw error;}
  finally{accessToken=null;refreshToken=null;}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
