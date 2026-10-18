/* Read-only connectivity/schema probe. Does not echo configuration or response
 * bodies, request OTP emails, create records, or alter the remote database. */
const fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('ui/service-config.js','utf8'),context);
const config=context.window.DNServiceConfig;
(async()=>{
  if(!config.supabaseUrl || !config.supabasePublishableKey)throw Error('missing-configuration');
  const headers={apikey:config.supabasePublishableKey};
  const auth=await fetch(config.supabaseUrl+'/auth/v1/settings',{headers,signal:AbortSignal.timeout(10000)});
  let discordEnabled=null;try{const settings=await auth.json();if(typeof settings.external?.discord==='boolean')discordEnabled=settings.external.discord;}catch{}
  const table=await fetch(config.supabaseUrl+'/rest/v1/planner_workspaces?select=owner_id&limit=1',{headers,signal:AbortSignal.timeout(10000)});
  let code;try{code=(await table.json())?.code;}catch{}
  const schemaMissing=['PGRST205','42P01'].includes(code) || table.status===404;
  const denied=table.status===401 || table.status===403;
  const result={authReachable:auth.ok,discordEnabled,schemaInstalled:schemaMissing?false:denied || table.ok?true:null,anonymousWorkspaceReadDenied:schemaMissing?null:denied};
  console.log(JSON.stringify(result));
  if(!auth.ok || table.ok)process.exitCode=1;
})().catch(()=>{console.error('The read-only connection check failed. Configuration and response details were not printed.');process.exitCode=1;});
