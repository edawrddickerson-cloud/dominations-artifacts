/* Authority: Reviewed artifact inventory and user-approved scanner tier capture.
 * Ownership: Shared local persistence, ranges and ordinary crafted tier mapping.
 * Invariants: Signed current values remain untouched; colour is tier evidence only
 * for crafting; missing/conflicting evidence stays explicit; special items have no
 * ordinary colour tier. Artwork stays in IndexedDB, with no uploads.
 * History: Tier/source metadata added to existing inventory, collection and logs. */
(() => {
  'use strict';
  let opening;
  function open() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('dn-stored-artifacts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('inventory', {keyPath:'id'});
      request.onsuccess = () => {
        const db=request.result,transaction=db.transaction('inventory','readwrite'),store=transaction.objectStore('inventory');
        const cursor=store.openCursor();
        cursor.onsuccess=()=>{
          const entry=cursor.result;if(!entry)return;
          const record=entry.value;
          if(Array.isArray(record.items)) {
            const items=record.items.map(backfillItem);
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
      request.onsuccess = () => resolve(identify(request.result?.items || []));
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
  async function remove(id) {
    const key=collectionKey(), db=await open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('inventory','readwrite'),store=transaction.objectStore('inventory'),request=store.get(key);
      request.onsuccess=()=>store.put({id:key,items:(request.result?.items || []).filter(item=>item.id!==id)});
      transaction.oncomplete=()=>resolve();
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
      transaction.oncomplete=()=>resolve(updated);
      transaction.onabort=transaction.onerror=()=>reject(transaction.error || new Error('Artifact no longer exists.'));
    });
  }
  const collectionKey = () => 'collection:' + window.DN.activeProfileId();
  const normalize = value => String(value || '').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
  const identity = item => JSON.stringify([normalize(item.name),normalize(item.hall),normalize(item.type).replace(/^war /,'')]);
  function impliedRange(row) {
    if(!Number.isFinite(row.value) || !Number.isInteger(row.level) || row.level<1 || row.level>10)return null;
    const magnitude=Math.abs(row.value)-(row.level-1), sign=Math.sign(row.value);
    if(!sign || magnitude<=0)return null;
    return {base:sign*magnitude,max:sign*(magnitude+9)};
  }
  const tierNames=['white','green','blue'];
  function tierBases({hall,type,crafting=false}={}) {
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
    const conflict=!!row.conflict || !manual && colourTier!==null && numeric!==null && colourTier!==numericTier;
    const tier=conflict?null:manual?numericTier:colourTier || numericTier;
    const sign=Number.isFinite(row.value) && row.value!==0?Math.sign(row.value):row.known?window.DN?.expectedPerkSign?.(row.name) ?? (/^invading\b/i.test(row.name)?-1:null):null;
    const magnitude=tier?bases[tierNames.indexOf(tier)]:null;
    return {...row,level:1,levelSource:'crafting',tier,tierSource:tier?manual?'manual':colourTier?'colour':'starting-percentage':null,tierConflict:conflict,
      base:magnitude!==null && sign?sign*magnitude:null,max:magnitude!==null && sign?sign*(magnitude+9):null,
      rangeSource:tier && sign?manual?'manual':colourTier?'colour':'starting-percentage':null,
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
    return JSON.stringify(ranges?[normalize(row.name),range?.base,range?.max]:[normalize(row.name),row.value]);
  }
  function signature(item, ranges=false) {
    if(ranges && item.rows.some(row=>row.tierConflict || !impliedRange(row)))return null;
    return JSON.stringify(item.rows.map(row=>statKey(row,ranges)).sort());
  }
  function rerollCompatible(a,b) {
    // Dice eligibility belongs to its ordered row, including repeated perks.
    if(a.rows.length!==b.rows.length)return false;
    if(a.rows.every(row=>row.rerollEligible==null) || b.rows.every(row=>row.rerollEligible==null))return true;
    let incoming=b.rows;
    if(signature(a,true) && signature(a,true)===signature(b,true))incoming=alignRows(a,b);
    return a.rows.every((row,i)=>{
      const next=incoming[i];
      return normalize(row.name)===normalize(next.name) &&
        (row.rerollEligible==null || next.rerollEligible==null || row.rerollEligible===next.rerollEligible);
    });
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
    const collection=existing.slice(), result={added:0,updated:0,duplicates:0,blocked:0,consumedIds:[],issues:[]};
    for(const raw of identify(incoming)) {
      if(!raw.reviewed){result.blocked++;result.issues.push(raw.name+': verify this artifact first.');continue;}
      const item=withRanges(raw), candidates=collection.filter(other=>identity(other)===identity(item) && rerollCompatible(other,item));
      if(item.rows.some(row=>row.tierConflict)){result.blocked++;result.issues.push(item.name+': percentage and level or colour evidence conflict. Verify the tier.');continue;}
      const range=signature(item,true), sameRange=range && candidates.find(other=>signature(other,true)===range);
      const exact=candidates.find(other=>signature(other)===signature(item));
      if(sameRange) {
        const aligned=alignRows(sameRange,item);
        const weaker=aligned.some((row,index)=>Math.abs(row.value)<Math.abs(sameRange.rows[index].value) ||
          (sameRange.rows[index].unlocked===true && row.unlocked===false));
        if(weaker){result.blocked++;result.issues.push(item.name+': at least one perk is weaker or has become locked.');continue;}
        const improved=aligned.some((row,index)=>Math.abs(row.value)>Math.abs(sameRange.rows[index].value) ||
          (row.unlocked===true && sameRange.rows[index].unlocked!==true) ||
          (typeof row.rerollEligible==='boolean' && sameRange.rows[index].rerollEligible==null));
        if(improved) {
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
  async function accept(items) {
    const key = collectionKey(), db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', 'readwrite'), store = transaction.objectStore('inventory');
      let result, pending=2;
      const collection=store.get(key), inventory=store.get('items');
      function finish() {
        if(--pending)return;
        result=merge(collection.result?.items || [],items);
        const consumed=new Set(result.consumedIds);
        result.remainingInventory=identify(inventory.result?.items || []).filter(item=>!consumed.has(item.id));
        store.put({id:key,items:result.collection});
        store.put({id:'items',items:result.remainingInventory});
      }
      collection.onsuccess=inventory.onsuccess=finish;
      transaction.oncomplete = () => resolve(result);
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
  window.DNStoredArtifacts = {read, write, accept, remove, update, identify, toRow, collectionKey, impliedRange, tierBases, tierMetadata, craftingTier, inferStorageRow, backfillItem, merge,
    newId:() => 'scan-' + crypto.randomUUID()};
})();
