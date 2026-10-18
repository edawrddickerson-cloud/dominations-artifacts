/* Authority: Approved PostHog integration and standard provider dashboards.
 * Ownership: Local-only provisioning; never imported by the application.
 * Invariants: Check project/token/region and every query before mutation. Only
 * tagged planner resources are updated. No raw API responses or secrets logged. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {root,readAdmin,publicConfig,client}=require('./posthog_api.cjs');
const {dashboards}=require('./posthog_dashboards.cjs');
const managed='dominations-managed-v1';
function tag(type,key){return managed+':'+type+':'+key;}
function match(rows,marker){const matches=rows.filter(row=>!row.deleted && row.tags?.includes(marker));if(matches.length>1)throw Error('Duplicate managed PostHog resource: '+marker+'. Resolve duplicates before applying.');return matches[0];}
function source(insight){return insight.query.source || insight.query;}
async function verifyProject(api,config){
  const project=await api.request(api.base);
  if(project.api_token!==config.posthogToken)throw Error('PostHog project ID does not match the configured project token. Nothing was changed.');
  return project;
}
async function audit(api){
  const [savedDashboards,savedInsights]=await Promise.all([api.list('dashboards'),api.list('insights')]);
  const links=[];let count=0;
  for(const dashboard of dashboards){
    const saved=match(savedDashboards,tag('dashboard',dashboard.key));
    if(!saved || saved.is_shared===true)throw Error('PostHog dashboard audit failed for '+dashboard.key+'.');
    for(const insight of dashboard.insights){
      const row=match(savedInsights,tag('insight',insight.key)),query=row?.query?.source || row?.query;
      const production=query?.kind==='HogQLQuery'?query.query.includes("properties.environment = 'production'"):Array.isArray(query?.properties) && query.properties.some(p=>p.key==='environment' && p.value?.includes('production'));
      if(!row?.dashboards?.includes(saved.id) || !production)throw Error('PostHog saved insight audit failed for '+insight.key+'.');
      count++;
    }
    links.push({name:saved.name,url:api.host+'/project/'+api.project+'/dashboard/'+saved.id});
  }
  return {savedResourcesVerified:true,insights:count,dashboards:links};
}
async function provision(api,{project,apply=false,verifyQueries=true}={}){
  if(verifyQueries){
    for(const dashboard of dashboards)for(const insight of dashboard.insights){
      try{await api.request(api.base+'query/',{method:'POST',body:{query:source(insight),refresh:'blocking',async:false}});}
      catch{throw Error('PostHog could not validate insight '+insight.key+'. Check Query permissions and its schema before applying.');}
    }
  }
  const [existingDashboards,existingInsights]=await Promise.all([api.list('dashboards'),api.list('insights')]);
  // Detect ambiguous existing resources before changing project settings.
  for(const dashboard of dashboards){match(existingDashboards,tag('dashboard',dashboard.key));for(const insight of dashboard.insights)match(existingInsights,tag('insight',insight.key));}
  if(!apply)return {queriesValidated:verifyQueries,plannedDashboards:dashboards.length,plannedInsights:dashboards.reduce((n,d)=>n+d.insights.length,0)};
  if(!project.anonymize_ips || project.autocapture_opt_out!==true){
    const updated=await api.request(api.base,{method:'PATCH',body:{anonymize_ips:true,autocapture_opt_out:true}});
    if(updated.anonymize_ips!==true || updated.autocapture_opt_out!==true)throw Error('PostHog IP/autocapture settings were not confirmed. Sharing remains off.');
  }
  const links=[];
  for(const dashboard of dashboards){
    let saved=match(existingDashboards,tag('dashboard',dashboard.key));
    const body={name:dashboard.name,description:dashboard.description,tags:[...new Set([...(saved?.tags || []),managed,tag('dashboard',dashboard.key)])]};
    saved=await api.request(api.base+'dashboards/'+(saved?saved.id+'/':''),{method:saved?'PATCH':'POST',body});
    if(!Number.isInteger(saved.id) || saved.is_shared===true)throw Error('Dashboard response was invalid or publicly shared; review it before rollout.');
    for(const insight of dashboard.insights){
      const previous=match(existingInsights,tag('insight',insight.key));
      const data={name:insight.name,description:insight.description || dashboard.description,query:insight.query,saved:true,
        tags:[...new Set([...(previous?.tags || []),managed,tag('insight',insight.key)])],dashboards:[...new Set([...(previous?.dashboards || []),saved.id])]};
      const created=await api.request(api.base+'insights/'+(previous?previous.id+'/':''),{method:previous?'PATCH':'POST',body:data});
      if(!Number.isInteger(created.id) || !created.dashboards?.includes(saved.id))throw Error('PostHog did not confirm the saved insight/dashboard link. Rerun after reviewing API scopes.');
    }
    links.push({name:dashboard.name,url:api.host+'/project/'+api.project+'/dashboard/'+saved.id});
  }
  return {queriesValidated:verifyQueries,dashboardsCreatedOrUpdated:links,insights:dashboards.reduce((n,d)=>n+d.insights.length,0),ipDiscardEnabled:true,autocaptureDisabled:true};
}
async function smoke(config,api){
  if(!/^phc_[A-Za-z0-9_-]+$/.test(config.posthogToken || ''))throw Error('Configure the browser-safe PostHog project token first.');
  const expectedHost=config.posthogHost==='https://eu.i.posthog.com'?'https://eu.posthog.com':config.posthogHost==='https://us.i.posthog.com'?'https://us.posthog.com':null;
  if(!expectedHost || api && api.host!==expectedHost)throw Error('PostHog ingestion and management regions do not match.');
  const memory=new Map(),listeners={},intervals=[],pending=[],sent=[],receipts=[];
  const context={window:{DNServiceConfig:{...config,privacyReady:true,privacyContact:'local-synthetic-check',environment:'test',build:'posthog-setup-check'},addEventListener:(event,fn)=>listeners[event]=fn},
    localStorage:{get length(){return memory.size;},key:index=>[...memory.keys()][index],getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)},
    document:{hidden:false,addEventListener(){}},location:{pathname:'/config.html',origin:'http://127.0.0.1:8765'},navigator:{onLine:true,userAgent:'SyntheticSetupCheck'},innerWidth:1440,
    crypto:crypto.webcrypto,Date,TextEncoder,URL,AbortController,Error,setTimeout,clearTimeout,setInterval:fn=>intervals.push(fn),
    fetch(url,options){const payload=JSON.parse(options.body);sent.push({id:payload.properties.$insert_id,event:payload.event});const request=fetch(url,{...options,headers:{...options.headers,Origin:'http://127.0.0.1:8765'},redirect:'error'}).then(response=>{const cors=response.headers.get('Access-Control-Allow-Origin');receipts.push({httpStatus:response.status,corsAllowed:cors==='*' || cors==='http://127.0.0.1:8765'});if(!response.ok)throw Error('PostHog ingestion rejected the test request.');return true;});pending.push(request);return request;}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'ui/integration-core.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'ui/telemetry.js'),'utf8'),context);
  // Explicit operator-requested synthetic check; no personal browser/account data.
  context.window.DNConsent.set({analytics:true});context.window.DNTelemetry.event('feature_used',{feature:'setup-check'},true);
  await new Promise(resolve=>setTimeout(resolve,100));
  const settled=await Promise.allSettled(pending);context.window.DNConsent.set({});
  if(sent.length!==2 || settled.some(result=>result.status!=='fulfilled'))throw Error('The real telemetry transport did not receive two successful test receipts: '+JSON.stringify({events:sent.length,receipts})+'.');
  if(receipts.some(receipt=>!receipt.corsAllowed))throw Error('PostHog did not confirm browser access from the local planner origin.');
  let ingested=false;
  if(api){
    const deadline=Date.now()+120000;let nextNotice=Date.now()+20000;
    while(Date.now()<deadline){
      const ids=sent.map(entry=>"'"+entry.id+"'").join(',');
      const result=await api.request(api.base+'query/',{method:'POST',body:{query:{kind:'HogQLQuery',query:"SELECT count() FROM events WHERE timestamp > now() - INTERVAL 1 HOUR AND properties.environment = 'test' AND properties.app_build = 'posthog-setup-check' AND properties.$insert_id IN ("+ids+")"},refresh:'force_blocking',async:false}});
      if(Number(result.results?.[0]?.[0])===2){ingested=true;break;}
      if(Date.now()>=nextNotice){console.log('PostHog accepted the synthetic events; waiting for them to become queryable.');nextNotice=Date.now()+20000;}
      await new Promise(resolve=>setTimeout(resolve,3000));
    }
    if(!ingested)throw Error('PostHog accepted the synthetic requests but ingestion was not yet queryable.');
  }
  return {syntheticEventsAccepted:2,realUserDataSent:false,localOriginAllowed:true,ingestionVerified:ingested};
}
async function main(){
  const flags=new Set(process.argv.slice(2)),report=path.join(root,'data/temp/posthog-setup.json');
  if(flags.has('--plan')){fs.writeFileSync(path.join(root,'data/temp/posthog-dashboards.json'),JSON.stringify(dashboards,null,2));console.log(JSON.stringify({plannedDashboards:dashboards.length,plannedInsights:dashboards.reduce((n,d)=>n+d.insights.length,0)}));return;}
  const config=publicConfig(),admin=readAdmin(),api=Object.assign(client(admin),{host:admin.host,project:admin.project});
  const project=await verifyProject(api,config);
  if((admin.host.startsWith('https://eu.')?'https://eu.i.posthog.com':'https://us.i.posthog.com')!==config.posthogHost)throw Error('The configured ingestion and management regions do not match.');
  const result={status:'running',projectVerified:true,region:admin.host.startsWith('https://eu.')?'EU':'US',ipDiscardEnabled:project.anonymize_ips===true,autocaptureDisabled:project.autocapture_opt_out===true,optionalSharingAvailable:config.privacyReady===true,checkedAt:new Date().toISOString()};
  const save=()=>fs.writeFileSync(report,JSON.stringify(result,null,2));save();
  try{
    if(flags.has('--apply') || flags.has('--validate')){Object.assign(result,await provision(api,{project,apply:flags.has('--apply')}));save();}
    if(flags.has('--apply') || flags.has('--audit') || flags.has('--smoke')){Object.assign(result,await audit(api));save();}
    if(flags.has('--smoke'))Object.assign(result,await smoke(config,api));
    result.status='passed';save();console.log(JSON.stringify(result));
  }catch(error){result.status='failed';save();throw error;}
}
if(require.main===module)main().catch(error=>{console.error(error.message.startsWith('PostHog') || /^(Add |Use |The configured|The real telemetry|Configure |Duplicate)/.test(error.message)?error.message:'PostHog setup could not complete. No credentials or response bodies were printed.');process.exitCode=1;});
module.exports={provision,verifyProject,smoke,audit,tag};
