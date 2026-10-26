/* Test-only Supabase transport. Real SQL/RLS is exercised separately.
 * This script never enters ui/ or a production deployment. */
(() => {
  const root=window.top;
  root.DNTestBackend ||= {owner:null,workspaces:{},consent:{},outcomes:{},sessions:{},telemetry:[],offline:false,callbacks:[],oauthRequests:[],exchanges:[],clientAuth:[]};
  const backend=root.DNTestBackend,copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(url,options={})=>{
    if(String(url).startsWith('https://eu.i.posthog.com/')) {
      if(backend.offline)throw Error('Test offline');
      backend.telemetry.push({payload:JSON.parse(options.body),options:{credentials:options.credentials,referrerPolicy:options.referrerPolicy}});
      return new Response('{}',{status:200});
    }
    return nativeFetch(url,options);
  };
  function emit(){for(const fn of backend.callbacks)try{fn('TEST',backend.owner?{user:backend.owner}:null);}catch{}}
  backend.switchOwner=id=>{backend.owner=id?{id,email:id+'@example.invalid'}:null;emit();};
  window.supabase={createClient(url,key,options){backend.clientAuth.push(copy(options.auth));return {
    auth:{onAuthStateChange(fn){backend.callbacks.push(fn);return {data:{subscription:{unsubscribe(){}}}};},async getSession(){return {data:{session:backend.owner?{user:backend.owner}:null},error:null};},
      async signInWithOAuth(request){
        if(backend.offline)return {data:null,error:{code:'503'}};
        backend.oauthRequests.push(copy(request));
        const target=new URL(request.options.redirectTo);target.searchParams.set('code','test-discord-code');
        window.location.assign(target.href);return {data:{provider:'discord',url:target.href},error:null};
      },
      async exchangeCodeForSession(code){
        backend.exchanges.push(code);
        if(backend.failExchange)return {data:null,error:{code:'invalid_grant'}};
        backend.owner={id:'11111111-1111-4111-8111-111111111111',email:'tester@example.invalid',user_metadata:{preferred_username:'Test Commander'}};emit();return {data:{session:{user:backend.owner}},error:null};
      },
      async signOut(){backend.owner=null;emit();return {error:null};}},
    from(table){let columns,filter;return {
      select(value){columns=value;return this;},eq(key,value){filter={key,value};return this;},
      async maybeSingle(){
        backend.workspaceReads ||= [];backend.workspaceReads.push({table,columns,filter:copy(filter)});
        if(backend.offline)return {data:null,error:{code:'503'},status:503};
        if(table!=='planner_workspaces'||filter?.key!=='owner_id'||filter.value!==backend.owner?.id)return {data:null,error:null,status:200};
        const row=backend.workspaces[filter.value];
        return {data:row?copy(Object.fromEntries(columns.split(',').map(key=>[key,row[key]]))):null,error:null,status:200};
      }};},
    async rpc(name,args={}){
      if(backend.rpcError?.name===name)return {data:null,error:{code:backend.rpcError.code}};
      if(backend.offline)return {data:null,error:{code:'503'}};
      const owner=backend.owner?.id;if(!owner)return {data:null,error:{code:'42501'}};
      if(name==='planner_read_workspace')return {data:copy(backend.workspaces[owner] || null),error:null};
      if(name==='planner_save_workspace' || name==='planner_save_workspace_v2') {
        if(name==='planner_save_workspace_v2' && args.p_owner!==owner)return {data:null,error:{code:'42501'}};
        const current=backend.workspaces[owner];
        if(current?.operation_id===args.p_operation_id)return {data:copy(current),error:null};
        if((current?.revision || 0)!==args.p_expected_revision)return {data:null,error:{code:'40001'}};
        const next={game_key:'dominations',revision:args.p_expected_revision+1,operation_id:args.p_operation_id,updated_at:new Date().toISOString(),data:copy(args.p_data)};backend.workspaces[owner]=next;
        if(backend.loseResponse){backend.loseResponse=false;return {data:null,error:{code:'503'}};}
        return {data:copy(next),error:null};
      }
      if(name==='planner_set_research_consent'){backend.consent[owner]=args.p_enabled;return {data:null,error:null};}
      if(name==='planner_set_crafting_consent'){
        backend.craftingConsent ||= {};backend.craftingOperations ||= {};backend.craftingEvidence ||= {};
        const key=owner+':'+args.p_operation;
        if(backend.craftingOperations[key])return {data:copy(backend.craftingOperations[key]),error:null};
        const receipt={epoch:crypto.randomUUID()};backend.craftingOperations[key]=receipt;backend.craftingConsent[owner]={...receipt,enabled:args.p_enabled};
        if(!args.p_enabled)backend.craftingEvidence[owner]={};return {data:copy(receipt),error:null};
      }
      if(name==='planner_submit_crafting'){
        const receipt=backend.craftingConsent?.[owner];if(!receipt?.enabled || receipt.epoch!==args.p_epoch)return {data:null,error:{code:'42501'}};
        backend.craftingEvidence ||= {};backend.craftingEvidence[owner] ||= {};
        for(const record of args.p_payload.records)backend.craftingEvidence[owner][record.id]=copy(record);
        return {data:{accepted:true},error:null};
      }
      if(name==='planner_submit_research') {
        if(!backend.consent[owner])return {data:null,error:{code:'42501'}};
        backend.outcomes[owner] ||= {};backend.sessions[owner] ||= {};
        for(const session of args.p_payload.sessions)backend.sessions[owner][session.id]=copy(session);
        for(const outcome of args.p_payload.outcomes)backend.outcomes[owner][outcome.id]=copy(outcome);
        return {data:{accepted:args.p_payload.outcomes.length},error:null};
      }
      if(name==='planner_delete_research'){backend.outcomes[owner]={};backend.sessions[owner]={};backend.consent[owner]=false;return {data:null,error:null};}
      backend.ocrReceipt ||= {};backend.ocrOperations ||= {};
      if(name==='planner_get_ocr_feedback_consent')return {data:backend.ocrReceipt[owner] || {enabled:false,epoch:null,since:null},error:null};
      if(name==='planner_set_ocr_feedback_consent'){
        const key=owner+':'+args.p_operation;if(backend.ocrOperations[key])return {data:copy(backend.ocrOperations[key]),error:null};
        if(args.p_enabled && args.p_expected!==(backend.ocrReceipt[owner]?.epoch || null))return {data:null,error:{code:'42501'}};
        backend.ocrConsent ||= {};backend.ocrConsent[owner]=args.p_enabled;
        const receipt={enabled:args.p_enabled,epoch:crypto.randomUUID(),since:new Date().toISOString()};backend.ocrReceipt[owner]=receipt;backend.ocrOperations[key]=receipt;
        return {data:copy(receipt),error:null};
      }
      if(name==='planner_submit_ocr_feedback'){
        if(!backend.ocrConsent?.[owner] || backend.ocrReceipt[owner]?.epoch!==args.p_epoch)return {data:null,error:{code:'42501'}};
        backend.ocrSamples ||= {};backend.ocrSamples[owner] ||= {};
        for(const sample of args.p_samples)backend.ocrSamples[owner][sample.id]=copy(sample);
        return {data:{accepted:args.p_samples.length},error:null};
      }
      if(name==='planner_delete_ocr_feedback'){backend.ocrSamples ||= {};backend.ocrSamples[owner]={};backend.ocrConsent ||= {};backend.ocrConsent[owner]=false;backend.ocrReceipt[owner]={enabled:false,epoch:crypto.randomUUID(),since:new Date().toISOString()};return {data:null,error:null};}
      if(name==='planner_export_account')return {data:{workspace:copy(backend.workspaces[owner]),research_outcomes:Object.values(backend.outcomes[owner] || {})},error:null};
      return {data:null,error:{code:'unknown'}};
    },functions:{async invoke(){return {data:null,error:{code:'not-tested'}};}}};}};
})();
