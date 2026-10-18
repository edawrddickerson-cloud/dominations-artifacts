/* Authority: Approved accounts and simple versioned workspace synchronization.
 * Ownership: Supabase Auth adapter and explicit local migration/recovery.
 * Invariants: No scoring changes; SDK loads only when configured. Local data
 * survives network/auth failures. Cloud replacement requires a safety snapshot. */
(() => {
  'use strict';
  const C=window.DNIntegrationCore,config=window.DNServiceConfig,store=window.DNStoredArtifacts;
  let client=null,currentUser=null,starting=null,timer=null,consentTask=Promise.resolve(),authGeneration=0;
  const listeners=new Set();let message={status:'disabled'},authenticationError='';
  const configured=()=>C.cloudReady(config,location.origin);
  function announce(next) {message={...next,authError:authenticationError};for(const fn of listeners)try{fn({...message});}catch{}}
  function binding() {try{return JSON.parse(localStorage.getItem('dn_cloud_binding') || 'null');}catch{return null;}}
  function saveBinding(value) {localStorage.setItem('dn_cloud_binding',JSON.stringify(value));}
  async function capture() {
    const settings=C.settingsSnapshot(localStorage),profiles=JSON.parse(settings['dn-profiles']);
    return C.createWorkspace(settings,await store.readPlannerRecords(profiles.profiles.map(p=>p.id)));
  }
  async function fullBackup() {
    await window.DN.scannerLog.ready;
    return {kind:'dominations-planner-backup',version:1,exportedAt:new Date().toISOString(),settings:window.DNLocalBackupCore.settingsSnapshot(localStorage),records:await store.readBackupRecords()};
  }
  async function recover({owner,remote}) {
    const value={createdAt:new Date().toISOString(),owner,local:await fullBackup(),remote};
    const previous=await window.DNServiceStore.get('cloud-recovery') || [];
    await window.DNServiceStore.put('cloud-recovery',[value,...previous].slice(0,3));
  }
  async function apply(workspace,{preserveArtwork}) {
    C.validate(workspace);
    const previous=await fullBackup(),settings=Object.fromEntries(Object.entries(previous.settings).filter(([key])=>!C.isSyncedSetting(key)));
    Object.assign(settings,workspace.settings);
    const art=new Map();
    if(preserveArtwork)for(const record of previous.records)for(const item of record.items || [])if(item.image)art.set(record.id+':'+item.id,item.image);
    const records=workspace.records.map(record=>({id:record.id,items:record.items.map(item=>({...C.sanitizeItem(item),...(art.has(record.id+':'+item.id)?{image:art.get(record.id+':'+item.id)}:{})}))}));
    // Keep this account's local diagnostic history. Never carry another account's
    // history into a newly adopted cloud workspace.
    if(preserveArtwork)records.push(...previous.records.filter(record=>record.id==='crafting-log'));
    await window.DNLocalBackupCore.restore({kind:'dominations-planner-backup',version:1,settings,records},localStorage,store);
  }
  async function rpc(name,args={}) {
    if(!client || !currentUser)throw Error('Sign in before using account storage.');
    try {
      const result=await client.rpc(name,args);
      if(result.error)throw result.error;
      return result.data;
    }catch(error) {
      if(name==='planner_read_workspace' || name==='planner_save_workspace')try{window.DNTelemetry?.event('cloud_sync_failed',{reason:error.code==='40001'?'conflict':error.code==='42501'?'permission':'request'});}catch{}
      throw Object.assign(Error('The cloud request could not be completed. Your local data is unchanged.'),{code:error?.code});
    }
  }
  const engine=window.DNCloudSyncCore.create({capture,readBinding:binding,saveBinding,recover,apply,notify:announce,
    remote:{async read(){return rpc('planner_read_workspace');},async write(owner,revision,operation,data){return rpc('planner_save_workspace',{p_expected_revision:revision,p_operation_id:operation,p_data:data});}}});
  function schedule(delay=2000) {
    clearTimeout(timer);if(!currentUser || !configured())return;
    timer=setTimeout(()=>{timer=null;engine.inspect().catch(()=>{});},delay);
  }
  async function syncConsent() {
    if(!client || !currentUser)return;
    const user=currentUser.id,preferences=window.DNConsent.get();
    await rpc('planner_set_research_consent',{p_enabled:preferences.research && C.researchReady(config),p_policy:C.POLICY});
    if(currentUser?.id!==user)throw Error('Account changed.');
  }
  function setSession(session) {
    const next=session?.user || null;
    if(currentUser?.id===next?.id)return;
    currentUser=next;authGeneration++;clearTimeout(timer);
    engine.setOwner(next?.id);
    window.DNTelemetry?.setOwner(next?.id || null);
    if(next){consentTask=syncConsent().catch(()=>{});schedule(0);}else announce({status:'signed-out'});
    window.dispatchEvent(new CustomEvent('dn-account-changed',{detail:{signedIn:!!next}}));
  }
  async function start() {
    if(!configured()){announce({status:'disabled'});return;}
    if(starting)return starting;
    starting=(async()=>{
      const url=new URL(config.supabaseUrl);
      if(url.protocol!=='https:' && !['localhost','127.0.0.1'].includes(url.hostname))throw Error('Account storage requires HTTPS.');
      if(!config.supabasePublishableKey.startsWith('sb_publishable_'))throw Error('Use a browser-safe Supabase publishable key.');
      if(!window.supabase)await window.DNServiceLoader.script('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js');
      client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,flowType:'pkce',detectSessionInUrl:false},global:{fetch:async(url,options={})=>{
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
        try{return await fetch(url,{...options,signal:options.signal || controller.signal,referrerPolicy:'no-referrer'});}finally{clearTimeout(timeout);}
      }}});
      client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>setSession(session),0);});
      const returned=window.DNOAuthReturn;delete window.DNOAuthReturn;
      if(returned?.error)authenticationError='Discord sign-in was cancelled or could not be completed. Try Continue with Discord again.';
      else if(returned?.code) {
        try {
          const {data,error}=await client.auth.exchangeCodeForSession(returned.code);
          if(error || !data?.session)throw Error('Sign-in failed.');
          authenticationError='';setSession(data.session);
        }catch{authenticationError='Discord sign-in could not be completed. Start again in this browser.';}
        finally{returned.code=null;}
      }
      const {data,error}=await client.auth.getSession();if(error)throw error;setSession(data.session);
      if(!data.session)announce({status:'signed-out'});
      else announce(message);
    })().catch(()=>{starting=null;announce({status:'offline',error:'Account services are unavailable. Scanning and local saving still work.'});});
    return starting;
  }
  window.DNCloud={configured,start,rpc,capture,fullBackup,user:()=>currentUser?{id:currentUser.id,email:currentUser.email,displayName:String(currentUser.user_metadata?.preferred_username || currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email || 'Discord account').slice(0,100)}:null,state:()=>({...message}),
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    sync:()=>engine.inspect(),choose:choice=>engine.choose(choice),
    consentReady:()=>consentTask,
    async signInWithDiscord(){
      await start();if(!client || !configured())throw Error('Account services are unavailable.');
      authenticationError='';announce(message);
      const redirect=new URL('config.html',location.href);
      const {error}=await client.auth.signInWithOAuth({provider:'discord',options:{redirectTo:redirect.href}});
      if(error)throw Error('Discord sign-in could not be started. Try again shortly.');
    },
    async signOut(){if(!client)return;const {error}=await client.auth.signOut({scope:'local'});if(error)throw Error('Could not sign out. Try again.');setSession(null);},
    async exportAccount(){return {kind:'dominations-account-export',version:1,account:window.DNCloud.user(),exportedAt:new Date().toISOString(),data:await rpc('planner_export_account')};},
    async recovery(){return await window.DNServiceStore.get('cloud-recovery') || [];},
    async deleteResearch(){await rpc('planner_delete_research');},
    async deleteAccount(){
      if(!client || !currentUser)throw Error('Sign in before deleting your account.');
      const generation=authGeneration;
      window.DNConsent.set({});
      const {data,error}=await client.functions.invoke('delete-account',{body:{confirmation:'DELETE'}});
      if(error || !data?.deleted)throw Error('Deletion could not be completed. Sign in again with Discord and retry.');
      if(generation===authGeneration){window.DNConsent.set({});await client.auth.signOut({scope:'local'});setSession(null);try{localStorage.removeItem('dn_cloud_binding');}catch{}}
      return data;
    }};
  window.DNConsent.subscribe(()=>{consentTask=syncConsent().catch(()=>{});});
  window.addEventListener('online',()=>{if(!client)start();else{consentTask=syncConsent().catch(()=>{});schedule(0);}});
  window.addEventListener('focus',()=>schedule(0));
  for(const event of ['dn-artifacts-changed','dn-strategies-changed','storage'])window.addEventListener(event,()=>schedule());
  for(const event of ['change','click'])document.addEventListener(event,()=>schedule());
  setInterval(()=>{if(!document.hidden)schedule(0);},30000);
  start();
})();
