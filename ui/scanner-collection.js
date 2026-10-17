/* Authority: User-requested passive attribute discovery while manually cycling artifacts.
 * Ownership: Local item log, OCR observations and explicit local JSON export.
 * Invariants: No screenshots/account identifiers, uploads, catalogue/rating edits,
 * or persistent screenshots. Crafting logs persist locally when enabled.
 * Unknown observations remain unverified. Stop retains data.
 * History: Items use encounter identity so retries and corrections update their stats;
 * failed reads can still reveal labels in separate diagnostic observations. */
(async () => {
  'use strict';
  const isComplete=item=>!!item && (item.expectedRows || 5)===5 && item.rows?.length===5 && item.rows.every(row=>row.known && row.name && !row.assumed && !row.conflict && !row.tierConflict && Number.isFinite(row.value) && row.hasPercent!==false);
  function createCollector({initialData}={}) {
    const scans=[],labels=new Map(),items=new Map(),aliases=new Map();let previous=null,activeItem=null;
    const clone=value=>JSON.parse(JSON.stringify(value));
    const hallOf=result=>['main','war'].includes(result?.hall)?result.hall:['main','war'].includes(result?.artifact?.hall)?result.artifact.hall:null;
    const labelKey=(name,hall)=>JSON.stringify([hall,name.toLowerCase().replace(/\s+/g,' ')]);
    const sessionId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    if(initialData?.version===2) {
      for(const item of (Array.isArray(initialData.items)?initialData.items:[]).slice(0,5000))if(item?.id!=null && Array.isArray(item.rows))items.set(item.id,clone(window.DNStoredArtifacts?.backfillItem(item) || item));
      for(const scan of (Array.isArray(initialData.scans)?initialData.scans:[]).slice(0,5000))if(Array.isArray(scan?.observations))scans.push(clone(scan));
      for(const label of (Array.isArray(initialData.labels)?initialData.labels:[]))if(typeof label?.name==='string')labels.set(labelKey(label.name,hallOf(label)),clone({...label,hall:hallOf(label)}));
    }
    function sameArtifact(a,b) {
      const leftType=a.type || a.artifact?.type,rightType=b.type || b.artifact?.type;
      if(leftType && rightType && leftType!==rightType)return false;
      if(a.hall && b.hall && a.hall!==b.hall || a.rows.length!==b.rows.length)return false;
      let matching=0;
      const normalize=name=>String(name || '').toLowerCase().replace(/\s+/g,' ').trim();
      for(let index=0;index<a.rows.length;index++) {
        const left=a.rows[index],right=b.rows[index];
        const named=normalize(left.name)===normalize(right.name);
        const valued=Number.isFinite(left.value) && left.value===right.value;
        if(named && valued && (left.known || right.known))matching++;
        else if(left.known && right.known && !left.assumed && !right.assumed && !left.inferred && !right.inferred)return false;
      }
      return matching>=Math.min(3,a.rows.length);
    }
    function recordItem(result,id,{corrected=false,expectedRows=5,continuous=false,newEncounter=false,steadyState=false,profileKey=null,encounterId=null}={}) {
      if(id==null || !(result?.rows || []).some(row=>row.name || row.raw))return false;
      id=sessionId+':'+id;
      const requested=id;
      const encounter=encounterId==null?null:sessionId+':'+encounterId;
      const existing=encounter && [...items.values()].find(item=>item.encounterId===encounter && item.profileKey===profileKey);
      if(existing)id=existing.id;
      else if(continuous && !newEncounter && activeItem && (!profileKey || items.get(activeItem)?.profileKey===profileKey) && sameArtifact(items.get(activeItem),result))id=activeItem;
      else if(!newEncounter && aliases.has(id))id=aliases.get(id);
      aliases.set(requested,id);
      if(aliases.size>10000)aliases.delete(aliases.keys().next().value);
      const prior=items.get(id);
      activeItem=id;
      if(!prior && items.size>=5000)return false;
      // Keep a verified or fuller read when a manual retry produces worse OCR.
      const rowQuality=row=>!row?0:(row.known?8:0)+(row.name && Number.isFinite(row.value) && !row.conflict && !row.tierConflict && !row.outOfRange?2:0)+(!row.assumed && !row.inferred?1:0);
      const quality=rows=>rows.reduce((sum,row)=>sum+rowQuality(row),0);
      if(prior && !corrected && !steadyState && (prior.corrected || (prior.validated && !result.valid) ||
        (!!prior.validated===!!result.valid && quality(prior.rows)>quality(result.rows)))) {
        // Dice observations can improve independently of the text read. Never
        // replace manual choices or attach them to a different encounter.
        if(!sameArtifact(prior,result))return false;
        let changed=false;
        const rows=prior.rows.map((row,index)=>{
          const next=result.rows[index];
          if(row.rerollSource==='manual' || !next || !Object.prototype.hasOwnProperty.call(next,'rerollEligible'))return row;
          if(row.rerollEligible===next.rerollEligible && row.rerollSource===next.rerollSource)return row;
          changed=true;
          return {...row,rerollEligible:next.rerollEligible,rerollSource:next.rerollSource,
            rerollConfidence:next.rerollConfidence,rerollEvidence:next.rerollEvidence,rerollConflict:next.rerollConflict};
        });
        if(changed)items.set(id,clone({...prior,rows,lastUpdated:new Date().toISOString()}));
        return changed;
      }
      const timestamp=new Date().toISOString();
      const rows=prior && continuous && !corrected && !steadyState && !result.valid && sameArtifact(prior,result)
        ? result.rows.map((row,index)=>rowQuality(row)>rowQuality(prior.rows[index])?row:prior.rows[index]):result.rows;
      const item={id,firstSeen:prior?.firstSeen || timestamp,lastUpdated:timestamp,
        validated:!!result.valid,corrected:corrected || !!prior?.corrected,expectedRows,hall:result.hall || prior?.hall || null,
        encounterId:encounter || prior?.encounterId || null,profileKey:profileKey || prior?.profileKey || null,
        keepId:prior?.keepId || 'craft-log-'+id,keptId:prior?.keptId || null,
        hallSource:result.hallSource || prior?.hallSource || null,
        type:result.artifact?.type || prior?.type || null,freshCraft:result.freshCraft ?? prior?.freshCraft ?? rows.every(row=>row.rerollSource==='fresh-craft'),rows,unlocked:result.unlocked || prior?.unlocked || null};
      items.set(id,clone(window.DNStoredArtifacts?.backfillItem(item) || item));
      return true;
    }
    function itemForEncounter(encounterId,profileKey) {
      const item=[...items.values()].find(item=>item.encounterId===sessionId+':'+encounterId && item.profileKey===profileKey);
      return item?clone(item):null;
    }
    function updateItem(id,changes) {
      const item=items.get(id);if(!item)return false;
      items.set(id,clone({...item,...changes,id}));return true;
    }
    function record(result) {
      const hall=hallOf(result);
      const observations=(result.observations || [{pass:'read',rows:result.rows || [],warnings:result.warnings || []}])
        .map(item=>({...item,rows:item.rows.filter(row=>row.known || /%/.test(row.raw || ''))}));
      const fingerprint=JSON.stringify({hall,type:result.artifact?.type,observations:observations.map(item=>item.rows.map(row=>[row.raw,row.name,row.value,!!row.known,!!row.assumed,row.nameMatch?.automatic])),presentation:result.presentation});
      if(previous===fingerprint || !observations.some(item=>item.rows.length))return false;
      if(scans.length>=5000)return false;
      previous=fingerprint;
      const timestamp=new Date().toISOString(),seen=new Set();
      const inferences=(result.rows || []).flatMap((row,index)=>row.inferred?[{index,name:row.name,value:row.value,colour:row.colour}]:[]);
      scans.push({timestamp,validated:!!result.valid,observations,hall,hallSource:result.hallSource || null,type:result.artifact?.type || null,...(result.presentation?{presentation:result.presentation}:{}),...(Number.isFinite(result.ocrCalls)?{ocrCalls:result.ocrCalls}:{}),...(result.colours?{colours:result.colours}:{}),...(result.temporal?{temporal:result.temporal}:{}),...(inferences.length?{inferences}:{}),...(result.percentageReads?.length?{percentageReads:result.percentageReads}:{}),...(result.unlocked?{unlocked:result.unlocked}:{})});
      for(const observation of observations)for(const row of observation.rows) {
        const name=String(row.name || '').trim();if(!name)continue;
        const key=labelKey(name,hall);
        if(!labels.has(key))labels.set(key,{name,hall,known:!!row.known && !row.assumed,assumed:!!row.assumed,seenInScans:0,values:[],samples:[],firstSeen:timestamp,lastSeen:timestamp});
        const entry=labels.get(key);
        if(!seen.has(key)){entry.seenInScans++;seen.add(key);}entry.lastSeen=timestamp;
        // A later clear match can resolve an earlier assumption, including an
        // independent row pass in the same scan. Weaker retries cannot undo it.
        if(row.known && !row.assumed){entry.known=true;entry.assumed=false;}
        if(row.value!==null && Number.isFinite(row.value) && !entry.values.includes(row.value))entry.values.push(row.value);
        if(row.raw && entry.samples.length<5 && !entry.samples.includes(row.raw))entry.samples.push(row.raw);
      }
      return true;
    }
    function exportData(){return clone({version:2,kind:'unverified-artifact-perk-observations',exportedAt:new Date().toISOString(),notes:'Items contain the best read per detected artifact encounter; retries and corrections update that entry. Separate encounters may have identical stats. OCR observations require verification. No images or account identifiers included.',items:[...items.values()],scans,labels:[...labels.values()]});}
    function clear(){scans.length=0;labels.clear();items.clear();aliases.clear();activeItem=null;previous=null;}
    return {record,recordItem,itemForEncounter,updateItem,exportData,clear,summary:()=>clone({scanCount:scans.length,itemCount:items.size,items:[...items.values()],labels:[...labels.values()]})};
  }
  window.DNScannerCollectionCore={createCollector,isComplete};
  const enabled=document.getElementById('scanner-collect');
  if(!enabled)return;
  const saveLogs=document.getElementById('scanner-save-logs');
  const preferenceKey='dn-crafting-scanner-save-logs';
  let initialData,storageMessage='';
  if(saveLogs) {
    try {
      saveLogs.checked=localStorage.getItem(preferenceKey)!=='false';
      if(saveLogs.checked)initialData=JSON.parse(await window.DN.scannerLog.read() || 'null');
    } catch {storageMessage='Saved logs could not be loaded. Export this session to keep a copy.';}
  }
  const collector=createCollector({initialData}), count=document.getElementById('scanner-collection-count'), list=document.getElementById('scanner-collected-labels');
  const keeping=new Set(),keepMessages=new Map();
  function downloadJSON(data,prefix) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
    try {
      const link=document.createElement('a');link.href=url;link.download=prefix+'-'+data.exportedAt.slice(0,10)+'.json';link.click();
    }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  document.getElementById('scanner-collection-export')?.addEventListener('click',()=>{
    const status=document.getElementById('scanner-collection-export-status');
    try {
      const data=collector.exportData();downloadJSON(data,'artifact-perk-observations');
      status.textContent='Full item log download started: '+data.items.length+' item'+(data.items.length===1?'':'s')+' and '+data.scans.length+' read'+(data.scans.length===1?'':'s')+'.';
    }catch{status.textContent='The item log could not be exported. Your log has not been cleared.';}
  });
  document.getElementById('scanner-stat-evidence-export')?.addEventListener('click',async()=>{
    const status=document.getElementById('scanner-stat-evidence-status');
    try {
      const evidence=await window.DNArtifactStatContext.browserEvidence({collector});
      const report={kind:'artifact-stat-evidence',version:1,exportedAt:new Date().toISOString(),...evidence};
      downloadJSON(report,'artifact-stat-evidence');
      status.textContent='Stat evidence download started.'+(evidence.errors.length?' '+evidence.errors.join(' '):'');
    }catch{status.textContent='Stat evidence could not be exported. Your saved data has not been changed.';}
  });
  function persist() {
    if(!saveLogs?.checked)return;
    window.DN.scannerLog.write(JSON.stringify(collector.exportData())).then(()=>{storageMessage='';render();},()=>{
      storageMessage='Could not save logs in this browser. Storage may be full or unavailable; export to keep a copy.';render();
    });
  }
  function render() {
    const persistenceStatus=document.getElementById('scanner-log-storage-status');
    if(persistenceStatus)persistenceStatus.textContent=storageMessage || (saveLogs.checked?'Logs save automatically in this browser and return when you reopen this page.':'Automatic saving is off. Export before refreshing or closing this tab.');
    const data=collector.summary(), unknown=data.labels.filter(item=>!item.known);
    count.textContent=data.scanCount+' distinct reads · '+data.labels.length+' unique labels · '+unknown.length+' not in current perk settings'+(data.scanCount>=5000?' · Limit reached; export and clear.':'');
    const hallLabel=hall=>hall==='war'?'War':hall==='main'?'Main (Multiplayer)':'Hall unclear';
    list.textContent=unknown.map(item=>hallLabel(item.hall)+' · '+item.name+' ('+item.seenInScans+' reads)').join('\n') || 'No unknown labels collected yet.';
    const log=document.getElementById('scanner-item-log');
    if(log) {
      document.getElementById('scanner-item-count').textContent=data.itemCount+' items logged'+(data.itemCount>=5000?' · Limit reached; export and clear.':'');
      const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      log.innerHTML=data.items.slice().reverse().map((item,index)=>{
        const reason=window.DNScannerKeep?.loggedReason(item) || '',busy=keeping.has(item.id);
        const categories=window.DN?.ARTIFACT_TYPE_EXHIBITS[item.hall==='war'?'War':'Main'] || [];
        const category=window.DNScannerKeep && !item.type?'<label>Category <select data-log-type="'+escape(item.id)+'"><option value="">Choose category</option>'+categories.map(ex=>{const type=ex.key.replace(/^war-/,'');return '<option value="'+escape(type)+'">'+escape(ex.label.replace(/ Exhibit$/,''))+'</option>';}).join('')+'</select></label>':'';
        return '<li data-log-item="'+escape(item.id)+'"><strong>Item '+(data.itemCount-index)+'</strong> · '+escape(hallLabel(item.hall))+(item.type?' · '+escape(item.type):'')+' · '+(item.corrected?'Corrected':isComplete(item)?'Stats complete':item.validated?'Read complete':'Needs review')+
        '<ol>'+Array.from({length:item.expectedRows || 5},(_,i)=>{const row=item.rows[i];return '<li>'+escape(row?.name || row?.raw || 'Unread stat')+' <strong>'+escape(Number.isFinite(row?.value)?(row.value>=0?'+':'')+row.value+'%':'?%')+'</strong>'+(row?.inferred?' (inferred)':row?.assumed?' (assumed)':'')+'</li>';}).join('')+'</ol>'+category+
        (window.DNScannerKeep?'<button type="button" class="btn" data-keep-log="'+escape(item.id)+'"'+(busy || item.keptId || reason?' disabled':'')+' title="'+escape(item.keptId?'Already added to inventory':reason || 'Add this logged craft to inventory and benchmarks')+'">'+(busy?'Saving…':item.keptId?'Kept':'Keep')+'</button>':'')+
        (keepMessages.has(item.id)?'<p role="status">'+escape(keepMessages.get(item.id))+'</p>':'')+'</li>';
      }).join('');
    }
  }
  window.DNScannerCollection={isEnabled:()=>enabled.checked,itemForEncounter:collector.itemForEncounter,
    markKept(id,keptId,metadata={}){if(collector.updateItem(id,{...metadata,keptId})){persist();render();}},
    record:result=>{if(enabled.checked){collector.record(result);persist();render();}},recordItem:(result,id,options)=>{if(enabled.checked){collector.recordItem(result,id,options);persist();render();}}};
  document.getElementById('scanner-item-log')?.addEventListener('click',async event=>{
    const button=event.target.closest('[data-keep-log]');if(!button || button.disabled)return;
    const id=button.dataset.keepLog,item=collector.summary().items.find(item=>item.id===id);
    if(!item || keeping.has(id))return;
    keeping.add(id);keepMessages.delete(id);render();
    try{await window.DNScannerKeep.keepLogged(item);}
    catch(error){keepMessages.set(id,error.message || 'Could not keep this craft. Try again.');}
    finally{keeping.delete(id);render();}
  });
  document.getElementById('scanner-item-log')?.addEventListener('change',event=>{
    const id=event.target.dataset.logType;if(!id || !event.target.value)return;
    if(collector.updateItem(id,{type:event.target.value.replace(/^./,letter=>letter.toUpperCase())})){persist();render();}
  });
  saveLogs?.addEventListener('change',async()=>{
    try {
      localStorage.setItem(preferenceKey,String(saveLogs.checked));
      if(!saveLogs.checked)await window.DN.scannerLog.remove();
      storageMessage='';
    } catch {storageMessage='Could not update saved logs in this browser. Storage is unavailable.';}
    if(saveLogs.checked)persist();
    render();
  });
  enabled.addEventListener('change',()=>{if(enabled.checked)document.getElementById('scanner-read').click();});
  window.addEventListener?.('focus',render);
  window.addEventListener?.('storage',render);
  document.getElementById('scanner-collection-clear').addEventListener('click',()=>{if(confirm('Clear the item log and collected labels, including saved logs? Export first if you want to keep them.')){collector.clear();persist();render();}});
  if(initialData)persist();
  render();
})();
