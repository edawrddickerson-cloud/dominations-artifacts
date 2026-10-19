/* Opt-in, per-profile crafting purposes. Scores use existing lines at maximum
 * upgrade, without hypothetical rerolls. Logs never count as owned artifacts. */
(() => {
  'use strict';
  const DN = window.DN;
  if (!DN) return;
  const key = 'dn-crafting-purposes';
  const metadata = window.DN_ARTIFACT_STAT_CONTEXT?.stats || {};
  const names = Object.keys(metadata);
  const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  const aircraft = new Set(['Fighter', 'Bomber', 'Transport', 'Recon', 'Attack Helicopter', 'Tactical Helicopter']);
  const airDefence = ['Air Defense Damage', 'Air Defense Hitpoints'];
  const enemyAirDefence = ['Enemy Air Defense Damage', 'Enemy Air Defense Hitpoints'];
  const kinds = new Set(['damage', 'hp', 'combined', 'healing', 'speed', 'movement', 'cooldown']);
  const choices = [];
  const add = (id, label, group, stats) => {
    const selected = new Set(stats.filter(name => metadata[name]));
    if (selected.size) choices.push({id, label, group, stats: selected});
  };
  function unitStats(units, invading) {
    const covered = new Set(units);
    const types = new Set(units.map(unit => DN.armyUnitType(unit)).filter(Boolean));
    return names.filter(name => {
      if (/^Invading /.test(name) !== invading || /^Enemy /.test(name) || !kinds.has(metadata[name].kind)) return false;
      const scope = DN.perkArmyScope(name.replace(/^Invading /, ''));
      return scope?.kind === 'unit' && covered.has(scope.unit) || scope?.kind === 'type' && types.has(scope.type);
    });
  }
  for (const unit of DN.ARMY_UNIT_FAMILIES) {
    add('attack-' + slug(unit), unit + ' attack', 'Unit attack', [
      ...unitStats(DN.expandArmyUnitsWithLinks([unit]), false), ...(aircraft.has(unit) ? enemyAirDefence : []),
    ]);
    // Countering APC does not imply countering every linked infantry unit.
    add('counter-' + slug(unit), unit + ' counter', 'Unit counters', [
      ...unitStats([unit], true), ...(aircraft.has(unit) ? airDefence : []),
    ]);
  }
  for (const group of DN.PERK_GROUPS.filter(group => ['loot', 'production', 'research'].includes(group.id))) {
    add(group.id, group.label, 'Economy', group.perks.map(perk => perk.name));
  }

  const defensiveStats = new Set(DN.PERK_GROUPS.filter(group => ['buildings','all-towers','defenders'].includes(group.id)).flatMap(group => group.perks.map(perk => perk.name)));
  const economyStats = new Set(choices.filter(choice => choice.group === 'Economy').flatMap(choice => [...choice.stats]));
  const axisFor = name => /^Invading /.test(name) || defensiveStats.has(name) || name === 'Looted Resource Refund' ? 'defensive' : 'offensive';
  const categoryFor = name => economyStats.has(name) ? 'economy' : axisFor(name) === 'defensive' ? 'defensive' : 'attacking';
  for (const [category, group] of [['attacking','Unit attack'],['defensive','Unit counters'],['economy','Economy']]) {
    add('general-'+category, 'General target', group, names.filter(name => categoryFor(name) === category));
  }
  choices.forEach(choice => {choice.category = choice.group === 'Unit attack' ? 'attacking' : choice.group === 'Unit counters' ? 'defensive' : 'economy';});
  const choiceById = new Map(choices.map(choice => [choice.id,choice]));
  const defaults = [
    {id:'custom-general-attacking',label:'Offensive - General',category:'attacking'},
    {id:'custom-general-defensive',label:'Defensive - General',category:'defensive'},
    {id:'custom-general-economy',label:'Economy - General',category:'economy'},
  ];
  const defaultById = new Map(defaults.map(purpose=>[purpose.id,purpose]));
  const definitions = [], byId = new Map();
  let factoryDefaults = {}, ratingLayers = {global:{},profile:{}};
  const validWeight = value => Number.isInteger(value) && value >= 0 && value <= 10;
  const validPerks = list => [...new Set((Array.isArray(list) ? list : []).filter(name => typeof name === 'string' && Object.hasOwn(metadata,name)))];
  function candidatePerks(entry) {
    return [...new Set([...(entry.selections || []).flatMap(id => [...(choiceById.get(id)?.stats || [])]),...validPerks(entry.perks)])].sort((a,b)=>a.localeCompare(b));
  }
  function includedPerks(entry) {
    const excluded = new Set(entry.excludedPerks || []);
    return candidatePerks(entry).filter(name => !excluded.has(name));
  }
  function normalizeEntry(entry) {
    if (!entry || !/^custom-[a-z0-9-]{1,80}$/.test(entry.id) || typeof entry.label !== 'string') return null;
    if(entry.id.startsWith('custom-migrated-selections')&&/^My (?:crafting purpose|collecting goal)(?: \d+)?$/.test(entry.label))entry={...entry,label:entry.label.replace(/^My (?:crafting purpose|collecting goal)/,'My collection target')};
    const builtIn=defaultById.get(entry.id);
    if(builtIn)entry={...entry,label:builtIn.label,selections:['general-'+builtIn.category],perks:[]};
    const label=entry.label.trim().slice(0,60);
    const selections=[...new Set((Array.isArray(entry.selections)?entry.selections:[]).filter(id=>choiceById.has(id)))];
    const result={id:entry.id,label,selections,perks:validPerks(entry.perks),excludedPerks:validPerks(entry.excludedPerks)};
    if(builtIn){result.builtIn=true;result.category=builtIn.category;}
    const candidates=new Set(candidatePerks(result));
    result.excludedPerks=result.excludedPerks.filter(name=>candidates.has(name));
    return label && (builtIn || includedPerks(result).length) ? result : null;
  }
  function syncDefinitions(entries) {
    definitions.splice(0,definitions.length,...entries.map(entry=>({...entry,stats:new Set(includedPerks(entry)),group:'Saved targets',custom:true})));
    byId.clear();definitions.forEach(purpose=>byId.set(purpose.id,purpose));
  }
  function sharedRating(name) {
    const axis=axisFor(name);
    return Math.max(0,Math.min(10,Math.round(DN.storedPerkRating(ratingLayers.global,ratingLayers.profile,name,axis) ?? DN.perkRatingAxisOrNull(factoryDefaults,name,axis) ?? 0)));
  }
  function settings() {
    ratingLayers=DN.loadActivePerkRatingLayers();
    let raw;try{raw=JSON.parse(DN.lsGet(key)||'null');}catch{}
    const entries=[],seen=new Set();
    for(const value of Array.isArray(raw?.customPurposes)?raw.customPurposes:[]) {
      const entry=normalizeEntry(value);
      if(entry && !seen.has(entry.id)){entries.push(entry);seen.add(entry.id);}
    }
    for(const builtIn of defaults)if(!seen.has(builtIn.id)){entries.push(normalizeEntry(builtIn));seen.add(builtIn.id);}
    entries.sort((a,b)=>(defaultById.has(a.id)?defaults.findIndex(p=>p.id===a.id):3)-(defaultById.has(b.id)?defaults.findIndex(p=>p.id===b.id):3));
    const legacySelected=[...new Set(Array.isArray(raw?.selected)?raw.selected:[])];
    let combined;
    if(raw && raw.version!==4) {
      const selections=legacySelected.filter(id=>choiceById.has(id));
      if(selections.length) {
        let id='custom-migrated-selections';while(seen.has(id))id+='-old';
        let label='My collection target',index=2;while(entries.some(entry=>entry.label===label))label='My collection target '+index++;
        combined={id,label,selections,perks:[],excludedPerks:[]};entries.push(combined);seen.add(id);
      }
    }
    const importedArmies=[];
    if(raw?.version!==4) {
      const armies=DN.loadStrategies();
      for(const army of armies.strategies) {
        const selections=[...new Set((army.units||[]).map(unit=>'attack-'+slug(unit)).filter(id=>choiceById.has(id)))];
        if(!selections.length)continue;
        let id='custom-army-'+slug(army.id).slice(0,60);while(seen.has(id))id+='-old';
        let label=army.name.slice(0,60),index=2;while(entries.some(entry=>entry.label.toLowerCase()===label.toLowerCase()))label=army.name.slice(0,48)+' (army '+index++ +')';
        const entry={id,label,selections,perks:[],excludedPerks:[]};entries.push(entry);seen.add(id);
        if(army.id===armies.activeId)importedArmies.push(id);
      }
    }
    const selected=legacySelected.filter(id=>seen.has(id));if(combined)selected.unshift(combined.id);
    selected.push(...importedArmies);
    const activeId=seen.has(raw?.activeId)?raw.activeId:selected[0]||entries[0]?.id||null;
    const state={version:4,selected,activeId,customPurposes:entries};
    if(raw?.legacyPurposeRatings)state.legacyPurposeRatings=raw.legacyPurposeRatings;
    if(raw?.legacySelections)state.legacySelections=raw.legacySelections;
    syncDefinitions(entries);
    if(raw?.version!==4 && (raw || entries.length)) {
      state.legacySelections={version:raw?.version||1,selected:legacySelected,customPurposes:raw?.customPurposes||[]};
      const profile=structuredClone(ratingLayers.profile);let changed=false;
      if(raw && raw.version!==3) {
        if(Object.keys(raw.purposes||{}).length)state.legacyPurposeRatings={version:raw.version||1,purposes:raw.purposes};
        for(const id of legacySelected) {
          const purpose=choiceById.get(id)||byId.get(id);if(!purpose)continue;
          for(const [name,value] of Object.entries(raw.purposes?.[id]?.weights||{})) {
            const weight=raw.version===2?value:[0,0.5,1,2].includes(value)?Math.round(value*5):null,axis=axisFor(name);
            if(!purpose.stats.has(name)||!validWeight(weight)||DN.perkRatingAxisOrNull(profile,name,axis)!==null)continue;
            profile[name]={...profile[name],[axis]:weight};changed=true;
          }
        }
      }
      DN.lsSet(key,JSON.stringify(state));
      try{if(changed)DN.saveProfilePerkOverrides(DN.activeProfileId(),profile);}catch(error){DN.lsSet(key,JSON.stringify(raw));throw error;}
      ratingLayers=DN.loadActivePerkRatingLayers();
    }
    return state;
  }
  function save(state) {
    DN.lsSet(key,JSON.stringify(state));syncDefinitions(state.customPurposes);
    window.dispatchEvent(new CustomEvent('dn-crafting-purposes-changed'));
  }
  function saveCustom({id,label,selections=[],perks=[],excludedPerks=[]}) {
    const state=settings();label=String(label||'').trim();
    if(defaultById.has(id)&&label!==defaultById.get(id).label)throw Error('General target names are fixed.');
    if(!label||label.length>60)throw Error('Give this target a name of up to 60 characters.');
    if(state.customPurposes.some(purpose=>purpose.id!==id&&purpose.label.toLowerCase()===label.toLowerCase()))throw Error('A target already has that name.');
    if(id&&!state.customPurposes.some(purpose=>purpose.id===id))throw Error('Choose a saved target to edit.');
    const created=!id;
    id ||= 'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
    const entry=normalizeEntry({id,label,selections,perks,excludedPerks});
    if(!entry)throw Error('Choose at least one selection or included perk.');
    const index=state.customPurposes.findIndex(purpose=>purpose.id===id);
    if(index<0)state.customPurposes.push(entry);else state.customPurposes[index]=entry;
    if(created)state.selected.push(id);state.activeId=id;save(state);return id;
  }
  function removeCustom(id) {
    const state=settings();if(!byId.has(id))throw Error('Choose a saved target to delete.');
    if(defaultById.has(id))throw Error('The default General target cannot be deleted.');
    state.customPurposes=state.customPurposes.filter(purpose=>purpose.id!==id);state.selected=state.selected.filter(value=>value!==id);
    if(state.activeId===id)state.activeId=state.customPurposes[0]?.id||null;save(state);
  }
  function selectPurpose(id,enabled) {
    const state=settings();if(!byId.has(id))return;
    state.selected=enabled?[...new Set([...state.selected,id])]:state.selected.filter(value=>value!==id);save(state);
  }
  function setActive(id) {
    const state=settings();if(id!==null&&!byId.has(id))return;
    state.activeId=id;save(state);
  }
  function updateRatings(weights,allowed) {
    settings();const profile=structuredClone(ratingLayers.profile);
    for(const [name,value] of Object.entries(weights)) {
      if(!allowed.has(name)||value!==null&&!validWeight(value))throw Error('Choose an included perk rating from 0 to 10.');
      const axis=axisFor(name);
      if(value===null){if(profile[name]){delete profile[name][axis];if(!Object.keys(profile[name]).length)delete profile[name];}}
      else profile[name]={...profile[name],[axis]:value};
    }
    DN.saveProfilePerkOverrides(DN.activeProfileId(),profile);
  }
  function configure(id,patch) {settings();const purpose=byId.get(id);if(!purpose)throw Error('Choose a saved target.');updateRatings(patch.weights||{},purpose.stats);}
  function setRating(name,value) {updateRatings({[name]:value},new Set(names));}
  function ratingRows(id,perks) {
    return [...new Set(perks)].sort((a,b)=>a.localeCompare(b)).map(name=>{
      const axis=axisFor(name),label=axis==='offensive'?'Off':'Def',value=DN.perkRatingAxisOrNull(ratingLayers.profile,name,axis);
      const inherited=Math.max(0,DN.perkRatingAxisOrNull(ratingLayers.global,name,axis)??DN.perkRatingAxisOrNull(factoryDefaults,name,axis)??0);
      return '<label><span>'+DN.esc(name)+' <small class="purpose-rating-axis">'+label+'</small></span><input type="number" class="rating-input" min="0" max="10" step="1" value="'+(value==null?'':Math.max(0,value))+'" placeholder="'+inherited+'" data-purpose-weight="'+id+'" data-perk="'+DN.esc(name)+'" data-purpose-axis="'+axis+'" aria-label="'+DN.esc(name+': shared profile '+label+' rating')+'" /></label>';
    }).join('');
  }
  function renderGrouped(id,query='') {
    settings();const purpose=byId.get(id);if(!purpose)return '';
    const q=query.trim().toLowerCase(),perks=[...purpose.stats].filter(name=>!q||purpose.label.toLowerCase().includes(q)||name.toLowerCase().includes(q));
    if(!perks.length)return '';
    return '<section class="rating-section purpose-rating-section" data-purpose-section="'+id+'"><div class="rating-section-heading"><h2>'+DN.esc(purpose.label)+'</h2><span>'+purpose.stats.size+' unique perks</span><button type="button" class="btn btn-small" data-purpose-edit="'+id+'">Edit target</button></div><p class="rating-section-note">Shared profile ratings, linked to every target and the Off/Def ratings below.</p><div class="purpose-weight-list">'+ratingRows(id,perks)+'</div></section>';
  }
  const hallName = value => String(value).toLowerCase() === 'war' ? 'war' : 'main';
  const typeName = value => String(value || '').replace(/^war[ -]/i, '').toLowerCase().replace('jewellery', 'jewelry');
  function scoreRows(rows, purpose) {
    return rows.reduce((sum, row) => {
      const weight = sharedRating(row.name);
      return sum + (purpose.stats.has(row.name) && weight > 0 && Number.isFinite(row.value) ? Math.abs(row.value) * weight : 0);
    }, 0);
  }
  let cachedOwned, cachedCanon;
  const benchmarks = new Map();
  function evaluate(result, {type, hall, owned, canonPerk = name => name, available = true, selected}) {
    settings();
    const core = window.DNScannerComparisonCore;
    const normalizedType = typeName(type), normalizedHall = hallName(hall);
    if (cachedOwned !== owned || cachedCanon !== canonPerk) { benchmarks.clear(); cachedOwned = owned; cachedCanon = canonPerk; }
    const validCategory = !!normalizedType && (!result?.hall || hallName(result.hall) === normalizedHall) &&
      DN.artifactSlotCapacity(normalizedType, normalizedHall === 'war' ? 'War' : 'Main') > 0;
    const rows = result?.rows || [];
    let uncertain = false, readable = 0;
    const potentialRows = rows.slice(0, 5).map(row => {
      const name = canonPerk(row.name), sign = DN.expectedPerkSign(name);
      const usable = row.known !== false && name && metadata[name] && Number.isFinite(row.value) &&
        row.hasPercent !== false && !row.conflict && !row.tierConflict && !row.estimated && !row.scoreExcluded && !row.outOfRange &&
        (sign == null || sign === Math.sign(row.value)) &&
        (normalizedHall === 'war' ? [1, 3, 6] : [1, 6, 11]).includes(Math.abs(row.value));
      if (!usable) { uncertain = true; return {name: '', value: 0}; }
      readable++;
      uncertain ||= !!row.assumed || !!row.inferred || !!row.inferredFields?.length;
      return {name, value: Math.abs(row.value) + 9};
    });
    uncertain ||= rows.length !== 5 || !!result?.partial || !!result?.provisional;
    return selected.filter(id => byId.has(id)).map(id => {
      const purpose = byId.get(id);
      const score = readable ? scoreRows(potentialRows, purpose) : null;
      const lines = potentialRows.filter(row => purpose.stats.has(row.name) && sharedRating(row.name) > 0).length;
      const effectiveWeights = [...purpose.stats].sort().map(name => [name, sharedRating(name)]);
      const cacheKey = JSON.stringify([id, normalizedHall, normalizedType, effectiveWeights]);
      if (validCategory && !benchmarks.has(cacheKey)) {
        let incomplete = 0;
        const candidates = [], seen = new Set();
        for (const item of owned) {
          if (hallName(item.hall) !== normalizedHall || typeName(item.grade) !== normalizedType) continue;
          const identity = DN.artifactKey(item);
          if (seen.has(identity)) continue;
          seen.add(identity);
          const maxRows = core.maxRows(item, {canonPerk});
          const unknown = maxRows.length !== 5 || maxRows.some(row => !metadata[row.name] || !Number.isFinite(row.value)) ||
            item.scanned?.rows.some(row => row.assumed || row.conflict || row.tierConflict || row.estimated);
          if (unknown) { incomplete++; continue; }
          candidates.push({id: identity, name: item.name, score: scoreRows(maxRows, purpose)});
        }
        candidates.sort((a, b) => b.score - a.score);
        benchmarks.set(cacheKey, {candidates, incomplete});
      }
      const benchmark = benchmarks.get(cacheKey) || {candidates: [], incomplete: 0};
      const threshold = benchmark.candidates[1]?.score ?? null;
      let status = !result || score === null ? 'waiting' : !validCategory ? 'category' : !available ? 'unavailable' :
        score <= 0 ? 'irrelevant' : threshold !== null && score <= threshold ? 'owned' :
        benchmark.incomplete ? 'review' : threshold === null ? 'vacancy' : 'better';
      return {id, label: purpose.label, score, lines, threshold, best: benchmark.candidates[0]?.score ?? null,
        count: benchmark.candidates.length, incomplete: benchmark.incomplete, uncertain, status,
        hit: status === 'vacancy' || status === 'better'};
    });
  }

  window.DNCraftingPurposes={get definitions(){settings();return definitions;},get choices(){return choices;},settings,saveCustom,removeCustom,configure,setRating,selectPurpose,setActive,candidatePerks,includedPerks,axisFor,categoryFor,ratingRows,evaluate,renderGrouped,
    editCustom:id=>window.DNCraftingPurposeEditor?.edit(id),
    setDefaults(defaults,canonPerk=name=>name){factoryDefaults=Object.fromEntries(Object.entries(defaults).map(([name,entry])=>[canonPerk(name),entry]));benchmarks.clear();window.dispatchEvent(new CustomEvent('dn-crafting-purposes-changed'));}
  };
  window.addEventListener('dn-strategies-changed',()=>window.dispatchEvent(new CustomEvent('dn-crafting-purposes-changed')));
})();
