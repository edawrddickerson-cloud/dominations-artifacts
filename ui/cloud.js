/* Authority: Approved accounts and simple versioned workspace synchronization.
 * Ownership: Supabase Auth adapter and explicit local migration/recovery.
 * Invariants: No scoring changes; SDK loads only when configured. Local data
 * survives network/auth failures. Cloud replacement requires a safety snapshot. */
(() => {
  'use strict';
  const C=window.DNIntegrationCore,config=window.DNServiceConfig,store=window.DNStoredArtifacts;
  let client=null,currentUser=null,starting=null,timer=null,consentTask=Promise.resolve(),authGeneration=0,artworkRecovery=null;
  const listeners=new Set();let message={status:'disabled'},authenticationError='';
  const configured=()=>C.cloudReady(config,location.origin);
  function announce(next) {message={...next,authError:authenticationError};for(const fn of listeners)try{fn({...message});}catch{}}
  function binding() {try{return JSON.parse(localStorage.getItem('dn_cloud_binding') || 'null');}catch{return null;}}
  function saveBinding(value) {localStorage.setItem('dn_cloud_binding',JSON.stringify(value));}
  async function capture() {
    const settings=C.settingsSnapshot(localStorage),profiles=JSON.parse(settings['dn-profiles']);
    if(window.DNScannerCollection)await window.DNScannerCollection.flush();
    const log=JSON.parse(await window.DN.scannerLog.read() || 'null');
    return C.createWorkspace(settings,await store.readPlannerRecords(profiles.profiles.map(p=>p.id)),log || window.DNCraftingHistory.normalize(null));
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
  function recoverLocalArtwork(){
    if(artworkRecovery)return artworkRecovery;
    const owner=currentUser?.id;
    if(!owner||binding()?.owner!==owner||!window.DNLocalArtworkRecovery)return Promise.resolve(0);
    const current=()=>currentUser?.id===owner&&binding()?.owner===owner;
    artworkRecovery=(async()=>{
      const sources=await window.DNServiceStore.get('cloud-recovery') || [],records=await store.readBackupRecords();
      if(!current())return 0;
      const result=window.DNLocalArtworkRecovery.recover(records,sources,{owner});
      return store.recoverArtwork(result.patches,current);
    })().catch(()=>0).finally(()=>{artworkRecovery=null;});return artworkRecovery;
  }
  async function apply(workspace,{preserveArtwork,owner=currentUser?.id,isCurrent=()=>currentUser?.id===owner}) {
    C.validate(workspace);
    if(!isCurrent())throw Error('The signed-in account changed. Nothing was replaced.');
    const previous=await fullBackup(),settings=Object.fromEntries(Object.entries(previous.settings).filter(([key])=>!C.isSyncedSetting(key)));
    Object.assign(settings,workspace.settings);
    const art=new Map();
    if(preserveArtwork)for(const record of previous.records)for(const item of record.items || [])if(item.image)art.set(record.id+':'+item.id,item.image);
    let records=workspace.records.map(record=>({id:record.id,items:record.items.map(item=>({...C.sanitizeItem(item),...(art.has(record.id+':'+item.id)?{image:art.get(record.id+':'+item.id)}:{})}))}));
    // Image-only catalog captures stay local to the same account and profile.
    if(preserveArtwork){const profiles=new Set(workspace.records.filter(record=>record.id.startsWith('collection:')).map(record=>'catalog-artwork:'+record.id.slice(11)));records.push(...previous.records.filter(record=>profiles.has(record.id)));}
    if(preserveArtwork&&window.DNLocalArtworkRecovery){
      const sources=[{owner,local:previous},...await window.DNServiceStore.get('cloud-recovery') || []];
      records=window.DNLocalArtworkRecovery.recover(records,sources,{owner}).records;
    }
    // Keep this account's local diagnostic history. Never carry another account's
    // history into a newly adopted cloud workspace.
    const localLog=previous.records.find(record=>record.id==='crafting-log');
    if(workspace.craftingLog) {
      const local=preserveArtwork && localLog?JSON.parse(localLog.value):null;
      const log=window.DNCraftingHistory.preserveLocalDetails(window.DNCraftingHistory.normalize(workspace.craftingLog),local);
      const artwork=new Map((local?.items || []).map(i=>[i.id,i.image]));
      for(const item of log.items)if(artwork.has(item.id))item.image=artwork.get(item.id);
      const totals=window.DNCraftingHistory.totals(log);
      log.lifetimeStatistics={version:1,archived:window.DNCraftingHistory.archivedTotals(log),totals,sinceLastKept:totals.sinceLastKept};
      // Local diagnostic reads stay local when the same account reconciles.
      log.scans=local?.scans || [];log.labels=local?.labels || [];
      records.push({id:'crafting-log',value:JSON.stringify(log)});
    }else if(preserveArtwork && localLog)records.push(localLog); // Old backups do not replace this account's history.
    if(!isCurrent())throw Error('The signed-in account changed. Nothing was replaced.');
    await window.DNLocalBackupCore.restore({kind:'dominations-planner-backup',version:1,settings,records},localStorage,store);
  }
  function cloudError(name,error,responseStatus){
      if(name==='planner_read_workspace' || name.startsWith('planner_save_workspace'))try{window.DNTelemetry?.event('cloud_sync_failed',{reason:error.code==='40001'?'conflict':error.code==='42501'?'permission':'request'});}catch{}
      const code=/^[A-Z0-9]{2,12}$/.test(error?.code || '')?error.code:/abort|timeout/i.test(error?.name+' '+error?.message)?'TIMEOUT':responseStatus?'HTTP'+responseStatus:'NETWORK';
      const action=name==='planner_read_workspace'?'Loading account data':name.startsWith('planner_save_workspace')?'Saving account data':'The cloud request';
      const message=code==='40001'?'Account data changed. Review the versions and retry.':code==='42501'?'Account permission changed. Sign in again and retry.':code==='57014'?action+' timed out on the server (57014). Retry shortly.':code==='TIMEOUT'?action+' timed out. Retry when connected.':'The cloud request could not be completed ('+code+').';
      return Object.assign(Error(message+' Your local data is unchanged.'),{code,cause:error});
  }
  async function rpc(name,args={}) {
    if(!client || !currentUser)throw Error('Sign in before using account storage.');
    let responseStatus;
    try {const result=await client.rpc(name,args);responseStatus=result.status;if(result.error)throw result.error;return result.data;}
    catch(error){throw cloudError(name,error,responseStatus);}
  }
  async function readWorkspace(owner,{metadataOnly=false}={}){
    if(!client || !currentUser)throw Error('Sign in before using account storage.');
    if(currentUser.id!==owner)throw Error('The signed-in account changed. Nothing was replaced.');
    let responseStatus;
    try{
      // The same authenticated SELECT/RLS used by the invoker RPC, without its
      // repeated whole-document to_jsonb/subtraction serialization. Filter the
      // inspected owner explicitly, even if the SDK session changes mid-flight.
      const columns=metadataOnly?'game_key,revision,operation_id,updated_at':'game_key,revision,operation_id,data,updated_at';
      const result=await client.from('planner_workspaces').select(columns).eq('owner_id',owner).maybeSingle();
      responseStatus=result.status;if(result.error)throw result.error;
      if(currentUser?.id!==owner)throw Object.assign(Error('Account changed'),{code:'42501'});
      return result.data;
    }catch(error){throw cloudError('planner_read_workspace',error,responseStatus);}
  }
  const engine=window.DNCloudSyncCore.create({capture,readBinding:binding,saveBinding,recover,apply,notify:announce,
    async applyHistory(log){
      if(window.DNScannerCollection){await window.DNScannerCollection.reconcileHistory(log);return;}
      const previous=JSON.parse(await window.DN.scannerLog.read() || 'null');
      const merged=window.DNCraftingHistory.preserveLocalDetails(window.DNCraftingHistory.reconcile(previous,log),previous);
      const artwork=new Map((previous?.items || []).map(i=>[i.id,i.image]));
      for(const item of merged.items)if(artwork.has(item.id))item.image=artwork.get(item.id);
      await window.DN.scannerLog.write(JSON.stringify({...merged,scans:previous?.scans || [],labels:previous?.labels || []}));
    },
    async readLocalCraftsLogged(){try{return C.lifetimeCraftsLogged(JSON.parse(await window.DN.scannerLog.read() || 'null'));}catch{return null;}},
    remote:{read:readWorkspace,readMetadata:owner=>readWorkspace(owner,{metadataOnly:true}),async write(owner,revision,operation,data,base){
      // Explicit rollout gate: no production migration is implied by this code.
      // Never fall back after an ambiguous failure; keep the pending operation
      // for the existing read/retry reconciliation path.
      if(config.workspaceDeltaSaves===true)return rpc('planner_save_workspace_v3',{
        p_owner:owner,p_expected_revision:revision,p_operation_id:operation,...C.workspaceSaveRequest(data,base)});
      return rpc('planner_save_workspace_v2',{p_owner:owner,p_expected_revision:revision,p_operation_id:operation,p_data:data});
    }}});
  function schedule(delay=2000) {
    clearTimeout(timer);if(!currentUser || !configured())return;
    timer=setTimeout(()=>{timer=null;engine.inspect().catch(()=>{});},delay);
  }
  async function syncConsent() {
    if(!client || !currentUser)return;
    const user=currentUser.id;
    // Legacy manual-session consent cannot authorize automatic v2 contributions.
    await rpc('planner_set_research_consent',{p_enabled:false,p_policy:C.POLICY});
    if(currentUser?.id!==user)throw Error('Account changed.');
  }
  function setSession(session) {
    const next=session?.user || null;
    if(currentUser?.id===next?.id)return;
    currentUser=next;authGeneration++;clearTimeout(timer);
    engine.setOwner(next?.id);
    window.DNTelemetry?.setOwner(next?.id || null);
    if(next){consentTask=syncConsent().catch(()=>{});schedule(0);setTimeout(recoverLocalArtwork,0);}else announce({status:'signed-out'});
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
        const requestPath=String(url?.url || url).split('?')[0],workspaceTransfer=/\/rpc\/planner_(read_workspace|save_workspace(?:_v[23])?)$/.test(requestPath)||/\/planner_workspaces$/.test(requestPath);
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),workspaceTransfer?60000:15000);
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
    async communityReport(args={}){await start();if(!client || !C.researchReady(config))throw Error('Unavailable');const result=await client.rpc('planner_crafting_summary',args);if(result.error)throw result.error;return result.data;},
    async communityProbabilityModel(args={}){await start();if(!client || !C.researchReady(config))throw Error('Unavailable');const result=await client.rpc('planner_crafting_probability_model',args);if(result.error)throw result.error;return result.data;},
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    sync:()=>engine.inspect(),choose:(choice,expected)=>engine.choose(choice,expected),
    consentReady:()=>consentTask,
    async signInWithDiscord(){
      await start();if(!client || !configured())throw Error('Account services are unavailable.');
      authenticationError='';announce(message);
      const redirect=new URL('config.html',location.href);
      const shell=window.parent!==window && window.parent.DNAppShell;
      const {data,error}=await client.auth.signInWithOAuth({provider:'discord',options:{redirectTo:redirect.href,...(shell?{skipBrowserRedirect:true}:{})}});
      if(error)throw Error('Discord sign-in could not be started. Try again shortly.');
      if(shell) {
        if(!data?.url)throw Error('Discord sign-in could not be started. Try again shortly.');
        window.parent.location.assign(data.url);
      }
    },
    async signOut(){if(!client)return;const {error}=await client.auth.signOut({scope:'local'});if(error)throw Error('Could not sign out. Try again.');setSession(null);},
    async exportAccount(){return {kind:'dominations-account-export',version:1,account:window.DNCloud.user(),exportedAt:new Date().toISOString(),data:await rpc('planner_export_account')};},
    async recovery(){return await window.DNServiceStore.get('cloud-recovery') || [];},recoverLocalArtwork,
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
  for(const event of ['dn-artifacts-changed','dn-strategies-changed','dn-crafting-purposes-changed','storage'])window.addEventListener(event,()=>schedule());
  for(const event of ['change','click'])document.addEventListener(event,()=>schedule());
  setInterval(()=>{if(!document.hidden)schedule(0);},30000);
  start();
})();
