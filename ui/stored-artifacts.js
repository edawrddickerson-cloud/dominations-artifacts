/* Authority: Reviewed artifact inventory and user-approved scanner tier capture.
 * Ownership: Shared local persistence, ranges and ordinary crafted tier mapping.
 * Invariants: Signed current values remain untouched; colour is tier evidence only
 * for crafting; missing/conflicting evidence stays explicit; special items have no
 * ordinary colour tier. Artwork stays in IndexedDB, with no uploads.
 * History: Tier/source metadata added to existing inventory, collection and logs. */
(() => {
  'use strict';
  let opening;
  let catalogPromise;
  let artworkTask=null,artworkAgain=false;
  const artworkAttempts=new Map();
  function backfillArtwork(){
    if(!window.DNArtwork?.enabled())return Promise.resolve();
    artworkAgain=true;
    if(!artworkTask)artworkTask=(async()=>{while(artworkAgain){artworkAgain=false;await runArtworkBackfill();}})().finally(()=>{artworkTask=null;});
    return artworkTask;
  }
  async function runArtworkBackfill(){
    const profile=collectionKey(),owner=window.DNCloud?.user()?.id;
    const current=()=>profile===collectionKey() && owner===window.DNCloud?.user()?.id;
    try{
      const records=await readBackupRecords();
      for(const record of records.filter(r=>r.id==='items'||r.id===profile))for(const item of record.items || []){
        if(!current())return;
        if(window.DNArtwork.validId(item.artworkId)||!window.DNArtwork.local(item.image))continue;
        const key=record.id+'|'+item.id;
        if(artworkAttempts.get(key)===item.image)continue;
        artworkAttempts.set(key,item.image);if(artworkAttempts.size>1000)artworkAttempts.delete(artworkAttempts.keys().next().value);
        const match=await window.DNArtwork.match(item.image);
        if(match.status==='unavailable')artworkAttempts.delete(key);
        if(!match.artworkId||!current())continue;
        const db=await open();let changed=false;
        await new Promise((resolve,reject)=>{
          const tx=db.transaction('inventory','readwrite'),store=tx.objectStore('inventory'),request=store.get(record.id);
          request.onsuccess=()=>{
            const saved=request.result,existing=saved?.items?.find(i=>i.id===item.id);
            if(!current()||!existing||existing.image!==item.image||existing.artworkId!==item.artworkId)return;
            existing.artworkId=match.artworkId;store.put(saved);changed=true;
          };
          tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
        });
        if(changed)announce(record.id);
      }
    }catch{ /* Matching must not interfere with local item saving. */ }
  }
  if(typeof window.addEventListener==='function'){
    window.addEventListener('dn-artifacts-changed',()=>setTimeout(backfillArtwork,0));
    window.addEventListener('dn-craft-kept',()=>setTimeout(backfillArtwork,0));
    window.addEventListener('dn-strategies-changed',event=>{if(event.detail?.reason==='profile')setTimeout(backfillArtwork,0);});
    window.addEventListener('online',()=>setTimeout(backfillArtwork,0));
    if(window.DNArtwork)setTimeout(backfillArtwork,0);
  }
  const changes=typeof window.BroadcastChannel==='function'?new window.BroadcastChannel('dn-stored-artifacts'):null;
  function announce(profileKey=collectionKey()) {
    changes?.postMessage({profileKey});
    if(typeof window.CustomEvent==='function')window.dispatchEvent(new window.CustomEvent('dn-artifacts-changed',{detail:{profileKey}}));
  }
  if(changes)changes.onmessage=event=>{
    if(typeof window.CustomEvent==='function')window.dispatchEvent(new window.CustomEvent('dn-artifacts-changed',{detail:event.data}));
  };
  function useCatalog(rows) {
    if(!Array.isArray(rows))throw new Error('Artifact catalog is not an array.');
    const catalog=rows.filter(row=>row.artifact_id!=='leftwich-trophy-legendary');
    catalogPromise=Promise.resolve(catalog);
    return catalog;
  }
  function loadCatalog() {
    if(!catalogPromise)catalogPromise=fetch('./data/artifacts.json').then(response=>{
      if(!response.ok)throw new Error('Could not load artifact names.');return response.json();
    }).then(useCatalog).catch(error=>{catalogPromise=null;throw error;});
    return catalogPromise;
  }
  function open() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('dn-stored-artifacts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('inventory', {keyPath:'id'});
      request.onsuccess = () => {
        const db=request.result,transaction=db.transaction('inventory','readwrite'),store=transaction.objectStore('inventory');
        const records=new Map(),cursor=store.openCursor();
        cursor.onsuccess=()=>{
          const entry=cursor.result;
          if(!entry){
            // Earlier Keep buttons left owned crafts in the pending scan inbox.
            // Recover each into its original profile without merging physical copies.
            const inbox=records.get('items');
            if(!inbox)return;
            const remaining=[];
            for(const item of inbox.items){
              if(!item.keptFromCraft || !item.profileId){remaining.push(item);continue;}
              const key='collection:'+item.profileId;
              const owned=records.get(key) || {id:key,items:[]};
              if(!owned.items.some(other=>other.id===item.id))owned.items.push(item);
              records.set(key,owned);store.put(owned);
            }
            if(remaining.length!==inbox.items.length)store.put({...inbox,items:remaining});
            return;
          }
          const record=entry.value;
          if(Array.isArray(record.items)) {
            const items=record.items.map(backfillItem);
            records.set(record.id,{...record,items});
            if(JSON.stringify(items)!==JSON.stringify(record.items))entry.update({...record,items});
          }
          entry.continue();
        };
        transaction.oncomplete=()=>resolve(db);
        transaction.onabort=transaction.onerror=()=>reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
    return opening;
  }
  function identify(items) {
    return items.map((item, index) => ({...item, id:item.id || 'scan-legacy-' + item.capturedAt + '-' + index}));
  }
  async function read(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('inventory', 'readonly').objectStore('inventory').get(key);
      request.onsuccess = () => {resolve(identify(request.result?.items || []));if(window.DNArtwork?.enabled())setTimeout(backfillArtwork,0);};
      request.onerror = () => reject(request.error);
    });
  }
  async function write(key, items) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', 'readwrite');
      transaction.objectStore('inventory').put({id:key, items:items.map(backfillItem)});
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  }
  async function readBackupRecords() {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('inventory','readonly');
      const request=transaction.objectStore('inventory').getAll();
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onabort=transaction.onerror=()=>reject(transaction.error);
    });
  }
  const catalogArtworkKey=profileKey=>'catalog-artwork:'+profileKey.replace(/^collection:/,'');
  const localArtwork=image=>typeof image==='string' && image.length<1000000 && /^data:image\/(?:jpeg|png|webp);base64,[a-z\d+/=]+$/i.test(image);
  async function readCatalogArtwork(profileKey=collectionKey()) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction('inventory','readonly').objectStore('inventory').get(catalogArtworkKey(profileKey));
      request.onsuccess=()=>resolve(request.result?.images || {});request.onerror=()=>reject(request.error);
    });
  }
  // Name/edition ownership and the artwork crop are independent of stat OCR.
  // Keep image-only records local; never manufacture a scanned stat snapshot.
  async function saveCatalogArtwork(item,catalog,{profileKey=collectionKey(),isCurrent=()=>true}={}) {
    const match=matchCatalog(item,catalog),owner=window.DNCloud?.user()?.id;
    if(!match || !localArtwork(item.image))return false;
    const current=()=>profileKey===collectionKey() && owner===window.DNCloud?.user()?.id && isCurrent() && window.DN.loadCollected().has(match.artifact_id);
    if(!current())return false;
    const db=await open();let changed=false;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('inventory','readwrite'),store=tx.objectStore('inventory'),request=store.get(catalogArtworkKey(profileKey));
      request.onsuccess=()=>{
        if(!current())return;
        const record=request.result || {id:catalogArtworkKey(profileKey),images:{}};
        if(record.images[match.artifact_id]===item.image)return;
        record.images[match.artifact_id]=item.image;
        const write=store.put(record);changed=true;write.onsuccess=()=>{if(!current())tx.abort();};
      };
      tx.oncomplete=()=>{if(changed)announce(profileKey);resolve(changed);};
      tx.onabort=tx.onerror=()=>reject(tx.error || new Error('The image changed before it could be saved.'));
    });
  }
  async function recoverArtwork(patches,isCurrent=()=>true){
    const grouped=new Map();
    for(const patch of patches || []){
      if((patch.record!=='items'&&!/^collection:[^:]+$/.test(patch.record))||!window.DNLocalArtworkRecovery?.local(patch.image))continue;
      if(!grouped.has(patch.record))grouped.set(patch.record,[]);grouped.get(patch.record).push(patch);
    }
    if(!grouped.size||!isCurrent())return 0;
    const db=await open();let restored=0;const changed=new Set();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('inventory','readwrite'),store=tx.objectStore('inventory');
      for(const [id,images] of grouped){const request=store.get(id);request.onsuccess=()=>{
        if(!isCurrent()||!request.result?.items)return;const record=request.result;let dirty=false;
        for(const patch of images){const item=record.items.find(item=>item.id===patch.id);if(!item||window.DNLocalArtworkRecovery.local(item.image))continue;item.image=patch.image;restored++;dirty=true;}
        if(dirty){store.put(record);changed.add(id);}
      };}
      tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
    });
    for(const id of changed)announce(id);return restored;
  }
  // Read only planner records for sync. Large diagnostic logs and artwork are
  // excluded by the transport serializer; the local database remains unchanged.
  async function readPlannerRecords(profileIds) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('inventory','readonly'),store=transaction.objectStore('inventory');
      const requests=['items',...profileIds.map(id=>'collection:'+id)].map(id=>({id,request:store.get(id)}));
      transaction.oncomplete=()=>resolve(requests.map(({id,request})=>request.result || {id,items:[]}));
      transaction.onabort=transaction.onerror=()=>reject(transaction.error);
    });
  }
  // The synchronous settings write runs before this transaction commits. An error
  // aborts the artifact restore; the caller restores the previous settings too.
  async function restoreBackupRecords(records,writeSettings) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('inventory','readwrite'),store=transaction.objectStore('inventory');
      let failure;
      transaction.oncomplete=()=>{announce();resolve();};
      transaction.onabort=transaction.onerror=()=>reject(failure || transaction.error);
      try {
        store.clear();
        for(const record of records)store.put(record);
        writeSettings();
      } catch(error) {failure=error;transaction.abort();}
    });
  }
  async function remove(id,{inventory=false}={}) {
    const key=inventory?'items':collectionKey(), db=await open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('inventory','readwrite'),store=transaction.objectStore('inventory'),request=store.get(key);let removed;
      request.onsuccess=()=>{removed=request.result?.items?.find(item=>item.id===id);store.put({id:key,items:(request.result?.items || []).filter(item=>item.id!==id)});};
      if(!inventory){const artwork=store.get(catalogArtworkKey(key));artwork.onsuccess=()=>{const record=artwork.result;if(record?.images?.[id]){delete record.images[id];store.put(record);}};}
      transaction.oncomplete=()=>{
        if(!inventory && removed?.catalogId && key===collectionKey()) {
          const owned=window.DN.loadCollected();owned.delete(removed.catalogId);
          try {window.DN.lsSet(window.DN.COLLECTED_KEY,JSON.stringify([...owned]));}catch(error){reject(error);return;}
        }
        announce(key);resolve();
      };
      transaction.onabort=transaction.onerror=()=>reject(transaction.error);
    });
  }
  async function update(id, changes) {
    const key=collectionKey(),db=await open();
    return new Promise((resolve,reject)=>{
      let updated;
      const transaction=db.transaction('inventory','readwrite'),store=transaction.objectStore('inventory'),request=store.get(key);
      request.onsuccess=()=>{
        const record=request.result,index=record?.items?.findIndex(item=>item.id===id);
        if(index==null || index<0){transaction.abort();return;}
        updated=backfillItem({...record.items[index],...changes,id,updatedAt:new Date().toISOString()});
        record.items[index]=updated;store.put(record);
      };
      transaction.oncomplete=()=>{announce(key);try{window.DNTelemetry?.event('artifact_updated',{source:'collection'},true);}catch{}resolve(updated);};
      transaction.onabort=transaction.onerror=()=>reject(transaction.error || new Error('Artifact no longer exists.'));
    });
  }
  const collectionKey = () => 'collection:' + window.DN.activeProfileId();
  const catalogName = value => String(value || '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]/gu,'');
  // A special artifact's title identifies the item; its row count identifies
  // the Legendary/Mythical edition, even when banner OCR is missing or wrong.
  function matchCatalog(item, catalog) {
    const grade=item.rows?.length===6?'Mythical':item.rows?.length===5?'Legendary':null;
    const name=catalogName(item.name),hall=String(item.hall || '').toLowerCase();
    if(!grade || !name)return null;
    const matches=catalog.filter(row=>row.artifact_id!=='leftwich-trophy-legendary' && row.grade===grade &&
      (!hall || String(row.hall).toLowerCase()===hall) &&
      [row.name,row.alternate_name].some(title=>title && catalogName(title)===name));
    return matches.length===1?matches[0]:null;
  }
  function markCatalogOwned(items,catalog,{profileKey=collectionKey(),isCurrent=()=>true}={}) {
    if(profileKey!==collectionKey() || !isCurrent())return [];
    const matches=items.map(item=>matchCatalog(item,catalog)).filter(Boolean),owned=window.DN.loadCollected();
    let changed=false;
    for(const row of matches)if(!owned.has(row.artifact_id)){owned.add(row.artifact_id);changed=true;}
    if(changed)window.DN.lsSet(window.DN.COLLECTED_KEY,JSON.stringify([...owned]));
    return matches;
  }
  function linkCatalogItem(item,catalog,{legacy=false}={}) {
    const match=matchCatalog(item,catalog);
    if(!match)return item;
    return {...item,id:match.artifact_id,catalogId:match.artifact_id,name:match.name,hall:match.hall.toLowerCase(),
      type:(match.hall==='War'?'War ':'')+match.grade,
      ...(legacy && item.id!==match.artifact_id?{legacyIds:[...new Set([...(item.legacyIds || []),item.id])]}:{})};
  }
  function catalogRows(catalog,items,{includeOrdinary=false}={}) {
    const rows=new Map(catalog.map(row=>[row.artifact_id,row]));
    for(const item of items) {
      if(!item.catalogId && !includeOrdinary)continue;
      const row=toRow(item);rows.set(row.artifact_id,{...rows.get(row.artifact_id),...row});
    }
    return [...rows.values()];
  }
  function migrateReferences(items) {
    const aliases=new Map(items.flatMap(item=>(item.legacyIds || []).map(id=>[id,item.id])));
    if(!aliases.size)return;
    const replace=id=>aliases.get(id) || id,state=window.DN.loadStrategies();let changed=false;
    for(const strategy of state.strategies)for(const hall of ['Main','War']) {
      const layout=strategy.loadout[hall],before=JSON.stringify(layout);
      layout.mains=[...new Set(layout.mains.map(replace))];layout.hermitage=replace(layout.hermitage);
      layout.scannedPlaced=[...new Set(layout.scannedPlaced.map(replace))];
      layout.singles=Object.fromEntries(Object.entries(layout.singles).map(([id,value])=>[replace(id),value]));
      changed ||= before!==JSON.stringify(layout);
    }
    if(changed)window.DN.saveStrategies(state);
    const levels=window.DN.loadLevels();let levelsChanged=false;
    for(const [id,target] of aliases)if(levels[id]){levels[target] ??= levels[id];delete levels[id];levelsChanged=true;}
    if(levelsChanged)window.DN.saveLevels(levels);
  }
  // Convert old scan IDs and staged special items to one profile-owned catalog
  // identity. Linked stats remain cached when the ownership checkbox is cleared.
  async function reconcileCatalog(catalog,{profileKey=collectionKey()}={}) {
    useCatalog(catalog);
    const db=await open();
    const result=await new Promise((resolve,reject)=>{
      const transaction=db.transaction('inventory','readwrite'),store=transaction.objectStore('inventory');
      const owned=store.get(profileKey),inbox=store.get('items');let pending=2,result;
      const finish=()=>{
        if(--pending)return;
        const before=identify(owned.result?.items || []),inventory=identify(inbox.result?.items || []);
        result={collection:before,items:inventory,profileKey,changed:false};
        if(profileKey!==collectionKey())return;
        const special=inventory.filter(item=>item.reviewed && (!item.profileId || 'collection:'+item.profileId===profileKey) && matchCatalog(item,catalog));
        const collection=[],byId=new Map(),newlyLinked=[];
        for(const original of [...before,...special]) {
          const item=original.reviewed?linkCatalogItem(original,catalog,{legacy:true}):original;
          if(item.catalogId && !original.catalogId)newlyLinked.push(item);
          const previous=byId.get(item.id);
          if(!previous){byId.set(item.id,item);collection.push(item);continue;}
          const merged=passiveMerge([previous],[item]),next=merged.collection[0];
          const combined={...next,legacyIds:[...new Set([...(previous.legacyIds || []),...(item.legacyIds || [])])],
            revisions:[...(next.revisions || []),{at:new Date().toISOString(),reason:'catalog-link',id:original.id,rows:item.rows}]};
          byId.set(item.id,combined);collection[collection.indexOf(previous)]=combined;
        }
        const moved=new Set(special.map(item=>item.id)),items=inventory.filter(item=>!moved.has(item.id));
        result={collection,items,profileKey,changed:JSON.stringify(before)!==JSON.stringify(collection) || special.length>0};
        try {
          if(result.changed){store.put({id:profileKey,items:collection});if(special.length)store.put({id:'items',items});}
          // Do not re-collect an already linked item the user has unchecked.
          markCatalogOwned(newlyLinked,catalog,{profileKey});
        } catch(error){transaction.abort();reject(error);}
      };
      owned.onsuccess=inbox.onsuccess=finish;
      transaction.oncomplete=()=>resolve(result);
      transaction.onabort=transaction.onerror=()=>reject(transaction.error || new Error('Artifact linking failed.'));
    });
    if(profileKey===collectionKey())migrateReferences(result.collection);
    if(result.changed)announce(profileKey);
    return result;
  }
  const normalize = value => String(value || '').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
  const identity = item => JSON.stringify([normalize(item.name),normalize(item.hall),normalize(item.type).replace(/^war /,'')]);
  const matchingIdentity=(other,item)=>(other.catalogId && item.catalogId?other.catalogId===item.catalogId:identity(other)===identity(item)) &&
    !(other.keptFromCraft && item.keptFromCraft && other.id!==item.id);
  function impliedRange(row) {
    if (['Mercenary Camp Deploys Spartans when Destroyed','APC Deploys Marines On Death','Castle spawns Sword Saints when Destroyed'].includes(row.name)) {
      return Number.isFinite(row.value)?{base:row.value,max:row.value}:null;
    }
    if(!Number.isFinite(row.value) || !Number.isInteger(row.level) || row.level<1 || row.level>10)return null;
    const magnitude=Math.abs(row.value)-(row.level-1), sign=Math.sign(row.value);
    if(!sign || magnitude<=0)return null;
    return {base:sign*magnitude,max:sign*(magnitude+9)};
  }
  const tierNames=['white','green','blue'];
  function tierBases({hall,type,crafting=false}={}) {
    if(window.DNArtifactStatContext)return window.DNArtifactStatContext.tierBases({hall,type,crafting});
    const category=normalize(type).replace(/^war /,'');
    if(!['main','war'].includes(normalize(hall)) || /legendary|mythical/.test(category))return null;
    const war=/^war /i.test(normalize(type)) || normalize(hall)==='war',allowed=war?['weapon','armor','equipment']:['weapon','armor','jewelry','jewellery','pottery'];
    if(!allowed.includes(category) && !(crafting && !category))return null;
    if(!war)return [1,6,11];
    return [1,3,6];
  }
  function tierMetadata(row,context) {
    const bases=tierBases(context),unknown={tier:null,tierSource:null,tierConflict:!!row.tierConflict};
    if(!bases)return {...unknown,tierConflict:false};
    if(row.tierConflict)return unknown;
    const manual=row.rangeSource==='manual';
    const range=manual?row:impliedRange(row);
    if(!range)return unknown;
    const index=Number.isFinite(range.base) && Number.isFinite(range.max) && Math.sign(range.base)===Math.sign(range.max) &&
      Math.abs(range.max)===Math.abs(range.base)+9?bases.indexOf(Math.abs(range.base)):-1;
    if(index<0)return {...unknown,tierConflict:manual || unknown.tierConflict};
    const numeric=manual?impliedRange(row):null;
    if(numeric && numeric.base!==range.base)return {...unknown,tierConflict:true};
    const tier=tierNames[index];
    return {tier,tierSource:manual || row.tierSource==='manual' && row.tier===tier?'manual':row.levelSource==='base-tier'?'unique-percentage':'percentage-level',tierConflict:false};
  }
  function craftingTier(row,{hall,type}={}) {
    const bases=tierBases({hall,type,crafting:true});
    const colourTier={neutral:'white',white:'white',green:'green',blue:'blue'}[row.colour] || null;
    if(!bases)return {...row,tier:null,tierSource:null,tierConflict:false};
    const numeric=(!row.inferred || row.tierSource==='manual') && Number.isFinite(row.value)?Math.abs(row.value):null;
    const numericTier=numeric!==null?tierNames[bases.indexOf(numeric)] || null:null;
    const manual=row.tierSource==='manual';
    const directNumeric=!!numericTier && row.known===true && row.hasPercent===true && !row.assumed && !row.inferred && !row.conflict && Math.sign(row.value)===window.DN?.expectedPerkSign?.(row.name);
    const colourTierMismatch=colourTier!==null && numeric!==null && colourTier!==numericTier;
    // Legal signed OCR is stronger evidence than a dimmed/grey glyph swatch.
    // Keep actual OCR disagreements and inferred values excluded from scoring.
    const conflict=!!row.conflict || !manual && colourTierMismatch && !directNumeric;
    const useNumeric=directNumeric && colourTierMismatch;
    const tier=conflict?null:manual || useNumeric?numericTier:colourTier || numericTier;
    const sign=Number.isFinite(row.value) && row.value!==0?Math.sign(row.value):row.known?window.DN?.expectedPerkSign?.(row.name) ?? (/^invading\b/i.test(row.name)?-1:null):null;
    const magnitude=tier?bases[tierNames.indexOf(tier)]:null;
    return {...row,level:1,levelSource:'crafting',tier,tierSource:tier?manual?'manual':useNumeric?'starting-percentage':colourTier?'colour':'starting-percentage':null,tierConflict:conflict,colourTierMismatch,
      base:magnitude!==null && sign?sign*magnitude:null,max:magnitude!==null && sign?sign*(magnitude+9):null,
      rangeSource:tier && sign?manual?'manual':useNumeric?'starting-percentage':colourTier?'colour':'starting-percentage':null,
      rangeReview:conflict?'Text colour and starting percentage conflict. Verify this stat.':null};
  }
  function inferStorageRow(row,context) {
    if(row.unlocked===false && row.level!==1) {
      row={...row,observedLevel:row.level ?? null,level:1,levelSource:'locked-star',
        inferredFields:[...new Set([...(row.inferredFields || []),'level'])],
        ...(row.rangeSource!=='manual'?{base:null,max:null,rangeSource:null}:{} )};
    }
    const bases=tierBases(context);
    if(!bases)return row;
    const tier=['manual','percentage-level','unique-percentage'].includes(row.tierSource)?row.tier:row.tierEvidence;
    const index=tierNames.indexOf(tier),base=bases[index];
    if(index<0)return row;
    const hasValue=Number.isFinite(row.value),hasLevel=Number.isInteger(row.level) && row.level>=1 && row.level<=10;
    if(hasValue && hasLevel) {
      // Accurate numeric reads take priority over previously recorded tier evidence.
      return row.tierSource==='manual' && Math.abs(row.value)-(row.level-1)!==base
        ? {...row,tierConflict:true}:row;
    }
    if(!hasValue && hasLevel) {
      const sign=row.known?window.DN?.expectedPerkSign?.(row.name):null;
      if(sign!==1 && sign!==-1)return row;
      return {...row,value:sign*(base+row.level-1),hasPercent:true,inferred:true,valueSource:'tier-level',
        inferredFields:[...new Set([...(row.inferredFields || []),'value'])]};
    }
    if(hasValue && !hasLevel) {
      const level=Math.abs(row.value)-base+1;
      if(!Number.isInteger(level) || level<1 || level>10)return {...row,tierConflict:true};
      return {...row,level,levelSource:'tier-percentage',
        inferredFields:[...new Set([...(row.inferredFields || []),'level'])]};
    }
    return row;
  }
  function backfillItem(item) {
    if(!Array.isArray(item?.rows))return item;
    const bases=tierBases(item),tiered=!!bases;
    const resolveRow=row=>{
      if (['Mercenary Camp Deploys Spartans when Destroyed','APC Deploys Marines On Death','Castle spawns Sword Saints when Destroyed'].includes(row.name)) {
        const range=impliedRange(row);
        return range?{...row,...range,rangeSource:'fixed-count',rangeReview:null}:row;
      }
      if(row.rangeSource==='manual' && Number.isFinite(row.base) && Number.isFinite(row.max))return row;
      if(tiered && Number.isFinite(row.value)) {
        const sign=Math.sign(row.value),magnitude=Math.abs(row.value);
        const candidates=bases.map(base=>({base:sign*base,max:sign*(base+9),level:magnitude-base+1}))
          .filter(candidate=>sign && Number.isInteger(candidate.level) && candidate.level>=1 && candidate.level<=10);
        // Previous scanner versions forced unlocked rows to level 1. Without
        // independent OCR/manual evidence, that level cannot resolve a tier.
        const trusted=!(row.unlocked===true && row.level===1 && !['ocr','manual','crafting','tier-percentage','base-tier','locked-star'].includes(row.levelSource));
        const matched=(trusted?candidates.find(candidate=>candidate.level===row.level):null) ||
          (row.rangeSource==='manual'?candidates.find(candidate=>candidate.base===row.base):null);
        const observed=trusted && Number.isInteger(row.level) && row.level>=1 && row.level<=10;
        const numericRange=observed?impliedRange(row):null;
        if(numericRange && !matched)return {...row,...numericRange,rangeSource:'inferred-level',rangeCandidates:[],rangeReview:null,tierConflict:false};
        const resolved=matched || (!observed && candidates.length===1?candidates[0]:null);
        if(resolved)return {...row,...resolved,levelSource:matched?row.levelSource || 'recorded':'base-tier',rangeSource:'inferred-tier',rangeCandidates:[],rangeReview:null,tierConflict:false};
        return {...row,level:observed?row.level:null,base:null,max:null,rangeSource:null,rangeCandidates:candidates,tierConflict:observed,
          rangeEvidence:row.rangeEvidence || {level:row.level ?? null,base:row.base ?? null,max:row.max ?? null},
          rangeReview:observed?'Percentage and upgrade level conflict with the '+(normalize(item.hall)==='war'?'War':'Main')+' tiers. Verify the value or level.':candidates.length?'Confirm the upgrade level or base tier.':'Value does not match ordinary base tiers; verify the percentage.'};
      }
      const next=row;
      const range=impliedRange(next);
      if(!range || next.base!=null && next.max!=null)return next;
      return {...next,base:next.base ?? range.base,max:next.max ?? range.max,rangeSource:next.rangeSource || 'inferred-level'};
    };
    return {...item,rows:item.rows.map(row=>{
      const special=/legendary|mythical/i.test(String(item.type || ''));
      const observed=Object.prototype.hasOwnProperty.call(row,'rerollEligible');
      row={...row,rerollEligible:special?false:observed && typeof row.rerollEligible==='boolean'?row.rerollEligible:
        !observed && (item.freshCraft===true || item.freshCraft!==false && row.levelSource==='crafting')?true:null,
        rerollSource:special?'artifact-type':row.rerollSource || (!observed && (item.freshCraft===true || item.freshCraft!==false && row.levelSource==='crafting')?'fresh-craft':null),
        rerollConfidence:special?'high':row.rerollConfidence || null};
      if(row.levelSource==='crafting')return craftingTier(row,item);
      row=inferStorageRow(row,item);
      if(row.tierConflict && (row.tierSource==='manual' || row.tierEvidence && !Number.isInteger(row.level)))return row;
      const resolved=resolveRow(row);
      return {...resolved,...tierMetadata(resolved,item)};
    })};
  }
  function statKey(row, ranges=false) {
    const range=ranges?impliedRange(row):null;
    return JSON.stringify(ranges?[normalize(row.name),range?.base,range?.max]:[normalize(row.name),row.value,row.level ?? null,row.tier ?? null]);
  }
  function signature(item, ranges=false) {
    if(ranges && item.rows.some(row=>row.tierConflict || !impliedRange(row)))return null;
    return JSON.stringify(item.rows.map(row=>statKey(row,ranges)).sort());
  }
  function alignRows(existing, incoming) {
    const buckets=new Map();
    for(const row of incoming.rows) {
      const key=statKey(row,true);
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(row);
    }
    for(const rows of buckets.values())rows.sort((a,b)=>Math.abs(a.value)-Math.abs(b.value));
    const ordered=existing.rows.map((row,index)=>({row,index})).sort((a,b)=>Math.abs(a.row.value)-Math.abs(b.row.value));
    const aligned=[];
    for(const {row,index} of ordered)aligned[index]=buckets.get(statKey(row,true)).shift();
    return aligned;
  }
  function withRanges(item) {
    const checked=backfillItem(item);
    return {...checked,rows:checked.rows.map(row=>{
      if(row.tierConflict || row.rangeSource==='manual')return row;
      const range=impliedRange(row);
      return range?{...row,...range,rangeSource:'inferred-level'}:{...row};
    })};
  }
  function merge(existing, incoming) {
    const collection=existing.map(backfillItem), result={added:0,updated:0,duplicates:0,blocked:0,consumedIds:[],issues:[]};
    for(const raw of identify(incoming)) {
      if(!raw.reviewed){result.blocked++;result.issues.push(raw.name+': verify this artifact first.');continue;}
      const item=withRanges(raw), candidates=collection.filter(other=>matchingIdentity(other,item));
      if(item.rows.some(row=>row.tierConflict)){result.blocked++;result.issues.push(item.name+': percentage and level or colour evidence conflict. Verify the tier.');continue;}
      const range=signature(item,true), sameRange=range && candidates.find(other=>signature(other,true)===range);
      const exact=candidates.find(other=>signature(other)===signature(item));
      if(sameRange) {
        const aligned=alignRows(sameRange,item);
        const changed=aligned.some((row,index)=>row.value!==sameRange.rows[index].value ||
          row.level!==sameRange.rows[index].level ||
          (row.unlocked!=null && row.unlocked!==sameRange.rows[index].unlocked) ||
          (typeof row.rerollEligible==='boolean' && row.rerollEligible!==sameRange.rows[index].rerollEligible));
        if(changed) {
          collection[collection.indexOf(sameRange)]={...sameRange,...item,id:sameRange.id,
            acceptedAt:sameRange.acceptedAt,updatedAt:new Date().toISOString(),image:item.image || sameRange.image,
            rows:aligned.map((row,index)=>({...row,unlocked:row.unlocked ?? sameRange.rows[index].unlocked,
              ...(row.rerollEligible==null && typeof sameRange.rows[index].rerollEligible==='boolean'?{
                rerollEligible:sameRange.rows[index].rerollEligible,rerollSource:sameRange.rows[index].rerollSource,
                rerollConfidence:sameRange.rows[index].rerollConfidence}:{} )}))};
          result.updated++;
        } else result.duplicates++;
      } else if(exact) {
        const buckets=new Map();
        item.rows.forEach(row=>{const key=statKey(row);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(row);});
        let enriched=false;
        const rows=exact.rows.map(row=>{
          const incoming=buckets.get(statKey(row)).shift();
          if(row.rerollEligible!=null || typeof incoming.rerollEligible!=='boolean')return row;
          enriched=true;
          return {...row,rerollEligible:incoming.rerollEligible,rerollSource:incoming.rerollSource,
            rerollConfidence:incoming.rerollConfidence,rerollEvidence:incoming.rerollEvidence};
        });
        if(enriched){collection[collection.indexOf(exact)]={...exact,rows,updatedAt:new Date().toISOString()};result.updated++;}
        else result.duplicates++;
      } else if(candidates.some(other=>other.id===item.id))result.duplicates++;
      else {
        const shape=JSON.stringify(item.rows.map(row=>normalize(row.name)).sort());
        const uncertain=candidates.some(other=>JSON.stringify(other.rows.map(row=>normalize(row.name)).sort())===shape && (!range || !signature(other,true)));
        if(uncertain){result.blocked++;result.issues.push(item.name+': verify every upgrade level to distinguish this scan from the existing artifact.');continue;}
        collection.push({...item,acceptedAt:new Date().toISOString()});result.added++;
      }
      result.consumedIds.push(item.id);
    }
    return {...result,collection};
  }
  // Passive capture may improve a uniquely matched record, never lower it or
  // choose between indistinguishable copies. Explicit legacy merge stays separate.
  function passivePlan(existing, raw,{allowCorrection=false}={}) {
    const item=withRanges(raw),candidates=existing.map(backfillItem).filter(other=>matchingIdentity(other,item));
    if(!item.reviewed || item.rows.some(row=>row.tierConflict))return {action:'blocked',reason:'Verify the conflicting or incomplete scan.'};
    const range=signature(item,true),matching=range?candidates.filter(other=>signature(other,true)===range):[];
    const captured=existing.find(other=>other.id===item.id);
    const captureSignature=scan=>JSON.stringify([identity(scan),scan.rows.map(row=>[normalize(row.name),row.value,row.level,row.tier,row.base,row.max,row.unlocked,row.rerollEligible])]);
    if(allowCorrection && raw.manualCorrection && captured && captureSignature(backfillItem(captured))!==captureSignature(item))return {action:'updated',id:captured.id,correction:true};
    const changes=other=>{
      const rows=alignRows(other,item);
      return {rows,improved:rows.some((row,i)=>Math.abs(row.value)>Math.abs(other.rows[i].value) || row.level>other.rows[i].level || row.unlocked===true && other.rows[i].unlocked===false),
        worse:rows.some((row,i)=>Math.abs(row.value)<Math.abs(other.rows[i].value) || row.level<other.rows[i].level || row.unlocked===false && other.rows[i].unlocked===true)};
    };
    if(matching.some(other=>{const change=changes(other);return !change.improved && !change.worse;}))return {action:'duplicate',reason:'Identical stat values are already saved.'};
    if(matching.length>1)return {action:'blocked',reason:'Several saved copies match. No existing copy was replaced.'};
    if(matching.length===1) {
      const change=changes(matching[0]);
      if(change.worse || !change.improved)return {action:'unchanged',reason:'The saved version has equal or better stats. It was left unchanged.'};
      return {action:'updated',id:matching[0].id};
    }
    if(captured)return {action:'blocked',reason:'This capture is already saved with different stat tiers. Verify the edited fields.'};
    const shape=JSON.stringify(item.rows.map(row=>normalize(row.name)).sort());
    if(candidates.some(other=>signature(other)===signature(item)))return {action:'duplicate',reason:'Identical stat values are already saved.'};
    if(candidates.some(other=>JSON.stringify(other.rows.map(row=>normalize(row.name)).sort())===shape && (!range || !signature(other,true))))return {action:'blocked',reason:'Verify the upgrade levels to resolve the saved match.'};
    return {action:'added'};
  }
  function passiveMerge(existing, incoming,options={}) {
    let collection=existing.map(backfillItem);
    const result={added:0,updated:0,duplicates:0,blocked:0,consumedIds:[],issues:[]};
    for(const item of identify(incoming)) {
      const plan=passivePlan(collection,item,options);
      if(plan.action==='blocked'){result.blocked++;result.issues.push(item.name+': '+plan.reason);continue;}
      if(plan.action==='duplicate' || plan.action==='unchanged')result.duplicates++;
      else {
        const before=collection.find(other=>other.id===plan.id);
        if(plan.correction){collection=collection.map(other=>other.id===plan.id?{...other,...item,id:other.id,acceptedAt:other.acceptedAt,updatedAt:new Date().toISOString()}:other);result.updated++;}
        else {const merged=merge(collection,[item]);collection=merged.collection;result.added+=merged.added;result.updated+=merged.updated;}
        if(before)collection=collection.map(other=>other.id===before.id?{...other,revisions:[...(before.revisions || []),{at:new Date().toISOString(),reason:plan.correction?'manual-correction':'stat-improvement',rows:before.rows}]}:other);
      }
      result.consumedIds.push(item.id);
    }
    return {...result,collection};
  }
  async function saveScan(item,{profileKey=collectionKey(),isCurrent=()=>true}={}) {
    item=linkCatalogItem(item,await loadCatalog());
    const db=await open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('inventory','readwrite'),records=transaction.objectStore('inventory');
      const owned=records.get(profileKey),inventory=records.get('items');let pending=2,result;
      function finish() {
        if(--pending)return;
        const collection=identify(owned.result?.items || []),items=identify(inventory.result?.items || []);
        result={action:'cancelled',collection,items,profileKey};
        if(profileKey!==collectionKey() || !isCurrent() || item.catalogId && !window.DN.loadCollected().has(item.catalogId))return;
        const correction=!!item.catalogId && !!item.manualCorrection;
        const ownedPlan=passivePlan(collection,item,{allowCorrection:correction}),target=item.catalogId || ownedPlan.action!=='added'?'collection':'inventory';
        const plan=target==='collection'?ownedPlan:passivePlan(items,item,{allowCorrection:true});
        result={...result,...plan,target};
        if(plan.action!=='added' && plan.action!=='updated')return;
        const merged=passiveMerge(target==='collection'?collection:items,[item],{allowCorrection:target==='inventory' || correction});
        if(target==='collection')result.collection=merged.collection;else result.items=merged.collection;
        const write=records.put({id:target==='collection'?profileKey:'items',items:merged.collection});
        write.onsuccess=()=>{if(profileKey!==collectionKey() || !isCurrent())transaction.abort();};
      }
      owned.onsuccess=inventory.onsuccess=finish;
      transaction.oncomplete=()=>{if(['added','updated'].includes(result?.action)){announce(profileKey);try{window.DNTelemetry?.event('artifact_saved',{source:'storage',action:result.action,count:1},true);window.DNTelemetry?.milestone('first-artifact-saved');}catch{}}resolve(result);};
      transaction.onabort=transaction.onerror=()=>reject(transaction.error || new Error('The scan changed before it could be saved.'));
    });
  }
  // An explicit Keep represents a physical craft. Its encounter ID prevents a
  // double click from saving twice; separate identical crafts remain distinct.
  async function keepCraft(item,{profileKey=collectionKey()}={}) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('inventory','readwrite'),records=transaction.objectStore('inventory');
      const owned=records.get(profileKey),inventory=records.get('items');let pending=2,result;
      function finish(){
        if(--pending)return;
        const items=identify(inventory.result?.items || []),collection=identify(owned.result?.items || []);
        result={action:'cancelled',items,collection};
        if(profileKey!==collectionKey())return;
        if(collection.some(other=>other.id===item.id)){
          result.action='duplicate';return;
        }
        collection.push({...backfillItem(item),acceptedAt:new Date().toISOString()});
        const remaining=items.filter(other=>other.id!==item.id);
        result={action:'added',items:remaining,collection};
        if(remaining.length!==items.length)records.put({id:'items',items:remaining});
        const write=records.put({id:profileKey,items:collection});
        write.onsuccess=()=>{if(profileKey!==collectionKey())transaction.abort();};
      }
      owned.onsuccess=inventory.onsuccess=finish;
      transaction.oncomplete=()=>resolve(result);
      transaction.onabort=transaction.onerror=()=>reject(transaction.error || new Error('Profile changed before this craft could be kept.'));
    });
  }
  async function accept(items) {
    const key=collectionKey();
    const catalog=await loadCatalog();
    const sourceIds=new Map();
    for(const item of items){const id=linkCatalogItem(item,catalog).id;sourceIds.set(id,[...(sourceIds.get(id) || []),item.id]);}
    items=items.map(item=>linkCatalogItem(item,catalog));
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', 'readwrite'), store = transaction.objectStore('inventory');
      let result, pending=2;
      const collection=store.get(key), inventory=store.get('items');
      function finish() {
        if(--pending)return;
        if(key!==collectionKey()) {
          result={added:0,updated:0,duplicates:0,blocked:0,consumedIds:[],issues:[],cancelled:true,
            collection:collection.result?.items || [],remainingInventory:identify(inventory.result?.items || [])};
          return;
        }
        result=passiveMerge(collection.result?.items || [],items);
        const consumed=new Set(result.consumedIds.flatMap(id=>[id,...(sourceIds.get(id) || [])]));
        result.remainingInventory=identify(inventory.result?.items || []).filter(item=>!consumed.has(item.id));
        for(const record of [{id:key,items:result.collection},{id:'items',items:result.remainingInventory}]) {
          const write=store.put(record);write.onsuccess=()=>{if(key!==collectionKey())transaction.abort();};
        }
      }
      collection.onsuccess=inventory.onsuccess=finish;
      transaction.oncomplete = () => {
        try {markCatalogOwned(items.filter(item=>item.catalogId && result.consumedIds.includes(item.id)),catalog,{profileKey:key});announce(key);resolve(result);}
        catch(error){reject(error);}
      };
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  }
  // Ranges are separate from the captured current value. Unknown endpoints stay unknown.
  function toRow(item) {
    const row = {artifact_id:item.id, name:item.name, hall:item.hall === 'war' ? 'War' : 'Main',
      grade:item.type.replace(/^War /, ''), scanned:item, perk_count:String(item.rows.length)};
    item.rows.forEach((perk, index) => {
      row['perk_' + (index + 1) + '_name'] = perk.name;
      row['perk_' + (index + 1) + '_base'] = String(perk.base ?? perk.value ?? '');
      row['perk_' + (index + 1) + '_max'] = perk.max == null ? '' : String(perk.max);
    });
    return row;
  }
  window.DNStoredArtifacts = {read, write, readBackupRecords, readPlannerRecords, restoreBackupRecords, readCatalogArtwork, saveCatalogArtwork, recoverArtwork, accept, saveScan, keepCraft, passivePlan, passiveMerge, remove, update, identify, toRow, matchCatalog, markCatalogOwned, linkCatalogItem, catalogRows, reconcileCatalog, loadCatalog, useCatalog, collectionKey, impliedRange, tierBases, tierMetadata, craftingTier, inferStorageRow, backfillItem, merge,backfillArtwork,
    newId:() => 'scan-' + crypto.randomUUID()};
})();
