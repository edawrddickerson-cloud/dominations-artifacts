/* Account deletion is server-only. Ownership comes from verified Auth, never
 * from request JSON. Optional analytics cleanup must be accepted before Auth
 * deletion; database foreign keys then remove private state and contributions. */
export function createHandler({createClient,env,fetchImpl=fetch,now=Date.now}) {
  const value=name=>env.get(name) || '';
  return async request=>{
    const origin=request.headers.get('Origin') || '';
    const origins=value('APP_ORIGINS').split(',').map(s=>s.trim()).filter(Boolean);
    const headers={'Content-Type':'application/json','Vary':'Origin','Cache-Control':'no-store'};
    const response=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    if(!origin || !origins.includes(origin))return response(403,{error:'Origin not allowed'});
    Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return response(405,{error:'Method not allowed'});
    const authorization=request.headers.get('Authorization') || '';
    if(!/^Bearer \S+$/.test(authorization))return response(401,{error:'Authentication required'});
    let body;try{body=await request.json();}catch{return response(400,{error:'Invalid request'});}
    if(body?.confirmation!=='DELETE')return response(400,{error:'Explicit confirmation required'});
    const url=value('SUPABASE_URL');
    let publishable=value('APP_SUPABASE_PUBLISHABLE_KEY');
    if(!publishable)try{publishable=JSON.parse(value('SUPABASE_PUBLISHABLE_KEYS')).default || '';}catch{}
    let secret=value('APP_SUPABASE_SECRET_KEY');
    if(!secret)try{secret=JSON.parse(value('SUPABASE_SECRET_KEYS')).default || '';}catch{}
    if(!url || !publishable || !secret)return response(503,{error:'Account deletion is not configured'});
    try {
      const authClient=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data,error}=await authClient.auth.getUser(authorization.slice(7));
      if(error || !data?.user)return response(401,{error:'Authentication required'});
      const user=data.user,lastSignIn=Date.parse(user.last_sign_in_at);
      if(!Number.isFinite(lastSignIn) || now()-lastSignIn>15*60*1000 || lastSignIn-now()>60000)return response(409,{error:'Sign in again before deleting your account',code:'reauthentication_required'});
      let analyticsDeletionRequested=false;
      if(value('APP_ANALYTICS_ENABLED')==='true') {
        const project=value('POSTHOG_PROJECT_ID'),key=value('POSTHOG_PERSONAL_API_KEY');
        if(!/^\d+$/.test(project) || !key)return response(503,{error:'Analytics deletion is not configured'});
        const host=value('POSTHOG_API_HOST') || 'https://eu.posthog.com';
        if(!['https://eu.posthog.com','https://us.posthog.com'].includes(host))return response(503,{error:'Invalid analytics region'});
        const lookup=new URL('/api/projects/'+project+'/persons/',host);lookup.searchParams.set('distinct_id','u:'+user.id);
        const read=await fetchImpl(lookup,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
        if(!read.ok)return response(502,{error:'Analytics deletion unavailable; account remains active'});
        const persons=await read.json();
        if(!Array.isArray(persons.results) || persons.next)return response(502,{error:'Analytics deletion could not be verified; account remains active'});
        for(const person of persons.results) {
          if(!person.id)return response(502,{error:'Invalid analytics deletion response'});
          const deletion=new URL('/api/projects/'+project+'/persons/'+encodeURIComponent(person.id)+'/',host);
          deletion.searchParams.set('delete_events','true');deletion.searchParams.set('delete_recordings','true');
          const removed=await fetchImpl(deletion,{method:'DELETE',headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
          if(!removed.ok && removed.status!==404)return response(502,{error:'Analytics deletion unavailable; account remains active'});
          analyticsDeletionRequested=true;
        }
      }
      const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
      const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);
      if(deleteError)return response(502,{error:'Account deletion unavailable; retry the request'});
      return response(200,{deleted:true,analyticsDeletionRequested});
    }catch{return response(502,{error:'Account deletion unavailable; retry the request'});}
  };
}
