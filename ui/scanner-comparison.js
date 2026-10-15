/* Authority: User-requested capture percentage and top-two benchmark, October 2026.
 * Ownership: Crafting summary and same-type, same-hall collection comparison.
 * Invariants: Shared maximum weighted scoring; ties do not displace owned items;
 * inferred/estimated fields are not captured evidence. Logs are not ownership. */
(() => {
  'use strict';
  const DN=window.DN;
  const hallName=value=>String(value || '').toLowerCase()==='war'?'War':'Main';
  const typeName=value=>String(value || '').trim().replace(/^war[ -]/i,'').toLowerCase();
  function statRow(rows) {
    const row={};
    rows.forEach((perk,index)=>{row['perk_'+(index+1)+'_name']=perk.name;row['perk_'+(index+1)+'_base']=String(perk.value);row['perk_'+(index+1)+'_max']='';});
    return row;
  }
  function estimate(result,{names,options,hall,expectedRows=5}) {
    if(!result?.rows || expectedRows!==5 || result.rows.length>5)return null;
    const usable=row=>row?.known && !!row.name && Number.isFinite(row.value) && !row.conflict;
    const rows=Array.from({length:5},(_,index)=>result.rows[index]);
    const captured=rows.filter(usable).length;
    if(captured<4)return null;
    if(result.valid && captured===5)return result;
    let assumption='All five stats scored provisionally; OCR needs review.';
    if(captured===4) {
      const index=rows.findIndex(row=>!usable(row)),missing=rows[index];
      // An optimistic placeholder is only a scoring scenario. Never write it
      // into the recognised result, saved log, or correction form.
      let name=missing?.known && !missing.conflict?missing.name:null;
      const magnitude=Number.isFinite(missing?.value) && !missing.conflict?Math.abs(missing.value):hallName(hall)==='War'?6:11;
      if(!name) {
        let best=-Infinity;
        for(const candidate of names) {
          const value=(options.prefSortAxes.offensive?options.ratingOf(candidate,'offensive'):0)+(options.prefSortAxes.defensive?options.ratingOf(candidate,'defensive'):0);
          if(value>best){name=candidate;best=value;}
        }
      }
      if(!name)return null;
      const value=(DN.expectedPerkSign?.(name) ?? (/^invading\b/i.test(name)?-1:1))*magnitude;
      rows[index]={name,value,known:true,estimated:true};
      assumption='4/5 read · Assume '+name+' '+(value>=0?'+':'')+value+'% for row '+(index+1)+'.';
    }
    return {...result,rows,valid:true,provisional:true,assumption};
  }
  function currentRows(row,options,levels={}) {
    const id=DN.artifactKey(row), revision=row.scanned && (Date.parse(row.scanned.updatedAt || row.scanned.capturedAt) || 0);
    const outdated=row.scanned && levels[id]?._scanRevision!==revision;
    const saved=outdated?{}:levels[id] || {};
    return DN.perksOf(row,options.canonPerk).map(perk=>{
      const scan=row.scanned?.rows[perk.index-1],range=scan?{base:scan.base,max:scan.max}:DN.effectivePerkRange(perk);
      const stored=saved[String(perk.index)];
      const value=stored!=null && Number.isFinite(Number(stored)) && Number.isFinite(range.base) && Number.isFinite(range.max)
        ?DN.clampPerkLevel(range.base,range.max,Number(stored)):scan?scan.value:range.base;
      return {name:perk.name,value};
    });
  }
  function maxRows(row,options) {
    return DN.perksOf(row,options.canonPerk).map(perk=>{
      const scan=row.scanned?.rows[perk.index-1];
      const range=scan?{max:scan.max ?? window.DNStoredArtifacts.impliedRange(scan)?.max}:DN.effectivePerkRange(perk);
      return {name:perk.name,value:range.max,rerollEligible:scan?.rerollEligible ?? (/legendary|mythical/i.test(row.grade)?false:null)};
    });
  }
  function captureCompleteness(result) {
    const rows=Array.from({length:5},(_,i)=>result?.rows?.[i]);
    const names=rows.filter(row=>row?.known && row.name && !row.assumed && !row.estimated && !row.conflict).length;
    const values=rows.filter(row=>Number.isFinite(row?.value) && row.hasPercent!==false && !row.inferred && !row.estimated && !row.conflict).length;
    const stars=rows.filter((row,i)=>typeof (result?.unlocked?.states?.[i] ?? row?.unlocked)==='boolean').length;
    const type=!!result?.artifact?.type && !result.metadataConflict;
    const hall=result?.hallSource==='hall-colour' && ['main','war'].includes(result.hall);
    const diceRows=rows.filter(row=>row?.rerollSource==='dice-background');
    const dice=diceRows.filter(row=>typeof row.rerollEligible==='boolean' && row.rerollConfidence==='high').length;
    const captured=names+values+stars+Number(type)+Number(hall)+dice,expected=17+diceRows.length;
    return {captured,expected,percent:Math.round(captured/expected*100),names,values,stars,type,hall,dice,diceExpected:diceRows.length};
  }
  function craftScore(result,options) {
    if(!result?.valid || !result.rows?.length || result.rows.some(row=>!row.name || !Number.isFinite(row.value)))return null;
    return craftPotential(result,options).potentialPreference;
  }
  function craftPotential(result,options) {
    return window.DNArtifactScoring.comparisonScore(statRow(result.rows.map(perk=>({...perk,value:Math.sign(perk.value)*(Math.abs(perk.value)+9)}))),options,
      {hall:result.hall || result.artifact?.hall,grade:result.artifact?.type,
        eligible:result.rows.map(perk=>Object.prototype.hasOwnProperty.call(perk,'rerollEligible')?perk.rerollEligible:true)});
  }
  function compare(result,{type,hall,owned,options,levels={},limit=null}) {
    options=options?{...options,scoreMode:'combined'}:options;
    const normalized=typeName(type),grade=normalized.charAt(0).toUpperCase()+normalized.slice(1),slots=DN.artifactSlotCapacity(grade,hallName(hall));
    if(!slots || ['legendary','mythical'].includes(normalized))return {status:'type'};
    const capacity=Number.isInteger(limit) && limit>0?limit:slots;
    if(!options?.prefSortAxes.offensive && !options?.prefSortAxes.defensive)return {status:'axes',capacity};
    const scoringResult=result?{...result,hall:result.hall || hall}:result;
    const score=craftScore(scoringResult,options);
    const candidates=[],seen=new Set();let incomplete=0;
    for(const row of owned) {
      if(hallName(row.hall)!==hallName(hall) || typeName(row.grade)!==normalized)continue;
      const id=DN.artifactKey(row);if(seen.has(id))continue;seen.add(id);
      const rows=maxRows(row,options);
      if(!rows.length || rows.length!==Number(row.perk_count || row.scanned?.rows.length || rows.length) || rows.some(perk=>!perk.name || !Number.isFinite(perk.value))){incomplete++;continue;}
      const potential=window.DNArtifactScoring.comparisonScore(statRow(rows),options,{hall:row.hall,grade:row.grade,eligible:rows.map(perk=>perk.rerollEligible)});
      candidates.push({id,name:row.name,score:potential.potentialPreference,baseScore:potential.basePreference,uncertain:potential.rerollUncertain,possibleScore:potential.possiblePotentialPreference});
    }
    candidates.sort((a,b)=>b.score-a.score);
    if(incomplete)return {status:'incomplete',capacity,incomplete};
    const threshold=candidates[capacity-1]?.score ?? null;
    if(score===null)return {status:'unconfirmed',capacity,threshold,count:candidates.length,top:candidates.slice(0,capacity)};
    const rank=1+candidates.filter(item=>item.score>=score).length;
    // A tie does not displace an owned item. An underfilled group is a vacancy,
    // not evidence that the craft beats an existing top-N threshold.
    const potential=result?.valid?craftPotential(scoringResult,options):null;
    return {status:threshold===null?'vacancy':score>threshold?'better':score===threshold?'tie':'below',
      provisional:!!potential?.rerollUncertain || candidates.some(item=>item.uncertain),baseScore:potential?.basePreference,rerollGain:potential?.rerollGain,rerollIndex:potential?.rerollIndex,
      capacity,score,rank,threshold,count:candidates.length,top:candidates.slice(0,capacity)};
  }
  const isUnlockedKeeper=result=>result?.unlocked?.count===3;
  window.DNScannerComparisonCore={compare,currentRows,maxRows,statRow,estimate,isUnlockedKeeper,captureCompleteness,craftScore,craftPotential};
  const type=document.getElementById('scanner-compare-type');if(!type)return;
  const flag=document.getElementById('scanner-comparison'),detail=document.getElementById('scanner-comparison-detail'),hall=document.getElementById('scanner-hall');
  let latest=null,confirmed=false,options=null,owned=[],loading=true,error='',request=0,loadedProfile=null;
  let cataloguePromise;
  let categoryOrigin='remembered',categoryRead=null;
  let typeHall=null;
  let captureResult=null;
  let captureRetained=false;
  function showCategory() {
    const label=document.getElementById('scanner-category-label');
    const choice=document.getElementById('scanner-category-choice');
    if(choice)choice.hidden=!!type.value && categoryOrigin!=='override';
    if(label)label.textContent=type.value?type.value.charAt(0).toUpperCase()+type.value.slice(1)+' · '+categoryOrigin:'Category unread · choose a category';
  }
  function types() {
    typeHall=hallName(hall.value);
    const previous=['detected','unread'].includes(categoryOrigin)?type.value:DN.loadScannerArtifactType?.(hall.value) || type.value;
    type.innerHTML='<option value="">Choose item type</option>'+(DN.ARTIFACT_TYPE_EXHIBITS[hallName(hall.value)] || []).map(ex=>{
      const name=ex.key.replace(/^war-/,'');return '<option value="'+name+'">'+DN.esc(ex.label.replace(/ Exhibit$/,''))+'</option>';
    }).join('');
    if((DN.ARTIFACT_TYPE_EXHIBITS[hallName(hall.value)] || []).some(ex=>ex.key.replace(/^war-/,'')===previous))type.value=previous;
    showCategory();
  }
  function render() {
    const benchmark=document.getElementById('scanner-benchmark');
    if(!benchmark)return;
    const get=id=>document.getElementById('scanner-'+id),capture=captureCompleteness(captureResult);
    const board=get('glance-board');
    board.style.setProperty('--capture-hue',String(capture.percent*1.2));
    get('capture-percent').textContent=capture.percent+'%';
    get('capture-meter').value=capture.percent;
    get('capture-detail').textContent=capture.captured+' / '+capture.expected+' fields captured'+(captureRetained?' · Last read':'');
    board.title=capture.names+'/5 names · '+capture.values+'/5 percentages · '+capture.stars+'/5 stars · Type '+(capture.type?'read':'unread')+' · Hall '+(capture.hall?'read':'unread')+(capture.diceExpected?' · '+capture.dice+'/'+capture.diceExpected+' dice':'');
    benchmark.className='scanner-summary-card scanner-benchmark';
    const label=type.value?type.value.charAt(0).toUpperCase()+type.value.slice(1):'Item';
    get('item-type').textContent=label+' total';get('item-total').textContent='—';get('benchmark-value').textContent='—';
    flag.textContent='Waiting for an item';detail.textContent='';
    if(!options){flag.textContent='Waiting for an item';return;}
    if(!options.prefSortAxes.offensive && !options.prefSortAxes.defensive){flag.textContent='Select Off or Def';return;}
    const potential=confirmed && latest?.valid?craftPotential({...latest,hall:latest.hall || hall.value},options):null;
    const score=potential?.potentialPreference ?? null;
    if(score!==null)get('item-total').textContent=(latest.provisional || potential.rerollUncertain?'~':'')+score;
    if(!type.value){flag.textContent='Item type unread';return;}
    if(loading && loadedProfile!==DN.activeProfileId()){flag.textContent='Loading your collection…';return;}
    if(error){flag.textContent=error;return;}
    const comparison=compare(confirmed?latest:null,{type:type.value,hall:hall.value,owned,options,levels:DN.loadLevels(),limit:2});
    if(comparison.status==='incomplete'){flag.textContent='Benchmark unavailable · owned stats incomplete';return;}
    if(comparison.status==='type'){flag.textContent='Item type needs review';return;}
    get('benchmark-value').textContent=comparison.threshold===null?'Open slot':String(comparison.threshold);
    if(comparison.status==='unconfirmed'){flag.textContent=latest?'Stats need review':'Waiting for an item';return;}
    const qualifies=comparison.status==='better' || comparison.status==='vacancy';
    benchmark.classList.add(qualifies?'is-top-two':'is-below-cutoff');
    if(latest.provisional || comparison.provisional)benchmark.classList.add('is-provisional');
    flag.textContent=(latest.provisional || comparison.provisional?'Estimated · ':'')+(qualifies?'Makes top 2':comparison.status==='tie'?'Ties benchmark':'Below top 2');
    detail.textContent=comparison.threshold===null?comparison.count+' / 2 owned':
      (comparison.score-comparison.threshold>0?'+':'')+(comparison.score-comparison.threshold)+' points · Rank '+comparison.rank;
    detail.textContent+=' · Upgraded '+comparison.baseScore+' → Potential '+comparison.score+(comparison.rerollGain>0?' (+ '+comparison.rerollGain+' from stat '+(comparison.rerollIndex+1)+')':'')+(comparison.provisional?' · Reroll availability needs review':'');
  }
  async function refresh() {
    const ticket=++request,profile=DN.activeProfileId();loading=true;error='';render();
    try {
      if(!cataloguePromise)cataloguePromise=fetch('./data/artifacts.json',{cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('catalogue unavailable');const data=await response.json();if(!Array.isArray(data))throw new Error('invalid catalogue');return data;}).catch(reason=>{cataloguePromise=null;throw reason;});
      const [catalogue,scans]=await Promise.all([cataloguePromise,window.DNStoredArtifacts.read('collection:'+profile)]);
      if(ticket!==request || profile!==DN.activeProfileId())return;
      const collected=DN.loadCollected(),rows=new Map();
      for(const row of catalogue)if(collected.has(DN.artifactKey(row)))rows.set(DN.artifactKey(row),row);
      for(const item of scans){const row=window.DNStoredArtifacts.toRow(item);rows.set(DN.artifactKey(row),row);}
      owned=[...rows.values()];
      loadedProfile=profile;
    } catch {if(ticket===request)error='Could not load your collection. Refocus this window to retry.';}
    finally {if(ticket===request){loading=false;render();}}
  }
  window.DNScannerComparison={update(result,isConfirmed,opts,state={}){
    latest=result;confirmed=isConfirmed;options=opts;
    captureResult=Object.prototype.hasOwnProperty.call(state,'captureResult')?state.captureResult:result;
    captureRetained=!!state.captureRetained;
    const detectedResult=Object.prototype.hasOwnProperty.call(state,'categoryResult')?state.categoryResult:result;
    if(typeHall!==hallName(hall.value))types();
    if(detectedResult && detectedResult!==categoryRead) {
      categoryRead=detectedResult;
      const detected=typeName(detectedResult.artifact?.type);
      if((DN.ARTIFACT_TYPE_EXHIBITS[hallName(hall.value)] || []).some(ex=>ex.key.replace(/^war-/,'')===detected)) {
        type.value=detected;categoryOrigin='detected';DN.saveScannerArtifactType?.(detected,hall.value);
      } else if(categoryOrigin!=='override') {type.value='';categoryOrigin='unread';}
    }
    showCategory();render();
  }};
  type.addEventListener('change',()=>{categoryOrigin='override';DN.saveScannerArtifactType?.(type.value,hall.value);showCategory();render();});
  hall.addEventListener('change',()=>{types();render();});
  window.addEventListener('focus',refresh);
  window.addEventListener('storage',refresh);
  for(const event of ['focus','storage'])window.addEventListener(event,()=>{types();render();});
  types();refresh();
})();
