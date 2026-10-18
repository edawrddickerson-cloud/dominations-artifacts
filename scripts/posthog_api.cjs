/* Authority: Approved PostHog setup. Ownership: local administrative transport.
 * Invariants: Privileged keys stay outside ui/; no credentials or provider
 * response bodies in logs. Requests cannot follow redirects to other hosts. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function readValues(file){
  const values={};
  for(const line of fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){
    if(!line.trim() || line.trim().startsWith('#'))continue;
    const match=/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if(!match)throw Error('Use KEY=value lines in the local PostHog setup file.');
    values[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
  }
  return values;
}
function publicConfig(){const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'),context);return context.window.DNServiceConfig;}
function readAdmin(file=path.join(root,'data/temp/posthog-admin.txt')){
  const values=readValues(file),host=values.POSTHOG_API_HOST || 'https://eu.posthog.com';
  if(!['https://eu.posthog.com','https://us.posthog.com'].includes(host))throw Error('Use the exact EU or US PostHog application host.');
  if(!/^[1-9]\d*$/.test(values.POSTHOG_PROJECT_ID || ''))throw Error('Add the numeric POSTHOG_PROJECT_ID to data/temp/posthog-admin.txt.');
  if(!/^phx_[A-Za-z0-9_-]+$/.test(values.POSTHOG_PERSONAL_API_KEY || ''))throw Error('Add a scoped Personal API key to data/temp/posthog-admin.txt.');
  return {host,project:values.POSTHOG_PROJECT_ID,key:values.POSTHOG_PERSONAL_API_KEY};
}
function client(admin,fetchImpl=fetch){
  const base='/api/projects/'+admin.project+'/';
  async function request(route,{method='GET',body}={}){
    const url=new URL(route,admin.host);
    if(url.origin!==admin.host || !url.pathname.startsWith(base) || url.username || url.password)throw Error('PostHog request escaped the selected project.');
    const response=await fetchImpl(url,{method,headers:{Authorization:'Bearer '+admin.key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok){
      let details='';try{details=JSON.stringify(await response.json());}catch{}
      const allowedScopes=new Set(['project:read','project:write','dashboard:read','dashboard:write','insight:read','insight:write','query:read','person:read','person:write','organization:read']);
      const scopes=[...new Set((details.match(/\b[a-z_]+:(?:read|write)\b/g) || []).filter(scope=>allowedScopes.has(scope)))];
      const reason=/scope/i.test(details)?'API-key scope denied':/project.*access|access.*project/i.test(details)?'API key cannot access this project':/invalid.*(?:key|token)|(?:key|token).*invalid/i.test(details)?'API key rejected':'Check the project ID, region and API-key scopes';
      throw Object.assign(Error('PostHog '+method+' '+url.pathname+' returned HTTP '+response.status+'. '+reason+(scopes.length?' ('+scopes.join(', ')+')':'')+'.'),{status:response.status});
    }
    if(response.status===204)return null;
    return response.json();
  }
  async function list(resource){
    let route=base+resource+'/?limit=100';const rows=[];
    for(let page=0;route && page<30;page++){
      const result=await request(route);
      if(!Array.isArray(result.results))throw Error('Unexpected PostHog list response.');
      rows.push(...result.results);route=result.next;
    }
    if(route)throw Error('PostHog list exceeded its safety limit; nothing was created.');
    return rows;
  }
  return {request,list,base};
}
module.exports={root,readValues,readAdmin,publicConfig,client};
