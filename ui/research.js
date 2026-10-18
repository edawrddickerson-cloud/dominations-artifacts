/* Authority: Approved opt-in crafting observations; advanced analysis deferred.
 * Ownership: Separate research evidence and a durable, account-bound upload queue.
 * Invariants: Encounters are not crafts. Only explicit new-craft confirmations
 * count; retries revise an encounter, identical separate crafts stay separate.
 * No screenshots, free-form OCR, collection ownership or rating writes. */
(() => {
  'use strict';
  const C=window.DNIntegrationCore,copy=value=>JSON.parse(JSON.stringify(value));
  function create({owner,initial,id=()=>crypto.randomUUID(),now=()=>new Date().toISOString()}={}) {
    const state=initial?.version===1 && initial.owner===owner?copy(initial):{version:1,owner,sessions:[],observations:[],active:null};
    function active(){return state.sessions.find(s=>s.id===state.active && !s.ended_at);}
    function encode(result,corrected,previous=[]) {
      const source=(index,key,value,fallback)=>corrected && previous[index] && previous[index][key]!==value || previous[index]?.sources?.[{current_value:'value'}[key] || key]==='user-corrected' && previous[index]?.[key]===value?'user-corrected':fallback;
      const method=(origin,fallback='unknown')=>origin==='manual'?'user-corrected':/inferred|percentage|tier-level|tier-percentage|fresh-craft|crafting|artifact-type|base-tier/.test(origin || '')?'inferred':origin==='unknown'?'unknown':origin?'direct':fallback;
      return (result?.rows || []).slice(0,6).map((row,index)=>({position:index+1,name:row.known && !row.assumed?String(row.name).slice(0,160):null,
        current_value:Number.isFinite(row.value)?row.value:null,base_value:Number.isFinite(row.base)?row.base:null,max_value:Number.isFinite(row.max)?row.max:null,
        has_percent:row.hasPercent!==false && Number.isFinite(row.value),
        level:Number.isInteger(row.level)?row.level:null,tier:['white','green','blue'].includes(row.tier)?row.tier:null,
        unlocked:typeof row.unlocked==='boolean'?row.unlocked:null,reroll_eligible:typeof row.rerollEligible==='boolean'?row.rerollEligible:null,
        conflict:!!(row.conflict || row.tierConflict),inferred:!!(row.inferred || row.assumed),
        sources:{name:source(index,'name',row.known && !row.assumed?String(row.name).slice(0,160):null,row.known && !row.assumed?method(row.nameSource,'direct'):'unknown'),value:source(index,'current_value',Number.isFinite(row.value)?row.value:null,row.valueSource==='manual'?'user-corrected':row.inferred?'inferred':Number.isFinite(row.value) && row.hasPercent!==false?'direct':'unknown'),
          level:source(index,'level',Number.isInteger(row.level)?row.level:null,method(row.levelSource)),tier:source(index,'tier',row.tier || null,method(row.tierSource)),reroll:method(row.rerollSource),base:Number.isFinite(row.base)?row.rangeSource==='manual'?'user-corrected':'inferred':'unknown',max:Number.isFinite(row.max)?row.rangeSource==='manual'?'user-corrected':'inferred':'unknown'},
        evidence_methods:{name:row.nameSource || null,value:row.valueSource || null,level:row.levelSource || null,tier:row.tierSource || null,range:row.rangeSource || null,reroll:row.rerollSource || null},
        confidence:Number.isFinite(row.confidence)?Math.max(0,Math.min(100,row.confidence)):null}));
    }
    function start({gameVersion='',eventContext='',expectedCrafts=null,appBuild=null}={}) {
      if(active())throw Error('Finish the current research session first.');
      if(expectedCrafts!==null && (!Number.isInteger(expectedCrafts) || expectedCrafts<0 || expectedCrafts>100000))throw Error('Enter a valid expected craft count.');
      const session={id:id(),started_at:now(),ended_at:null,game_version:gameVersion.trim().slice(0,80) || null,event_context:eventContext.trim().slice(0,120) || null,
        context_source:gameVersion || eventContext?'user-reported':'unknown',app_build:appBuild,expected_crafts:expectedCrafts,attempted_crafts:null,policy:C.POLICY,revision:1};
      state.sessions.push(session);state.active=session.id;return copy(session);
    }
    function observe(result,{source,encounterId,corrected=false,original=result,expectedRows=5,captureMethod='unknown'}={}) {
      const session=active();if(!session || source!=='crafting')return null;
      const key=session.id+':'+source+':'+encounterId;
      let entry=state.observations.find(item=>item.encounter_key===key);
      const perks=encode(result,corrected,entry?.perks);
      const hall=['main','war'].includes(result?.hall)?result.hall:entry?.hall || null;
      const category=result?.artifact?.type || entry?.category || null;
      if(entry && C.canonical(entry.perks)===C.canonical(perks) && entry.hall===hall && entry.category===category && entry.hall_source===(result?.hallSource || entry.hall_source || null))return copy(entry);
      if(!entry) {
        if(state.observations.length>=2000)throw Error('Research storage is full. Export or clear saved research before continuing.');
        entry={id:id(),session_id:session.id,encounter_key:key,source,capture_method:['live-capture','local-image'].includes(captureMethod)?captureMethod:'unknown',first_seen:now(),last_updated:now(),new_craft:false,identity_source:'unconfirmed',disposition:'unknown',
          hall,hall_source:result?.hallSource || null,category,expected_rows:expectedRows,perks:[],first_read:encode(original,false),revisions:[],revision:0};
        state.observations.push(entry);
      }
      if(entry.perks.length)entry.revisions=[...entry.revisions,{at:entry.last_updated,perks:entry.perks}].slice(-10);
      entry.perks=perks;entry.revision++;entry.last_updated=now();
      entry.hall=['main','war'].includes(result?.hall)?result.hall:entry.hall;
      entry.hall_source=result?.hallSource || entry.hall_source || null;
      entry.category=result?.artifact?.type || entry.category;
      entry.complete=perks.length===expectedRows && perks.every(row=>row.name && row.current_value!==null && row.has_percent && !row.inferred && !row.conflict && ['direct','user-corrected'].includes(row.sources.value));
      session.revision++;return copy(entry);
    }
    function confirm(observationId) {
      const entry=state.observations.find(item=>item.id===observationId);
      if(!entry || entry.source!=='crafting')throw Error('Only a newly generated crafting result can be confirmed.');
      if(!entry.new_craft){entry.new_craft=true;entry.identity_source='user-confirmed';entry.revision++;entry.last_updated=now();}
      return copy(entry);
    }
    function disposition(observationId,value) {
      const entry=state.observations.find(item=>item.id===observationId);
      if(!entry || !['retained','rejected','unknown'].includes(value))throw Error('Choose an explicit craft decision.');
      if(entry.disposition!==value){entry.disposition=value;entry.revision++;entry.last_updated=now();}
    }
    function finish(attemptedCrafts) {
      const session=active();if(!session)return;
      if(attemptedCrafts!=null){if(!Number.isInteger(attemptedCrafts) || attemptedCrafts<0 || attemptedCrafts>100000)throw Error('Enter a valid total.');session.attempted_crafts=attemptedCrafts;}
      session.ended_at=now();session.revision++;state.active=null;
    }
    function payload() {
      const outcomes=state.observations.filter(item=>item.new_craft).map(({encounter_key,...item})=>copy(item));
      const sessions=state.sessions.map(session=>({...copy(session),encounters:state.observations.filter(item=>item.session_id===session.id).length}));
      return {version:1,policy:C.POLICY,sessions,outcomes};
    }
    return {start,observe,confirm,disposition,finish,payload,snapshot:()=>copy(state),active:()=>copy(active() || null),
      metadata:()=>copy({version:state.version,owner:state.owner,sessions:state.sessions,active:state.active}),
      item:itemId=>copy(state.observations.find(item=>item.id===itemId) || null),count:()=>state.observations.filter(item=>item.new_craft).length};
  }
  window.DNResearchCore={create};
  if(!window.DNConsent || !window.DNServiceStore)return;
  let collector=null,loadedOwner=null,latest=null,error='',persistence=Promise.resolve(),uploading=false,lastSent='',generation=0;
  const pageId=crypto.randomUUID(),listeners=new Set();
  const notify=()=>{for(const fn of listeners)try{fn();}catch{}};
  function status(){return {active:collector?.active() || null,latest:latest?copy(latest):null,error,owner:loadedOwner,
    confirmed:collector?.count() || 0,saved:!!collector};}
  function persist(entry=null) {
    if(!collector || !loadedOwner)return Promise.resolve();
    const owner=loadedOwner,current=generation,records=[{id:'research:'+owner,value:collector.metadata()}];
    if(entry)records.push({id:'research:'+owner+':observation:'+entry.id,value:copy(entry)});
    persistence=persistence.catch(()=>{}).then(()=>window.DNServiceStore.putMany(records)).then(()=>{if(current===generation){error='';notify();}}).catch(()=>{
      if(current===generation){error='Research could not be saved. Export it before closing this page.';notify();}
      throw Error('Research storage is unavailable.');
    });
    persistence.catch(()=>{});return persistence;
  }
  async function load() {
    const owner=window.DNCloud?.user()?.id,current=++generation;
    collector=null;loadedOwner=null;latest=null;lastSent='';
    if(!owner || !window.DNConsent.get().research || !C.researchReady(window.DNServiceConfig)){notify();return;}
    try {
      await persistence.catch(()=>{});
      const saved=await window.DNServiceStore.get('research:'+owner);
      if(saved && !Array.isArray(saved.observations))saved.observations=await window.DNServiceStore.list('research:'+owner+':observation:');
      if(current!==generation)return;
      if(!window.DNConsent.get().research || !C.researchReady(window.DNServiceConfig) || window.DNCloud?.user()?.id!==owner)return;
      collector=create({owner,initial:saved});loadedOwner=owner;error='';
    }catch{error='Research storage is unavailable. The planner still saves your collections normally.';}
    notify();
  }
  async function upload() {
    if(uploading || !collector || !window.DNConsent.get().research || window.DNCloud?.user()?.id!==loadedOwner || navigator.onLine===false || !C.researchReady(window.DNServiceConfig))return;
    const data=collector.payload(),signature=C.canonical(data),owner=loadedOwner,current=generation;
    if(signature===lastSent || !data.sessions.length)return;
    uploading=true;
    try {
      await persistence;
      // Revalidate consent on the server before each batch; device preference
      // changes never resurrect a previous account's queue.
      await window.DNCloud.rpc('planner_set_research_consent',{p_enabled:true,p_policy:C.POLICY});
      if(current!==generation || !window.DNConsent.get().research || window.DNCloud.user()?.id!==owner)return;
      for(let index=0;index<Math.max(1,data.outcomes.length);index+=100) {
        if(current!==generation || !window.DNConsent.get().research)return;
        await window.DNCloud.rpc('planner_submit_research',{p_payload:{...data,outcomes:data.outcomes.slice(index,index+100)}});
      }
      if(current===generation){lastSent=signature;error='';notify();}
    }catch{if(current===generation){error='Research is saved locally and will retry when the account service is available.';notify();}}
    finally{uploading=false;}
  }
  window.DNResearch={status,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    async start(options){if(!collector)throw Error('Enable research sharing and sign in before starting a research session.');collector.start({...options,appBuild:window.DNServiceConfig.build});latest=null;await persist();notify();},
    observe(result,context){
      if(!collector || !window.DNConsent.get().research || window.DNCloud?.user()?.id!==loadedOwner)return;
      try {
        const entry=collector.observe(result,{...context,encounterId:pageId+':'+context.encounterId});
        if(entry){if(latest?.id===entry.id && latest.revision===entry.revision)return;latest=entry;persist(entry);notify();}
      }catch(failure){error=failure.message;notify();}
    },
    async confirm(){if(!latest || !collector)throw Error('Read the newly crafted item first.');latest=collector.confirm(latest.id);await persist(latest);notify();},
    async disposition(value){if(!latest || !collector)return;collector.disposition(latest.id,value);latest=collector.item(latest.id);await persist(latest);notify();},
    async finish(count){collector?.finish(count);await persist();notify();await upload();},
    export:()=>collector?.snapshot() || null,
    async clear(){const owner=loadedOwner;generation++;collector=null;latest=null;await persistence.catch(()=>{});if(owner)await window.DNServiceStore.removePrefix('research:'+owner);await load();},
    upload};
  window.DNConsent.subscribe(async preferences=>{
    const oldOwner=loadedOwner;
    if(!preferences.research){generation++;collector=null;loadedOwner=null;latest=null;await persistence.catch(()=>{});if(oldOwner)await window.DNServiceStore.removePrefix('research:'+oldOwner);notify();}
    else await load();
  });
  window.addEventListener('dn-account-changed',()=>{load().catch(()=>{});});
  window.addEventListener('online',()=>upload());
  setInterval(()=>{if(!document.hidden)upload();},15000);
  load().catch(()=>{});
})();
