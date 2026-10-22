/* Authority: User-requested passive attribute discovery while manually cycling artifacts.
 * Ownership: Local item log, OCR observations and explicit local JSON export.
 * Invariants: No uploads or catalogue/rating edits. Item artwork persists locally
 * for Keep and image-inclusive log exports. Crafting logs always persist locally.
 * Unknown observations remain unverified. Stop retains data.
 * History: Items use encounter identity so retries and corrections update their stats;
 * failed reads can still reveal labels in separate diagnostic observations. */
(async () => {
  'use strict';
  const isComplete=item=>!!item && (item.expectedRows || 5)===5 && item.rows?.length===5 && item.rows.every(row=>row.known && row.name && !row.assumed && !row.conflict && !row.tierConflict && Number.isFinite(row.value) && row.hasPercent!==false);
  function createCollector({initialData}={}) {
    const scans=[],labels=new Map(),items=new Map(),aliases=new Map(),encounters=new Map(),dirtyItems=new Set();let previous=null,activeItem=null,labelsDirty=true,resetView=true;
    const statKeys=['logged','kept','main','war','threeUnlocked'];
    const emptyStats=()=>Object.fromEntries(statKeys.map(key=>[key,0]));
    const savedStats=initialData?.lifetimeStatistics;
    const validStats=value=>value && statKeys.every(key=>Number.isSafeInteger(value[key]) && value[key]>=0) &&
      value.kept<=value.logged && value.main+value.war<=value.logged && value.threeUnlocked<=value.logged;
    let archivedStats=initialData?.version===2 && savedStats?.version===1 && validStats(savedStats.archived)?Object.fromEntries(statKeys.map(key=>[key,savedStats.archived[key]])):emptyStats();
    const currentStats=emptyStats();
    const contribution=item=>({logged:1,kept:item.keptId?1:0,main:item.hall==='main'?1:0,war:item.hall==='war'?1:0,threeUnlocked:item.unlocked?.count===3?1:0});
    function countItem(item,sign=1){const counts=contribution(item);for(const key of statKeys)currentStats[key]+=counts[key]*sign;}
    const lifetimeTotals=()=>Object.fromEntries(statKeys.map(key=>[key,archivedStats[key]+currentStats[key]]));
    const clone=value=>JSON.parse(JSON.stringify(value));
    const hallOf=result=>['main','war'].includes(result?.hall)?result.hall:['main','war'].includes(result?.artifact?.hall)?result.artifact.hall:null;
    const labelKey=(name,hall)=>JSON.stringify([hall,name.toLowerCase().replace(/\s+/g,' ')]);
    const sessionId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    if(initialData?.version===2) {
      for(const item of (Array.isArray(initialData.items)?initialData.items:[]).slice(0,5000))if(item?.id!=null && Array.isArray(item.rows))items.set(item.id,clone(window.DNStoredArtifacts?.backfillItem(item) || item));
      for(const scan of (Array.isArray(initialData.scans)?initialData.scans:[]).slice(0,5000))if(Array.isArray(scan?.observations))scans.push(clone(scan));
      for(const label of (Array.isArray(initialData.labels)?initialData.labels:[]))if(typeof label?.name==='string')labels.set(labelKey(label.name,hallOf(label)),clone({...label,hall:hallOf(label)}));
    }
    const encounterKey=(encounter,profile)=>JSON.stringify([encounter,profile]);
    for(const item of items.values()) {
      countItem(item);
      dirtyItems.add(item.id);
      if(item.encounterId)encounters.set(encounterKey(item.encounterId,item.profileKey),item.id);
    }
    let sinceLastKept=0;
    for(const item of items.values())sinceLastKept=item.keptId?0:sinceLastKept+1;
    if(!lifetimeTotals().kept)sinceLastKept=lifetimeTotals().logged;
    if(savedStats?.version===1 && validStats(savedStats.archived) && Number.isSafeInteger(savedStats.sinceLastKept) &&
      savedStats.sinceLastKept>=0 && savedStats.sinceLastKept<=lifetimeTotals().logged)sinceLastKept=savedStats.sinceLastKept;
    function setItem(id,item) {
      const prior=items.get(id);
      if(!prior)sinceLastKept++;
      if(item.keptId && !prior?.keptId)sinceLastKept=0;
      if(prior)countItem(prior,-1);
      countItem(item);
      if(prior?.encounterId && (prior.encounterId!==item.encounterId || prior.profileKey!==item.profileKey))encounters.delete(encounterKey(prior.encounterId,prior.profileKey));
      items.set(id,item);dirtyItems.add(id);
      if(item.encounterId)encounters.set(encounterKey(item.encounterId,item.profileKey),id);
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
    function recordItem(result,id,{corrected=false,expectedRows=5,continuous=false,newEncounter=false,steadyState=false,profileKey=null,encounterId=null,captureMethod='unknown'}={}) {
      if(id==null || !(result?.rows || []).some(row=>row.name || row.raw))return false;
      id=sessionId+':'+id;
      const requested=id;
      const encounter=encounterId==null?null:sessionId+':'+encounterId;
      const existing=encounter && items.get(encounters.get(encounterKey(encounter,profileKey)));
      if(existing)id=existing.id;
      else if(continuous && !newEncounter && activeItem && (!profileKey || items.get(activeItem)?.profileKey===profileKey) && sameArtifact(items.get(activeItem),result))id=activeItem;
      else if(!newEncounter && aliases.has(id))id=aliases.get(id);
      aliases.set(requested,id);
      if(aliases.size>10000)aliases.delete(aliases.keys().next().value);
      const prior=items.get(id);
      activeItem=id;
      const incomingEvidence=result.artifact?.nameEvidence;
      const nameEvidence=incomingEvidence && (!prior?.nameEvidence || (incomingEvidence.confidence ?? -1)>=(prior.nameEvidence.confidence ?? -1))?incomingEvidence:prior?.nameEvidence || null;
      if(!prior && items.size>=5000)return false;
      // Keep a verified or fuller read when a manual retry produces worse OCR.
      const rowQuality=row=>!row?0:(row.known?8:0)+(row.name && Number.isFinite(row.value) && !row.conflict && !row.tierConflict && !row.outOfRange?2:0)+(!row.assumed && !row.inferred?1:0);
      const quality=rows=>rows.reduce((sum,row)=>sum+rowQuality(row),0);
      if(prior && !corrected && !steadyState && (prior.corrected || (prior.validated && !result.valid) ||
        (!!prior.validated===!!result.valid && quality(prior.rows)>quality(result.rows)))) {
        // Dice observations can improve independently of the text read. Never
        // replace manual choices or attach them to a different encounter.
        if(!sameArtifact(prior,result))return false;
        const scannedName=result.artifact?.name;
        const recoveredImage=!prior.image && result.artifact?.image;
        let changed=!!recoveredImage || !!scannedName && !prior.name && prior.nameSource!=='manual' || JSON.stringify(nameEvidence)!==JSON.stringify(prior.nameEvidence || null);
        const rows=prior.rows.map((row,index)=>{
          const next=result.rows[index];
          if(row.rerollSource==='manual' || !next || !Object.prototype.hasOwnProperty.call(next,'rerollEligible'))return row;
          if(row.rerollEligible===next.rerollEligible && row.rerollSource===next.rerollSource)return row;
          changed=true;
          return {...row,rerollEligible:next.rerollEligible,rerollSource:next.rerollSource,
            rerollConfidence:next.rerollConfidence,rerollEvidence:next.rerollEvidence,rerollConflict:next.rerollConflict};
        });
        if(changed)setItem(id,clone({...prior,...(recoveredImage?{image:recoveredImage}:{}),...(scannedName && !prior.name && prior.nameSource!=='manual'?{name:scannedName,nameSource:'scanned'}:{}),nameEvidence,rows,lastUpdated:new Date().toISOString()}));
        return changed;
      }
      const timestamp=new Date().toISOString();
      const rows=prior && continuous && !corrected && !steadyState && !result.valid && sameArtifact(prior,result)
        ? result.rows.map((row,index)=>rowQuality(row)>rowQuality(prior.rows[index])?row:prior.rows[index]):result.rows;
      const item={id,firstSeen:prior?.firstSeen || timestamp,lastUpdated:timestamp,
        captureSessionId:prior?.captureSessionId || sessionId,
        captureMethod:['live-capture','local-image'].includes(prior?.captureMethod)?prior.captureMethod:['live-capture','local-image'].includes(captureMethod)?captureMethod:'unknown',
        craftingEventId:prior?.craftingEventId || null,craftingEventSource:prior?.craftingEventSource || 'unknown',
        validated:!!result.valid,corrected:corrected || !!prior?.corrected,expectedRows,hall:result.hall || prior?.hall || null,
        encounterId:encounter || prior?.encounterId || null,profileKey:profileKey || prior?.profileKey || null,
        keepId:prior?.keepId || 'craft-log-'+id,keptId:prior?.keptId || null,
        hallSource:result.hallSource || prior?.hallSource || null,
        name:prior?.nameSource==='manual'?prior.name:result.artifact?.name || prior?.name || null,
        nameSource:prior?.nameSource || (result.artifact?.name?'scanned':null),image:result.artifact?.image || prior?.image || null,
        type:result.artifact?.type || prior?.type || null,freshCraft:result.freshCraft ?? prior?.freshCraft ?? rows.every(row=>row.rerollSource==='fresh-craft'),rows,unlocked:result.unlocked || prior?.unlocked || null};
      item.nameEvidence=nameEvidence;
      const next=clone(window.DNStoredArtifacts?.backfillItem(item) || item);
      if(prior) {
        const {lastUpdated:oldTime,...oldFields}=prior,{lastUpdated:newTime,...newFields}=next;
        if(JSON.stringify(oldFields)===JSON.stringify(newFields))return false;
      }
      setItem(id,next);
      return true;
    }
    function itemForEncounter(encounterId,profileKey) {
      const item=items.get(encounters.get(encounterKey(sessionId+':'+encounterId,profileKey)));
      return item?clone(item):null;
    }
    function updateItem(id,changes) {
      const item=items.get(id);if(!item)return false;
      const next=clone({...item,...changes,id});
      if(JSON.stringify(item)===JSON.stringify(next))return false;
      setItem(id,next);return true;
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
      labelsDirty=true;
      return true;
    }
    function nameReviews() {
      const reviews=[];let number=0;
      for(const item of items.values()) {
        number++;
        if(!String(item.name || '').trim() || /^(unknown|unnamed)( artifact)?$/i.test(String(item.name).trim()))
          reviews.push({itemId:item.id,number,hall:item.hall,type:item.type,firstSeen:item.firstSeen,evidence:item.nameEvidence?clone(item.nameEvidence):null});
      }
      return reviews;
    }
    function snapshot({includeImages=false}={}){
      const snapshots=includeImages?[...items.values()]:[...items.values()].map(({image,...text})=>text);
      return {version:2,kind:'unverified-artifact-perk-observations',exportedAt:new Date().toISOString(),notes:'Items contain the best read per detected artifact encounter; retries and corrections update that entry. Separate encounters may have identical stats. OCR observations require verification.'+(includeImages?' Artifact artwork included.':' No images included.'),lifetimeStatistics:{version:1,archived:{...archivedStats},totals:lifetimeTotals(),sinceLastKept},items:snapshots,scans,labels:[...labels.values()],nameReviews:nameReviews()};
    }
    function takeChanges({all=false}={}) {
      const changes={scanCount:scans.length,itemCount:items.size,reset:resetView,lifetime:lifetimeTotals(),sinceLastKept,nameReviews:all || resetView || dirtyItems.size?nameReviews():null,
        items:clone([...(all?items.keys():dirtyItems)].map(id=>items.get(id))),labels:all || labelsDirty?clone([...labels.values()]):null};
      dirtyItems.clear();labelsDirty=false;resetView=false;return changes;
    }
    function clear(){archivedStats=lifetimeTotals();for(const key of statKeys)currentStats[key]=0;scans.length=0;labels.clear();items.clear();aliases.clear();encounters.clear();dirtyItems.clear();activeItem=null;previous=null;labelsDirty=true;resetView=true;}
    // A small, isolated projection of the canonical best records. No pixels,
    // diagnostic reads or raw OCR; statistics never create another item store.
    function historyItems() {
      return [...items.values()].map(item=>({id:item.id,name:item.name,firstSeen:item.firstSeen,lastUpdated:item.lastUpdated,
        captureSessionId:item.captureSessionId,profileKey:item.profileKey,captureMethod:item.captureMethod,craftingEventId:item.craftingEventId,craftingEventSource:item.craftingEventSource,
        expectedRows:item.expectedRows,hall:item.hall,type:item.type,validated:item.validated,corrected:item.corrected,keptId:item.keptId,
        rows:item.rows.map(row=>Object.fromEntries(['name','known','value','hasPercent','level','tier','base','max','assumed','inferred','conflict','tierConflict','nameSource','valueSource','unlocked','rerollEligible'].map(key=>[key,row[key]])))}));
    }
    function ocrFeedbackItems() {
      return [...items.values()].map(item=>({id:item.id,hall:item.hall,type:item.type,name:item.name,nameSource:item.nameSource,
        nameEvidence:item.nameEvidence?{text:item.nameEvidence.text,confidence:item.nameEvidence.confidence,accepted:item.nameEvidence.accepted}:null,
        rows:item.rows.map(row=>({name:row.name,raw:row.raw,known:row.known,assumed:row.assumed,nameSource:row.nameSource,
          nameMatch:row.nameMatch?{name:row.nameMatch.name,method:row.nameMatch.method,confidence:row.nameMatch.confidence}:null}))}));
    }
    return {record,recordItem,itemForEncounter,updateItem,historyItems,ocrFeedbackItems,nameReviews,sessionId,exportData:options=>clone(snapshot(options)),
      // Persistence owns this immutable string. Avoid cloning the entire log
      // before serializing it; exports and public summaries remain isolated.
      serialize:()=>JSON.stringify(snapshot({includeImages:true})),takeChanges,getItem:id=>items.has(id)?clone(items.get(id)):null,
      clear,summary:()=>clone({scanCount:scans.length,itemCount:items.size,lifetime:lifetimeTotals(),sinceLastKept,items:[...items.values()],labels:[...labels.values()]})};
  }
  window.DNScannerCollectionCore={createCollector,isComplete};
  const enabled=document.getElementById('scanner-collect');
  const craftingLog=document.getElementById('scanner-crafted-log');
  if(!craftingLog && !enabled)return;
  const isEnabled=()=>!!craftingLog || enabled.checked;
  let initialData,storageMessage='';
  if(craftingLog) {
    try {
      initialData=JSON.parse(await window.DN.scannerLog.read() || 'null');
    } catch {storageMessage='Saved logs could not be loaded. Export this session to keep a copy.';}
  }
  const collector=createCollector({initialData}), count=document.getElementById('scanner-collection-count'), list=document.getElementById('scanner-collected-labels');
  const keeping=new Set(),keepMessages=new Map(),itemNodes=new Map(),itemNumbers=new Map(),itemNameKeys=new Map(),nameGroups=new Map();
  let persistence=Promise.resolve(),storageRevision=0;
  function downloadJSON(data,prefix) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
    try {
      const link=document.createElement('a');link.href=url;link.download=prefix+'-'+data.exportedAt.slice(0,10)+'.json';link.click();
    }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  document.getElementById('scanner-collection-export')?.addEventListener('click',()=>{
    const status=document.getElementById('scanner-collection-export-status');
    try {
      const data=collector.exportData({includeImages:true});downloadJSON(data,'artifact-perk-observations');
      status.textContent='Full item log download started: '+data.items.length+' item'+(data.items.length===1?'':'s')+' and '+data.scans.length+' read'+(data.scans.length===1?'':'s')+'.';
    }catch{status.textContent='The item log could not be exported. Your log has not been cleared.';}
  });
  document.getElementById('scanner-stat-evidence-export')?.addEventListener('click',async()=>{
    const status=document.getElementById('scanner-stat-evidence-status');
    try {
      const evidence=await window.DNArtifactStatContext.browserEvidence({collector});
      const report={kind:'artifact-stat-evidence',version:1,exportedAt:new Date().toISOString(),...evidence,artifactNamesNeedingReview:collector.nameReviews()};
      downloadJSON(report,'artifact-stat-evidence');
      status.textContent='Stat evidence download started.'+(evidence.errors.length?' '+evidence.errors.join(' '):'');
    }catch{status.textContent='Stat evidence could not be exported. Your saved data has not been changed.';}
  });
  function persist() {
    if(!craftingLog)return persistence;
    // Submit each changed batch immediately, without a debounce. The shared
    // IndexedDB adapter opens transactions in invocation order, including
    // removal. The returned promise resolves after the durable transaction.
    const revision=++storageRevision;
    try {
      persistence=Promise.resolve(window.DN.scannerLog.write(collector.serialize())).then(()=>{
        if(revision===storageRevision){storageMessage='';renderStorage();}
      },()=>{
        if(revision===storageRevision){storageMessage='Could not save logs in this browser. Storage may be full or unavailable; export to keep a copy.';renderStorage();}
      });
    } catch {
      storageMessage='Could not save logs in this browser. Storage may be full or unavailable; export to keep a copy.';renderStorage();
      persistence=Promise.resolve();
    }
    return persistence;
  }
  function renderStorage() {
    const persistenceStatus=document.getElementById('scanner-log-storage-status');
    if(persistenceStatus)persistenceStatus.textContent=storageMessage;
  }
  function renderNameReviews(reviews) {
    const reviewList=document.getElementById('scanner-name-review'),reviewCount=document.getElementById('scanner-name-review-count');
    if(!reviewList)return;
    if(reviewCount)reviewCount.textContent=reviews.length+' missing artifact names';
    reviewList.textContent='';
    for(const review of reviews) {
      const li=document.createElement('li'),label=document.createElement('span'),button=document.createElement('button');
      label.textContent='Artifact #'+review.number+' · '+(review.hall==='main'?'Main':review.hall==='war'?'War':'Unknown hall')+' · '+(review.type || 'Unknown category')+' ';
      button.type='button';button.className='btn';button.dataset.reviewName=review.itemId;button.textContent='Review name';li.append(label,button);
      if(review.evidence?.text){const evidence=document.createElement('p');evidence.textContent='OCR: '+review.evidence.text+(Number.isFinite(review.evidence.confidence)?' · Score '+Math.round(review.evidence.confidence):'');li.append(evidence);}
      reviewList.append(li);
    }
  }
  document.getElementById('scanner-name-review')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-review-name]');if(!button)return;
    const node=itemNodes.get(button.dataset.reviewName);if(!node)return;
    const listDetails=node.closest('#scanner-item-log')?.closest('details');if(listDetails)listDetails.open=true;
    node.querySelector('details').open=true;node.scrollIntoView({block:'center'});
    const input=node.querySelector('[data-log-name]');if(input && !input.disabled)input.focus();else node.querySelector('summary')?.focus();
  });
  let labelCount=0,unknownCount=0;
  function render({all=false,itemId=null}={}) {
    renderStorage();
    const data=collector.takeChanges({all});
    const statistics=document.getElementById('scanner-lifetime-stats');
    if(statistics)for(const field of statistics.querySelectorAll('[data-crafted-stat]'))field.textContent=(field.dataset.craftedStat==='sinceLastKept'?data.sinceLastKept:data.lifetime[field.dataset.craftedStat]).toLocaleString();
    const hallLabel=hall=>hall==='war'?'War':hall==='main'?'Main (Multiplayer)':'Hall unclear';
    if(data.labels) {
      const unknown=data.labels.filter(item=>!item.known);labelCount=data.labels.length;unknownCount=unknown.length;
      list.textContent=unknown.map(item=>hallLabel(item.hall)+' · '+item.name+' ('+item.seenInScans+' reads)').join('\n') || 'No unknown perk labels.';
    }
    if(data.nameReviews)renderNameReviews(data.nameReviews);
    count.textContent=data.scanCount+' distinct reads · '+labelCount+' unique labels · '+unknownCount+' not in current perk settings'+(data.scanCount>=5000?' · Limit reached; export and clear.':'');
    const log=document.getElementById('scanner-item-log');
    if(log) {
      document.getElementById('scanner-item-count').textContent=data.itemCount+' items logged'+(data.itemCount>=5000?' · Limit reached; export and clear.':'');
      const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      if(data.reset){log.textContent='';itemNodes.clear();itemNumbers.clear();itemNameKeys.clear();nameGroups.clear();}
      if(itemId && !data.items.some(item=>item.id===itemId)){const item=collector.getItem(itemId);if(item)data.items.push(item);}
      const affected=new Set();
      for(const item of data.items) {
        const oldKey=itemNameKeys.get(item.id),key=item.name?JSON.stringify([item.profileKey,item.hall,item.type,String(item.name).trim().toLowerCase().replace(/\s+/g,' ')]):null;
        if(oldKey===key)continue;
        if(oldKey){const group=nameGroups.get(oldKey);group?.delete(item.id);for(const id of group || [])affected.add(id);if(!group?.size)nameGroups.delete(oldKey);}
        itemNameKeys.set(item.id,key);
        if(key){if(!nameGroups.has(key))nameGroups.set(key,new Set());const group=nameGroups.get(key);group.add(item.id);for(const id of group)affected.add(id);}
      }
      const changedIds=new Set(data.items.map(item=>item.id));
      for(const id of affected)if(!changedIds.has(id)){const item=collector.getItem(id);if(item)data.items.push(item);}
      for(const item of data.items) {
        if(!itemNumbers.has(item.id))itemNumbers.set(item.id,itemNumbers.size+1);
        const reason=window.DNScannerKeep?.loggedReason(item) || '',busy=keeping.has(item.id);
        const categories=window.DN?.ARTIFACT_TYPE_EXHIBITS[item.hall==='war'?'War':'Main'] || [];
        const category=window.DNScannerKeep && !item.type?'<label>Category <select data-log-type="'+escape(item.id)+'"><option value="">Choose category</option>'+categories.map(ex=>{const type=ex.key.replace(/^war-/,'');return '<option value="'+escape(type)+'">'+escape(ex.label.replace(/ Exhibit$/,''))+'</option>';}).join('')+'</select></label>':'';
        const node=document.createElement('li');node.dataset.logItem=item.id;
        const repeated=nameGroups.get(itemNameKeys.get(item.id))?.size || 0;
        const date=new Date(item.firstSeen),timestamp=Number.isFinite(date.getTime())?date.toISOString().slice(0,19):'Unknown time';
        node.innerHTML='<div class="scanner-log-heading"><details><summary><strong>'+escape(item.name || 'Unnamed artifact')+'</strong> <span class="scanner-log-meta">#'+itemNumbers.get(item.id)+' · <time datetime="'+escape(Number.isFinite(date.getTime())?date.toISOString():'')+'">'+timestamp+'</time> UTC · '+escape(item.hall==='main'?'Main':hallLabel(item.hall))+(item.type?' · '+escape(item.type):'')+' · '+(item.corrected?'Corrected':isComplete(item)?'Stats complete':item.validated?'Read complete':'Needs review')+(repeated>1?' · Same name ×'+repeated:'')+'</span></summary>'+
        (/^data:image\/(?:jpeg|png|webp);base64,/i.test(item.image || '')?'<img class="scanner-log-artwork" src="'+escape(item.image)+'" alt="'+escape(item.name || 'Artifact')+'" width="192" loading="lazy" />':'')+
        '<label class="scanner-log-name">Name <input type="text" data-log-name="'+escape(item.id)+'" value="'+escape(item.name || '')+'"'+(busy || item.keptId?' disabled':'')+' /></label>'+
        '<ol>'+Array.from({length:item.expectedRows || 5},(_,i)=>{const row=item.rows[i];return '<li>'+escape(row?.name || row?.raw || 'Unread stat')+' <strong>'+escape(Number.isFinite(row?.value)?(row.value>=0?'+':'')+row.value+'%':'?%')+'</strong>'+(row?.inferred?' (inferred)':row?.assumed?' (assumed)':'')+'</li>';}).join('')+'</ol>'+category+'</details>'+
        (window.DNScannerKeep?'<button type="button" class="btn" data-keep-log="'+escape(item.id)+'"'+(busy || item.keptId || reason?' disabled':'')+' title="'+escape(item.keptId?'Added to Collection':reason || 'Add this logged craft to Collection and benchmarks')+'">'+(busy?'Saving…':item.keptId?'Kept':'Keep')+'</button>':'')+
        '</div>'+(keepMessages.has(item.id)?'<p role="status">'+escape(keepMessages.get(item.id))+'</p>':'');
        const previous=itemNodes.get(item.id);
        if(previous?.querySelector('details')?.open)node.querySelector('details').open=true;
        if(previous)log.replaceChild(node,previous);else log.insertBefore(node,log.firstChild);
        itemNodes.set(item.id,node);
      }
    }
  }
  const historyListeners=new Set();
  function afterChange(changed) {if(changed){persist();render();for(const fn of historyListeners)try{fn();}catch{}}return changed;}
  window.DNScannerCollection={isEnabled,itemForEncounter:collector.itemForEncounter,
    historyItems:collector.historyItems,sessionId:collector.sessionId,
    ocrFeedbackItems:collector.ocrFeedbackItems,
    subscribe(fn){historyListeners.add(fn);return ()=>historyListeners.delete(fn);},
    markKept:(id,keptId,metadata={})=>afterChange(collector.updateItem(id,{...metadata,keptId})),flush:()=>persistence,
    recordResult(observation,result,id,options,publish){
      if(!isEnabled()){publish?.();return false;}
      const observed=collector.record(observation),updated=collector.recordItem(result,id,options);
      try {publish?.();}finally {afterChange(observed || updated);}
      return observed || updated;
    },
    record:result=>isEnabled() && afterChange(collector.record(result)),
    recordItem:(result,id,options)=>isEnabled() && afterChange(collector.recordItem(result,id,options))};
  if(typeof window.Event==='function')window.dispatchEvent(new window.Event('dn-crafted-log-ready'));
  document.getElementById('scanner-item-log')?.addEventListener('click',async event=>{
    const button=event.target.closest('[data-keep-log]');if(!button || button.disabled)return;
    const id=button.dataset.keepLog,item=collector.getItem(id);
    if(!item || keeping.has(id))return;
    keeping.add(id);keepMessages.delete(id);render({itemId:id});
    try{await window.DNScannerKeep.keepLogged(item);}
    catch(error){keepMessages.set(id,error.message || 'Could not keep this craft. Try again.');}
    finally{keeping.delete(id);render({itemId:id});}
  });
  document.getElementById('scanner-item-log')?.addEventListener('input',event=>{
    const id=event.target.dataset.logName,item=id && collector.getItem(id);
    if(!item || item.keptId || keeping.has(id))return;
    // Save without replacing the focused field or the Keep button being clicked.
    if(collector.updateItem(id,{name:event.target.value.trim() || null,nameSource:'manual'})){persist();renderNameReviews(collector.nameReviews());}
  });
  document.getElementById('scanner-item-log')?.addEventListener('change',event=>{
    const id=event.target.dataset.logType;if(!id || !event.target.value)return;
    afterChange(collector.updateItem(id,{type:event.target.value.replace(/^./,letter=>letter.toUpperCase())}));
  });
  document.getElementById('scanner-item-log')?.addEventListener('focusout',event=>{
    // A name field losing focus to Keep must not replace the button before its click.
    if(event.target.dataset.logName && !event.relatedTarget?.closest('[data-keep-log]'))render();
    if(event.target.dataset.logName)for(const fn of historyListeners)try{fn();}catch{}
  });
  enabled?.addEventListener('change',()=>{if(enabled.checked)document.getElementById('scanner-read').click();});
  window.addEventListener?.('focus',()=>render({all:true}));
  window.addEventListener?.('storage',()=>render({all:true}));
  document.getElementById('scanner-collection-clear').addEventListener('click',()=>{if(confirm('Clear the item log and names? Lifetime totals stay. Export first to keep images and details.')){collector.clear();afterChange(true);}});
  if(initialData)persist();
  render();
})();
