/* Live verification of the deletion handler using one synthetic PostHog person.
 * Supabase Auth is stubbed: no real account can be deleted by this script.
 * The narrow key is used only for the selected project's synthetic person.
 * Pending test IDs are retained without credentials so retries can clean up. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {root,readAdmin,publicConfig,client}=require('./posthog_api.cjs');
const {verifyProject}=require('./setup_posthog.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  const config=publicConfig(),admin=readAdmin(),deletion=readAdmin(path.join(root,'data/temp/posthog-deletion.txt'));
  if(admin.host!==deletion.host || admin.project!==deletion.project || admin.key===deletion.key)throw Error('Use a separate deletion key for the same PostHog project and region.');
  await verifyProject(client(admin),config);
  const reportFile=path.join(root,'data/temp/posthog-deletion-check.json');let previous;
  try{previous=JSON.parse(fs.readFileSync(reportFile,'utf8'));}catch{}
  const id=previous?.status!=='passed' && previous?.project===admin.project && previous?.host===admin.host && /^[0-9a-f-]{36}$/.test(previous?.syntheticUserId || '')?previous.syntheticUserId:crypto.randomUUID();
  const nonce=id===previous?.syntheticUserId && /^[0-9a-f-]{36}$/.test(previous?.syntheticNonce || '')?previous.syntheticNonce:crypto.randomUUID();
  const distinct='u:'+id,api=client(deletion),lookup=api.base+'persons/?distinct_id='+encodeURIComponent(distinct);
  const report={status:'running',project:admin.project,host:admin.host,syntheticUserId:id,syntheticNonce:nonce,realSupabaseUsersDeleted:0,checkedAt:new Date().toISOString()};
  const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));save();
  async function persons(){
    const result=await api.request(lookup);
    if(!Array.isArray(result.results) || result.next || result.results.some(person=>person.distinct_ids?.length!==1 || person.distinct_ids[0]!==distinct || person.properties?.dn_setup_check!=='posthog-deletion-v1' || person.properties?.dn_setup_nonce!==nonce))throw Error('The synthetic person lookup could not be verified. No deletion was attempted.');
    return result.results;
  }
  try{
    let found=await persons();report.personReadAllowed=true;save();
    if(!found.length){
      const response=await fetch(config.posthogHost+'/i/v0/e/',{method:'POST',redirect:'error',headers:{'Content-Type':'text/plain',Origin:'http://127.0.0.1:8765'},signal:AbortSignal.timeout(10000),body:JSON.stringify({api_key:config.posthogToken,event:'feature_used',distinct_id:distinct,timestamp:new Date().toISOString(),properties:{distinct_id:distinct,feature:'deletion-check',environment:'test',app_build:'posthog-deletion-check',identity_kind:'account',$process_person_profile:true,$set:{dn_setup_check:'posthog-deletion-v1',dn_setup_nonce:nonce},$geoip_disable:true,$ip:null,$session_id:crypto.randomUUID(),$insert_id:crypto.randomUUID()}})});
      if(!response.ok)throw Error('PostHog did not accept the synthetic deletion-check event.');
      const deadline=Date.now()+120000;let nextNotice=Date.now()+20000;
      while(Date.now()<deadline){found=await persons();if(found.length)break;if(Date.now()>=nextNotice){console.log('Waiting for the synthetic PostHog person to become available.');nextNotice=Date.now()+20000;}await delay(3000);}
      if(!found.length)throw Error('The synthetic event was accepted but its person was not yet available. Retry this check later.');
    }
    const permitted=new Set(found.map(person=>String(person.id)));
    const {createHandler}=await import('../supabase/functions/delete-account/handler.mjs');
    let simulatedAccountDeletes=0;
    const settings={APP_ORIGINS:'http://127.0.0.1:8765',SUPABASE_URL:config.supabaseUrl,APP_SUPABASE_PUBLISHABLE_KEY:config.supabasePublishableKey,APP_SUPABASE_SECRET_KEY:'synthetic-admin-never-sent',APP_ANALYTICS_ENABLED:'true',POSTHOG_PROJECT_ID:deletion.project,POSTHOG_PERSONAL_API_KEY:deletion.key,POSTHOG_API_HOST:deletion.host};
    const handler=createHandler({env:{get:key=>settings[key]},createClient(_url,key){return key==='synthetic-admin-never-sent'?{auth:{admin:{async deleteUser(userId){if(userId!==id)throw Error('Unexpected test account');simulatedAccountDeletes++;return {error:null};}}}}:{auth:{async getUser(token){return {data:{user:token==='synthetic-verified-token'?{id,last_sign_in_at:new Date().toISOString()}:null},error:null};}}};},
      async fetchImpl(url,options){
        const target=new URL(url);
        const read=target.origin===deletion.host && target.pathname===api.base+'persons/' && target.searchParams.get('distinct_id')===distinct && !options.method;
        const remove=target.origin===deletion.host && options.method==='DELETE' && [...permitted].some(personId=>target.pathname===api.base+'persons/'+encodeURIComponent(personId)+'/');
        if(!read && !remove)throw Error('The synthetic deletion guard blocked an unexpected request.');
        return fetch(target,{...options,redirect:'error'});
      }});
    const result=await handler(new Request('http://127.0.0.1:8765/functions/v1/delete-account',{method:'POST',headers:{Origin:'http://127.0.0.1:8765',Authorization:'Bearer synthetic-verified-token','Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE'})}));
    const body=await result.json();
    if(!result.ok || !body.deleted || !body.analyticsDeletionRequested || simulatedAccountDeletes!==1)throw Error('PostHog deletion was not confirmed by the account-deletion handler (HTTP '+result.status+'). Check Person Read/Write permissions.');
    Object.assign(report,{status:'passed',personDeletionAccepted:true,accountDeletionHandlerPassed:true,eventDeletionRequested:true,providerDeletionIsAsynchronous:true});save();
    console.log(JSON.stringify(report));
  }catch(error){report.status='failed';save();throw error;}
}
main().catch(error=>{console.error(/^(PostHog|Use |Add |The synthetic)/.test(error.message)?error.message:'PostHog deletion check could not complete. No credentials or response bodies were printed.');process.exitCode=1;});
