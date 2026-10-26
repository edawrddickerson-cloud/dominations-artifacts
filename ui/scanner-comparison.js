/* Authority: User-requested capture percentage and top-two benchmark, October 2026.
 * Ownership: Crafting summary and same-type, same-hall collection comparison.
 * Invariants: Shared maximum weighted scoring; ties do not displace owned items;
 * identified fields retain read/inferred/typed provenance. Logs are not ownership. */
(() => {
  'use strict';
  const DN=window.DN;
  const hallName=value=>String(value || '').toLowerCase()==='war'?'War':'Main';
  const typeName=value=>String(value || '').trim().replace(/^war[ -]/i,'').toLowerCase();
  const scoreable=row=>!!row?.name && row.known!==false && Number.isFinite(row.value) && row.hasPercent!==false && !row.assumed && !row.conflict && !row.tierConflict && !row.estimated && !row.scoreExcluded;
  function scoreExclusion(row) {
    if(!row?.name)return 'Waiting for a perk name';
    const reasons=[];
    if(!row.known)reasons.push('Perk name is not confirmed');
    if(row.assumed)reasons.push('Perk name is an uncertain match');
    if(!Number.isFinite(row.value) || row.hasPercent===false)reasons.push('Signed percentage was not read completely');
    if(row.conflict)reasons.push('OCR readings disagree about this row');
    if(row.tierConflict)reasons.push('Percentage conflicts with the detected tier or hall');
    if(row.estimated)reasons.push('Value is estimated');
    if(row.scoreExcluded)reasons.push('Row was excluded from scoring');
    return reasons.join('; ');
  }
  function craftOptions(options,{hall,type,rows}={}) {
    if(options?.targetScoring)return options;
    if(!options || !options.prefSortAxes.offensive && !options.prefSortAxes.defensive)return options;
    const category=typeName(type);
    if(hallName(hall)==='Main' && category==='weapon')return options;
    let axis=hallName(hall)==='War'?'offensive':['armor','pottery'].includes(category)?'defensive':['jewelry','jewellery'].includes(category)?'offensive':null;
    // An unread Main category could belong to either role. Show the stronger
    // complete total, while each category's actual comparison uses its own role.
    if(!axis && rows?.length && rows.every(row=>row.name && Number.isFinite(row.value))) {
      const roles=[null,'offensive','defensive'];
      const totals=roles.map(role=>scoreCraftRows(rows,role?{...options,prefSortAxes:{offensive:role==='offensive',defensive:role==='defensive'}}:options,hall,type).potentialPreference);
      axis=roles[totals.indexOf(Math.max(...totals))];
    }
    return axis?{...options,prefSortAxes:{offensive:axis==='offensive',defensive:axis==='defensive'}}:options;
  }
  function scoreCraftRows(rows,options,hall,type) {
    return window.DNArtifactScoring.comparisonScore(statRow(rows.map(perk=>scoreable(perk)?{...perk,value:Math.sign(perk.value)*(Math.abs(perk.value)+9)}:{name:'',value:0})),options,
      {hall,grade:type,eligible:rows.map(perk=>!scoreable(perk)?false:typeof perk.rerollEligible==='boolean'?perk.rerollEligible:null)});
  }
  function statRow(rows) {
    const row={};
    rows.forEach((perk,index)=>{row['perk_'+(index+1)+'_name']=perk.name;row['perk_'+(index+1)+'_base']=String(perk.value);row['perk_'+(index+1)+'_max']='';});
    return row;
  }
  function previewRowScore(row,options) {
    if(!options || !row?.known || !row.name || !Number.isFinite(row.value) || Math.abs(row.value)>40 ||
      row.hasPercent===false || row.outOfRange || row.estimated || row.scoreExcluded)return null;
    const sign=DN.expectedPerkSign?.(row.name);
    if((sign===1 || sign===-1) && Math.sign(row.value)!==sign)return null;
    // Display the current candidate without admitting uncertain evidence to
    // item totals, reroll gains, completeness or confirmed comparisons.
    const total=window.DNArtifactScoring.score(statRow([{name:row.name,value:Math.sign(row.value)*(Math.abs(row.value)+9)}]),options);
    return total.lines[0]?window.DNArtifactScoring.lineActiveScore(total.lines[0],options.prefSortAxes):null;
  }
  function estimate(result,{expectedRows=5}={}) {
    if(!result?.rows || expectedRows!==5 || result.rows.length>5)return null;
    const rows=Array.from({length:5},(_,index)=>result.rows[index]);
    const usable=row=>row?.known && scoreable(row);
    const scoredCount=rows.filter(usable).length;
    if(!scoredCount)return null;
    if(scoredCount===5)return result.valid && !rows.some(row=>row.inferred)?result:{...result,valid:true,provisional:true,assumption:'Scoring displayed percentages; OCR needs review.'};
    // This is a separate scoring view. Keep raw OCR and saved observations intact.
    // Empty slots preserve row positions but have no score or reroll eligibility.
    return {...result,rows:rows.map(row=>usable(row)?{...row}:{name:'',value:null,known:false,scoreExcluded:true,rerollEligible:false}),
      valid:true,partial:true,scoredCount,provisional:true,assumption:scoredCount+'/5 stats scored · Unread rows excluded. Subtotal only.'};
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
    const fields=[];
    const add=(label,known,source='read')=>fields.push({label,source:known?source:null});
    const source=(manual,inferred)=>manual?'typed':inferred?'inferred':'read';
    rows.forEach((row,i)=>{
      const usable=row && !row.estimated && !row.conflict;
      const sign=DN.expectedPerkSign?.(row?.name),validSign=sign!==1 && sign!==-1 || Math.sign(row?.value)===sign;
      add('Row '+(i+1)+' name',usable && row.known && row.name && !row.assumed,source(row?.nameSource==='manual',row?.inferredFields?.includes('name')));
      add('Row '+(i+1)+' percentage',usable && Number.isFinite(row.value) && Math.abs(row.value)<=40 && validSign && row.hasPercent!==false && !row.tierConflict,
        source(row?.valueSource==='manual',row?.inferred || row?.inferredFields?.includes('value')));
      add('Row '+(i+1)+' star',typeof (result?.unlocked?.states?.[i] ?? row?.unlocked)==='boolean',source(row?.unlockedSource==='manual',row?.inferredFields?.includes('unlocked')));
    });
    add('Category',!!result?.artifact?.type && !result.metadataConflict,source(result?.artifact?.typeSource==='manual',result?.artifact?.typeSource==='inferred'));
    const hallSource=result?.hallSource;
    add('Hall',['main','war'].includes(result?.hall) && ['hall-colour','crafting-label','percentage-tier','manual'].includes(hallSource),
      source(hallSource==='manual',['crafting-label','percentage-tier'].includes(hallSource)));
    const diceRows=rows.map((row,i)=>({row,i})).filter(({row})=>row?.rerollSource==='dice-background' || row?.rerollCaptureExpected);
    diceRows.forEach(({row,i})=>add('Row '+(i+1)+' reroll',typeof row.rerollEligible==='boolean' && row.rerollConfidence==='high' && !row.rerollConflict,source(row.rerollSource==='manual',false)));
    const read=fields.filter(field=>field.source==='read').length,inferred=fields.filter(field=>field.source==='inferred').length,typed=fields.filter(field=>field.source==='typed').length;
    const identified=read+inferred+typed,expected=fields.length,missing=fields.filter(field=>!field.source).map(field=>field.label);
    const count=suffix=>fields.filter(field=>field.label.endsWith(suffix) && field.source).length;
    return {identified,read,inferred,typed,captured:read,expected,percent:Math.round(identified/expected*100),missing,
      names:count(' name'),values:count(' percentage'),stars:count(' star'),type:!!fields[15].source,hall:!!fields[16].source,dice:count(' reroll'),diceExpected:diceRows.length};
  }
  function craftScore(result,options) {
    if(!result?.valid || result.rows?.length!==5 || !result.rows.some(scoreable) || result.rows.some(row=>!scoreable(row) && !(result.partial && row.scoreExcluded)))return null;
    return craftPotential(result,options).potentialPreference;
  }
  function craftPotential(result,options) {
    const hall=result.hall || result.artifact?.hall,type=result.artifact?.type;
    return scoreCraftRows(result.rows,craftOptions(options,{hall,type,rows:result.rows}),hall,type);
  }
  function ownedBenchmark({type,hall,owned,options}) {
    const normalized=typeName(type);
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
    return {candidates,incomplete};
  }
  // Each UI refresh replaces the owned snapshot and rating resolver. A stable
  // snapshot only needs its category cutoffs scored once, across all OCR frames.
  function createComparator() {
    let previousOwned,previousCanon;
    let ratingsCaches=new WeakMap();
    function benchmark(params) {
      const {owned,options,hall,type}=params;
      if(owned!==previousOwned || options.canonPerk!==previousCanon){
        ratingsCaches=new WeakMap();previousOwned=owned;previousCanon=options.canonPerk;
      }
      let cache=ratingsCaches.get(options.ratingOf);
      if(!cache){cache=new Map();ratingsCaches.set(options.ratingOf,cache);}
      const key=JSON.stringify([options.strategyId,options.revision,hallName(hall),typeName(type),options.scoreMode,!!options.prefSortAxes.offensive,!!options.prefSortAxes.defensive]);
      if(!cache.has(key))cache.set(key,ownedBenchmark(params));
      return cache.get(key);
    }
    return (result,params)=>compare(result,params,benchmark);
  }
  // Display contract: docs/scanner-comparison.md, "Crafting display rules".
  // Colour follows the displayed numbers, including provisional subtotals.
  // Keep confirmation/completeness separate from that visual comparison.
  function compareStrategies(result,{strategies=[],...params},comparator=compare) {
    const results=strategies.map(strategy=>({strategyId:strategy.id,name:strategy.name,favorite:strategy.favorite,
      ...comparator(result,{...params,options:strategy.options,limit:2})}));
    const reliable=item=>!result?.provisional && !item.provisional && !['partial','incomplete','unconfirmed','axes','type'].includes(item.status);
    const improvements=results.filter(item=>reliable(item) && item.status==='better');
    const vacancies=results.filter(item=>reliable(item) && item.status==='vacancy');
    const ties=results.filter(item=>reliable(item) && item.status==='tie');
    const below=results.filter(item=>reliable(item) && item.status==='below');
    const status=!results.length?'check':improvements.length?'better':vacancies.length?'vacancy':
      results.every(item=>reliable(item) && item.status==='below')?'below':
      results.every(item=>reliable(item) && ['below','tie'].includes(item.status))?'tie':'check';
    const belowDisplayedBenchmarks=results.length>0 && results.every(item=>
      Number.isFinite(item.score) && Number.isFinite(item.threshold) && item.score<item.threshold);
    const meetingDisplayedBenchmarks=results.filter(item=>
      Number.isFinite(item.score) && Number.isFinite(item.threshold) && item.score>=item.threshold).length;
    return {status,results,belowDisplayedBenchmarks,meetingDisplayedBenchmarks,improvements:improvements.length,vacancies:vacancies.length,ties:ties.length,below:below.length};
  }
  function compare(result,{type,hall,owned,options,levels={},limit=null},benchmark=ownedBenchmark) {
    options=options?{...options,scoreMode:'combined'}:options;
    const normalized=typeName(type),grade=normalized.charAt(0).toUpperCase()+normalized.slice(1),slots=DN.artifactSlotCapacity(grade,hallName(hall));
    if(!slots || ['legendary','mythical'].includes(normalized))return {status:'type'};
    const capacity=Number.isInteger(limit) && limit>0?limit:slots;
    options=craftOptions(options,{hall,type});
    if(!options?.prefSortAxes.offensive && !options?.prefSortAxes.defensive)return {status:'axes',capacity};
    const scoringResult=result?{...result,hall:result.hall || hall,artifact:{...result.artifact,type:grade}}:result;
    const score=craftScore(scoringResult,options);
    const {candidates,incomplete}=benchmark({type,hall,owned,options});
    if(incomplete)return {status:'incomplete',capacity,incomplete};
    const threshold=candidates[capacity-1]?.score ?? null;
    if(score===null)return {status:'unconfirmed',capacity,threshold,count:candidates.length,top:candidates.slice(0,capacity)};
    const rank=1+candidates.filter(item=>item.score>=score).length;
    // A tie does not displace an owned item. An underfilled group is a vacancy,
    // not evidence that the craft beats an existing top-N threshold.
    const potential=result?.valid?craftPotential(scoringResult,options):null;
    return {status:result?.partial?'partial':threshold===null?'vacancy':score>threshold?'better':score===threshold?'tie':'below',
      provisional:!!potential?.rerollUncertain || candidates.some(item=>item.uncertain),baseScore:potential?.basePreference,rerollGain:potential?.rerollGain,rerollIndex:potential?.rerollIndex,
      capacity,score,rank,threshold,count:candidates.length,top:candidates.slice(0,capacity)};
  }
  const isUnlockedKeeper=result=>result?.unlocked?.count===3;
  function selectTargetFocus(results,manualId=null) {
    const manual=results.find(item=>item.id===manualId);if(manual)return manual;
    const hits=results.filter(item=>item.hit),pool=hits.length?hits:results;
    return pool.reduce((best,item)=>!best || (item.score ?? -Infinity)>(best.score ?? -Infinity)?item:best,null);
  }
  window.DNScannerComparisonCore={compare,compareStrategies,createComparator,currentRows,maxRows,statRow,estimate,previewRowScore,isUnlockedKeeper,captureCompleteness,craftScore,craftPotential,craftOptions,scoreExclusion,selectTargetFocus};
  const type=document.getElementById('scanner-compare-type');if(!type)return;
  const compareOwned=createComparator();
  const flag=document.getElementById('scanner-comparison'),detail=document.getElementById('scanner-comparison-detail'),hall=document.getElementById('scanner-hall');
  let latest=null,confirmed=false,options=null,owned=[],loading=true,error='',request=0,loadedProfile=null;
  let cataloguePromise;
  let categoryOrigin='remembered',categoryRead=null;
  let typeHall=null;
  let captureResult=null;
  let captureEncounter=null;
  let keeperResult=null;
  let targetResults=[],targetFocus=null,manualTarget=null,focusProfile=null,focusNotification=null;

  function identification() {
    const overridden=categoryOrigin==='override' && !!type.value && !!captureResult;
    return captureCompleteness(overridden?{...captureResult,metadataConflict:false,artifact:{...captureResult.artifact,type:type.value,typeSource:'manual'}}:captureResult);
  }
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
  function renderStrategyResults() {

    const strategies=options?.strategyOptions;
    if(!strategies?.length)return;

    const activeLabel=document.getElementById('scanner-benchmark-label');
    if(activeLabel)activeLabel.textContent='Top 2 · '+options.strategyName;
    const available=!error && loadedProfile===DN.activeProfileId();
    const comparison=available && type.value?compareStrategies(confirmed?latest:null,
      {type:type.value,hall:hall.value,owned,strategies},compareOwned):null;
    const summary=comparison?comparison.belowDisplayedBenchmarks?(comparison.status==='below'?'':'Estimated · ')+'Below top 2 in all '+strategies.length+' selected strategies':
      comparison.status==='better'?'Improves top 2 for '+comparison.improvements+' of '+strategies.length+' strategies':
      comparison.status==='vacancy'?'Open top-two slot for '+comparison.vacancies+' of '+strategies.length+' strategies':
      comparison.meetingDisplayedBenchmarks?(comparison.status==='check'?'Estimated · ':'')+'Meets top 2 for '+comparison.meetingDisplayedBenchmarks+' of '+strategies.length+' strategies'+(comparison.status==='tie'?' · tie does not replace an owned item':''):
      comparison.status==='below'?'Below top 2 in all '+strategies.length+' selected strategies':
      comparison.status==='tie'?'Ties top 2 for '+comparison.ties+' strategies · no replacement':'Check strategy comparisons · incomplete or uncertain evidence':
      available?'Choose the artifact category to compare strategies':'Strategy benchmarks unavailable';
    const benchmark=document.getElementById('scanner-benchmark');
    // The active score and cutoff stay visible even when that strategy is not
    // selected in the comparison table. Its numeric result still sets colour.
    const activeComparison=available && confirmed && type.value?compareOwned(latest,{type:type.value,hall:hall.value,owned,options,limit:2}):null;
    const activeMeetsBenchmark=Number.isFinite(activeComparison?.score) && Number.isFinite(activeComparison?.threshold) && activeComparison.score>=activeComparison.threshold;
    benchmark.classList.remove('is-top-two');benchmark.classList.remove('is-below-cutoff');
    if(!comparison || !confirmed){benchmark.classList.add('is-unknown');return;}
    if(activeMeetsBenchmark || comparison.meetingDisplayedBenchmarks) {
      benchmark.classList.remove('is-unknown');benchmark.classList.add('is-top-two');
      if(latest?.provisional || activeComparison?.provisional || comparison.status==='check')benchmark.classList.add('is-provisional');
    }else if(comparison.belowDisplayedBenchmarks) {
      benchmark.classList.remove('is-unknown');benchmark.classList.add('is-below-cutoff');
      if(comparison.status!=='below')benchmark.classList.add('is-provisional');
    }else if(['better','vacancy','below'].includes(comparison.status)) {
      benchmark.classList.remove('is-unknown');benchmark.classList.add(comparison.status==='below'?'is-below-cutoff':'is-top-two');
    }else benchmark.classList.add('is-unknown');
    flag.textContent=activeMeetsBenchmark && !comparison.meetingDisplayedBenchmarks?'Meets top 2 · '+options.strategyName+' · '+summary:summary;
    if(options.strategyName && detail.textContent)detail.textContent=options.strategyName+' · '+detail.textContent;
  }
  function render() {
    const benchmark=document.getElementById('scanner-benchmark');
    if(!benchmark)return;
    try {
    const get=id=>document.getElementById('scanner-'+id),capture=identification();
    const benchmarkLabel=get('benchmark-label');
    if(benchmarkLabel)benchmarkLabel.textContent='Top 2 benchmark';
    const board=get('glance-board');
    const artwork=get('artwork'),image=latest?.artifact?.image;
    if(artwork && window.DNArtwork)window.DNArtwork.bind(artwork,latest?.artifact);
    else if(artwork){artwork.hidden=!image;if(image && artwork.getAttribute('src')!==image)artwork.src=image;if(!image)artwork.removeAttribute('src');}
    board.style.setProperty('--capture-hue',capture.identified===capture.expected?'120':capture.identified?'40':'0');
    board.className=(get('row-status')?'scanner-capture-inline':'scanner-summary-card scanner-capture-card')+(capture.missing.length && captureResult?' is-incomplete':'');
    get('capture-percent').textContent=capture.identified+'/'+capture.expected+' identified';
    get('capture-meter').value=capture.percent;
    get('capture-detail').textContent=capture.read+' read · '+capture.inferred+' inferred · '+capture.typed+' typed';
    const sources=get('capture-sources');
    if(sources)sources.textContent=[capture.inferred?capture.inferred+' inferred':'',capture.typed?capture.typed+' typed':''].filter(Boolean).join(' · ');
    const review=get('capture-review');
    if(review){review.hidden=true;review.textContent='';}
    board.title=capture.names+'/5 names · '+capture.values+'/5 percentages · '+capture.stars+'/5 stars · Category '+(capture.type?'identified':'unknown')+' · Hall '+(capture.hall?'identified':'unknown')+(capture.diceExpected?' · '+capture.dice+'/'+capture.diceExpected+' dice':'');
    const keeper=isUnlockedKeeper(keeperResult);
    const keeperReason=get('keeper-reason');
    if(keeperReason){keeperReason.hidden=!keeper;keeperReason.textContent=keeper?'Keep — 3 stats unlocked':'';}
    benchmark.className='scanner-summary-card scanner-benchmark is-unknown'+(keeper?' is-unlocked-keeper':'');
    const label=type.value?type.value.charAt(0).toUpperCase()+type.value.slice(1):'Item';
    const scoreLabel=label+(latest?.partial?' subtotal':' total');
    get('item-type').textContent=scoreLabel;get('item-total').textContent='—';get('benchmark-value').textContent='—';
    flag.textContent='Waiting for an item';detail.textContent=keeper?'3 open stats · Keep for review':'';
    if(!options){flag.textContent='Waiting for an item';return;}
    if(!options.prefSortAxes.offensive && !options.prefSortAxes.defensive){flag.textContent='Select Off or Def';return;}
    const potential=confirmed && latest?.valid?craftPotential({...latest,hall:latest.hall || hall.value,artifact:{...latest.artifact,type:type.value || latest.artifact?.type}},options):null;
    const score=potential?.potentialPreference ?? null;
    if(score!==null){
      get('item-total').textContent=(latest.provisional || potential.rerollUncertain?'~':'')+score;
      const axes=craftOptions(options,{hall:latest.hall || hall.value,type:type.value,rows:latest.rows}).prefSortAxes;
      get('item-type').textContent=scoreLabel+' · '+[axes.offensive?'Off':'',axes.defensive?'Def':''].filter(Boolean).join('+');
    }
    if(!type.value){
      flag.textContent='Item type unread';
      if(latest?.partial)flag.textContent='Incomplete · '+latest.scoredCount+'/5 stats scored · Item type unread';
      if(score!==null && !latest?.partial && !error && loadedProfile===DN.activeProfileId()) {
        const categories=DN.ARTIFACT_TYPE_EXHIBITS[hallName(hall.value)] || [];
        const belowAll=categories.length>0 && categories.every(ex=>{
          const result=compareOwned(latest,{type:ex.key.replace(/^war-/,''),hall:hall.value,owned,options,limit:2});
          return result.status==='below';
        });
        if(belowAll){
          benchmark.classList.remove('is-unknown');
          benchmark.classList.add('is-below-cutoff');
          flag.textContent='Below top 2 in every category · Item type unread';
        }
      }
      return;
    }
    if(loading && loadedProfile!==DN.activeProfileId()){flag.textContent='Loading your collection…';return;}
    if(error){flag.textContent=error;return;}
    const comparison=compareOwned(confirmed?latest:null,{type:type.value,hall:hall.value,owned,options,limit:2});
    if(comparison.status==='incomplete'){flag.textContent='Benchmark unavailable · owned stats incomplete';return;}
    if(comparison.status==='type'){flag.textContent='Item type needs review';return;}
    get('benchmark-value').textContent=comparison.threshold===null?'Open slot':String(comparison.threshold);
    if(comparison.status==='unconfirmed'){flag.textContent=latest?'Stats need review':'Waiting for an item';return;}
    const qualifies=comparison.threshold===null || comparison.score>=comparison.threshold;
    const provisional=latest.provisional || comparison.provisional;
    benchmark.classList.remove('is-unknown');
    benchmark.classList.add(qualifies?'is-top-two':'is-below-cutoff');
    if(provisional)benchmark.classList.add('is-provisional');
    flag.textContent=(latest.provisional || comparison.provisional?'Estimated · ':'')+(qualifies?'Makes top 2':comparison.status==='tie'?'Ties benchmark':'Below top 2');
    detail.textContent=comparison.threshold===null?comparison.count+' / 2 owned':
      (comparison.score-comparison.threshold>0?'+':'')+(comparison.score-comparison.threshold)+' points · Rank '+comparison.rank;
    detail.textContent+=' · Upgraded '+comparison.baseScore+' → Potential '+comparison.score+(comparison.rerollGain>0?' (+ '+comparison.rerollGain+' from stat '+(comparison.rerollIndex+1)+')':'')+(comparison.provisional?' · Reroll availability needs review':'');
    if(keeper)detail.textContent+=' · 3 open stats · Keep for review';
    } finally {renderStrategyResults();renderPurposeResults();}
  }
  function renderPurposeResults() {
    const service=window.DNCraftingPurposes,panel=document.getElementById('scanner-purpose-results');
    if(!panel)return;
    const state=service?.settings() || {selected:[]};
    panel.hidden=false;
    flag.hidden=true;
    const result=confirmed && latest?{...latest,rows:captureResult?.rows || latest.rows}:null;
    const available=!error && loadedProfile===DN.activeProfileId() && (!loading || loadedProfile===DN.activeProfileId());
    const rareIds=Object.keys(state.rareCards || {}),selected=[...state.selected,...rareIds];
    const evaluate=(value,ready=available)=>service && selected.length?service.evaluate(value,{...state,selected,type:type.value,hall:hall.value,owned,canonPerk:options?.canonPerk,available:!!value && ready}):[];
    const allResults=evaluate(result);
    const rareResults=allResults.filter(item=>item.rare);
    const bestRare=[...rareResults].sort((a,b)=>Number(b.hit)-Number(a.hit)||
      Number(b.lines>=b.requiredLines)-Number(a.lines>=a.requiredLines)||(b.score||0)-(a.score||0)||b.lines-a.lines)[0];
    const results=allResults.filter(item=>!item.rare);
    if(bestRare)results.push({...bestRare,label:'Single Unit Rare Card'});
    if(focusProfile!==DN.activeProfileId())manualTarget=null;
    focusProfile=DN.activeProfileId();
    // Retained readings remain inspectable while capture is paused. Their
    // contributions never turn the separate live qualification state green.
    const retained=!result && captureResult && service?evaluate(captureResult,false):null;
    targetResults=retained?allResults.map(item=>{const prior=retained.find(entry=>entry.id===item.id);return {...item,score:prior?.score ?? null,contributions:prior?.contributions || []};}):allResults;
    if(!targetResults.some(item=>item.id===manualTarget))manualTarget=null;
    targetFocus=selectTargetFocus(targetResults,manualTarget);
    const notification=JSON.stringify([focusProfile,targetFocus?.id || null]);
    if(notification!==focusNotification){
      focusNotification=notification;
      Promise.resolve().then(()=>window.dispatchEvent(new CustomEvent('dn-scanner-target-focus-changed')));
    }
    const hits=results.filter(item=>item.hit);
    let focusHit=hits.length>0;
    const benchmark=document.getElementById('scanner-benchmark');
    const keeper=isUnlockedKeeper(keeperResult),count=keeperResult?.unlocked?.count;
    const row=(name,target,score,hit,attribute='')=>{
      const content='<strong>'+DN.esc(name)+'</strong><span class="scanner-focus-target">'+DN.esc(target)+'</span><b class="scanner-focus-score">'+DN.esc(score)+'</b>';
      return '<li '+attribute+' class="'+(hit?'purpose-hit':'purpose-miss')+'">'+(attribute.startsWith('data-purpose-result=')?'<button type="button" class="scanner-target-rating-open" aria-pressed="false">'+content+'</button>':content)+'</li>';
    };
    let lines=results.map(item=>row(item.label,item.threshold!==null?'> '+item.threshold:item.score!==null?'Open slot':'—',item.score===null?'—':(item.uncertain?'~':'')+item.score,item.hit,'data-purpose-result="'+DN.esc(item.id)+'"')).join('');
    if(!selected.length){
      const strategies=[...(options?.strategyOptions || [])];
      if(options && !strategies.some(strategy=>strategy.id===options.strategyId))strategies.unshift({id:options.strategyId,name:options.strategyName || 'Active strategy',options});
      lines=strategies.map(strategy=>{
        const item=available && type.value?compareOwned(confirmed?latest:null,{type:type.value,hall:hall.value,owned,options:strategy.options,limit:2}):null;
        const hit=Number.isFinite(item?.score) && (item.threshold===null || item.score>=item.threshold);
        if(hit)focusHit=true;
        return row(strategy.name,item?.threshold===null?'Open slot':Number.isFinite(item?.threshold)?'≥ '+item.threshold:'—',Number.isFinite(item?.score)?(item.provisional?'~':'')+item.score:'—',hit,'data-strategy-focus');
      }).join('');
    }
    const rareDetail=bestRare && bestRare.lines>=bestRare.requiredLines?bestRare.label+' · '+bestRare.lines+'×'+(bestRare.mode==='damage'?' · Damage':bestRare.mode==='hp'?' · Hitpoints':'')+(bestRare.hit?' · Top two':' · '+(bestRare.status==='owned'?'No improvement':'Unverified')):'';
    panel.innerHTML='<div class="scanner-focus-heading" aria-hidden="true"><span>Collection Targets</span><span>Target</span><span>Score</span></div><ul>'+lines+row('3 Unlocked Rows','= 3',Number.isFinite(count)?count:'—',keeper,'data-unlocked-focus')+'</ul>'+
      (rareDetail?'<p data-rare-card-detail>'+DN.esc(rareDetail)+'</p><p data-rare-card-rarity role="status"></p>':'');
    if(rareDetail)window.DNScannerRareCards?.render(bestRare,{hall:hall.value,type:type.value});
    for(const node of panel.querySelectorAll('[data-purpose-result]')){
      const focused=node.dataset.purposeResult===targetFocus?.id || targetFocus?.rare && node.dataset.purposeResult===bestRare?.id;
      node.classList.toggle('is-score-focus',focused);node.querySelector('button')?.setAttribute('aria-pressed',String(focused));
    }
    window.DNScannerTargetRatings?.refresh({rows:captureResult?.rows || [],canonPerk:options?.canonPerk});
    if(!selected.length){
      if(focusHit){benchmark.classList.remove('is-unknown','is-below-cutoff');benchmark.classList.add('is-top-two');}
      document.getElementById('scanner-decision-state').textContent=keeper || focusHit?'Keep':'Discard';
      return;
    }
    document.getElementById('scanner-item-type').textContent='Target matches';
    document.getElementById('scanner-item-total').textContent=String(hits.length);
    document.getElementById('scanner-benchmark-label').textContent='Owned comparison';
    document.getElementById('scanner-benchmark-value').textContent='Top two';
    benchmark.classList.remove('is-top-two','is-below-cutoff','is-unknown','is-provisional');
    const pending=results.some(item=>['waiting','category','unavailable','review'].includes(item.status));
    benchmark.classList.add(hits.length?'is-top-two':pending?'is-unknown':'is-below-cutoff');
    document.getElementById('scanner-decision-state').textContent=keeper || hits.length?'Keep':'Discard';
    if(hits.some(item=>item.uncertain))benchmark.classList.add('is-provisional');
    flag.textContent=hits.length?'Useful for '+hits.map(item=>item.label).join(', '):pending?'Check target comparisons':'No selected target improves your top two';
  }
  async function refresh() {
    const ticket=++request,profile=DN.activeProfileId();loading=true;error='';render();
    try {
      if(!cataloguePromise)cataloguePromise=fetch('./data/artifacts.json',{cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('catalogue unavailable');const data=await response.json();if(!Array.isArray(data))throw new Error('invalid catalogue');return data;}).catch(reason=>{cataloguePromise=null;throw reason;});
      const [catalogue,scans,inventory]=await Promise.all([cataloguePromise,window.DNStoredArtifacts.read('collection:'+profile),window.DNStoredArtifacts.read('items')]);
      if(ticket!==request || profile!==DN.activeProfileId())return;
      const collected=DN.loadCollected(),rows=new Map();
      for(const row of catalogue)if(collected.has(DN.artifactKey(row)))rows.set(DN.artifactKey(row),row);
      for(const item of scans){if(item.catalogId && !collected.has(item.catalogId))continue;const row=window.DNStoredArtifacts.toRow(item);rows.set(DN.artifactKey(row),row);}
      for(const item of inventory)if(item.keptFromCraft && item.profileId===profile && !rows.has(item.id)){
        rows.set(item.id,window.DNStoredArtifacts.toRow(item));
      }
      owned=[...rows.values()];
      loadedProfile=profile;
    } catch {if(ticket===request)error='Could not load your collection. Refocus this window to retry.';}
    finally {if(ticket===request){loading=false;render();}}
  }
  window.DNScannerComparison={identification,
    scoringContext(){return targetFocus?{...targetFocus,automatic:!manualTarget,options:window.DNCraftingPurposes?.scoringOptions(targetFocus.id,options)}:null;},
    focusTarget(id){if(targetResults.some(item=>item.id===id)){manualTarget=id;render();}},
    automaticTarget(){manualTarget=null;render();},
    update(result,isConfirmed,opts,state={}){
    latest=result;confirmed=isConfirmed;options=opts;
    keeperResult=Object.prototype.hasOwnProperty.call(state,'keeperResult')?state.keeperResult:result;
    captureResult=Object.prototype.hasOwnProperty.call(state,'captureResult')?state.captureResult:result;
    if(!captureResult || state.encounterId!=null && state.encounterId!==captureEncounter){categoryOrigin='unread';categoryRead=null;}
    captureEncounter=state.encounterId ?? captureEncounter;
    const detectedResult=Object.prototype.hasOwnProperty.call(state,'categoryResult')?state.categoryResult:result;
    if(typeHall!==hallName(hall.value))types();
    if(detectedResult && detectedResult!==categoryRead) {
      categoryRead=detectedResult;
      const detected=typeName(detectedResult.artifact?.type);
      if(categoryOrigin!=='override' && (DN.ARTIFACT_TYPE_EXHIBITS[hallName(hall.value)] || []).some(ex=>ex.key.replace(/^war-/,'')===detected)) {
        type.value=detected;categoryOrigin='detected';DN.saveScannerArtifactType?.(detected,hall.value);
      } else if(categoryOrigin!=='override') {type.value='';categoryOrigin='unread';}
    }
    showCategory();render();
  }};
  type.addEventListener('change',()=>{categoryOrigin='override';DN.saveScannerArtifactType?.(type.value,hall.value);showCategory();render();});
  hall.addEventListener('change',()=>{types();render();});
  window.addEventListener('focus',refresh);
  window.addEventListener('storage',refresh);
  window.addEventListener('dn-craft-kept',refresh);
  window.addEventListener('dn-artifacts-changed',refresh);
  window.addEventListener('dn-crafting-purposes-changed',render);
  for(const event of ['focus','storage'])window.addEventListener(event,()=>{types();render();});
  types();refresh();
})();
