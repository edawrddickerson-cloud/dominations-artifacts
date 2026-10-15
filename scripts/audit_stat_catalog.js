/* Catalogue coverage audit. Pattern gaps are review candidates, never new stats.
 * Uses army aliases and healing counterparts; does not infer mode availability. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
// User feedback, 2026-10-15: probably absent; symmetry alone is not evidence.
const excludedCandidates=['Coalition Troop Hitpoints','Enemy Defender Damage','Invading Wall Breacher Damage','Invading Wall Breacher Hitpoints'];
function audit({ratings,army,groups,mapping,artifacts}) {
  const names=Object.keys(ratings),known=new Set(names),gaps=[],units=[];
  const find=(labels,prefix,effect)=>labels.map(label=>prefix+label+' '+effect).filter(name=>known.has(name));
  // Actual units plus explicitly represented special units (e.g. Transport).
  const entries=army.units.map(unit=>({...unit,labels:[unit.name,...unit.aliases]}));
  const represented=new Set(entries.flatMap(unit=>unit.labels));
  for(const group of groups.filter(group=>['single','invading-single'].includes(group.id)))for(const perk of group.perks) {
    const label=perk.name.replace(/^Invading /,'').replace(/ (Damage|Hitpoints)$/,'');
    if(!['damage','hp'].includes(perk.kind) || !/ (Damage|Hitpoints)$/.test(perk.name) || / & | and /.test(label) || represented.has(label))continue;
    entries.push({name:label,labels:[label],type:'catalogue-only'});represented.add(label);
  }
  for(const unit of entries)for(const prefix of ['', 'Invading ']) {
    const damage=find(unit.labels,prefix,'Damage'),healing=find(unit.labels,prefix,'Healing'),hp=find(unit.labels,prefix,'Hitpoints');
    const counterpart=find(unit.labels,prefix?'':'Invading ','Damage').length || find(unit.labels,prefix?'':'Invading ','Healing').length || find(unit.labels,prefix?'':'Invading ','Hitpoints').length;
    const special=unit.name==='Transport' || unit.name==='Recon';
    const effects=healing.length || ['Supply Vehicle','Tactical Helicopter'].includes(unit.name)?['Healing','Hitpoints']:['Damage','Hitpoints'];
    const missing=effects.filter(effect=>!find(unit.labels,prefix,effect).length);
    units.push({unit:unit.name,qualifier:prefix.trim() || 'own',aliases:unit.labels.slice(1),damage,healing,hitpoints:hp,missing,exception:special?'special role: ordinary damage/HP symmetry may not apply':null});
    if(missing.length && (damage.length || healing.length || hp.length || counterpart))for(const effect of missing) {
      gaps.push({candidate:prefix+unit.name+' '+effect,priority:special?'low':'review',reason:special?'Special unit role; existence cannot be inferred from symmetry.':damage.length || healing.length || hp.length?'Missing partner in the unit effect pair.':'Unit has effects for the opposite qualifier but none for this qualifier.',aliases_checked:unit.labels,evidence:[...damage,...healing,...hp],confirmed:false});
    }
  }
  // Other object families: missing damage/HP partners within their own group.
  for(const group of groups.filter(group=>!['single','invading-single'].includes(group.id))) {
    const pairs=new Map();
    for(const perk of group.perks) {
      const match=/^(.*?) (Damage|Hitpoints)$/.exec(perk.name);if(!['damage','hp'].includes(perk.kind) || !match || / & | and /.test(match[1]))continue;
      // Airstrip Unit/Troop is an existing catalogue naming inconsistency.
      const entity=match[1].replace(/Airstrip Unit$/,'Airstrip Troop');
      if(!pairs.has(entity))pairs.set(entity,new Map());pairs.get(entity).set(match[2],perk.name);
    }
    for(const [entity,effects] of pairs)for(const effect of ['Damage','Hitpoints'])if(!effects.has(effect))gaps.push({candidate:entity+' '+effect,priority:'review',reason:'Missing damage/HP partner within '+group.label+'. Some families may intentionally have only one effect.',evidence:[...effects.values()],confirmed:false});
  }
  const mappingTargets=new Set(Object.values(mapping));
  const excluded_candidates=gaps.filter(gap=>excludedCandidates.includes(gap.candidate)).map(gap=>({...gap,status:'dismissed_by_user',reason:'User considers this stat absent. Do not suggest it from symmetry alone.'}));
  for(let index=gaps.length-1;index>=0;index--)if(excludedCandidates.includes(gaps[index].candidate))gaps.splice(index,1);
  const artifactNames=new Set(artifacts.flatMap(item=>Object.entries(item).filter(([key,value])=>/^perk_\d+_name$/.test(key) && value).map(([,value])=>mapping[value] || value)));
  return {known_stat_count:names.length,notes:['Pattern gaps are hypotheses only; no catalogue entries or ratings were added.','Army aliases describe the same unit, but Enemy and Invading remain separate stat identities.','Damage/HP symmetry is not evidence of availability in Main or War.'],units,excluded_candidates,gaps:gaps.sort((a,b)=>a.priority.localeCompare(b.priority) || a.candidate.localeCompare(b.candidate)),naming_inconsistencies:names.includes('Invading Airstrip Unit Hitpoints')?[{name:'Invading Airstrip Unit Hitpoints',counterpart:'Invading Airstrip Troop Damage',reason:'Unit versus Troop; verify the displayed game wording before renaming.'}]:[],integration:{rating_names_missing_mapping:names.filter(name=>!mappingTargets.has(name)),artifact_names_missing_ratings:[...artifactNames].filter(name=>!known.has(name)).sort()}};
}
function loadAudit() {
  const read=file=>fs.readFileSync(path.join(root,file),'utf8');
  const context={window:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};vm.createContext(context);
  for(const file of ['ui/data/army_catalog.js','ui/shared.js'])vm.runInContext(read(file),context);
  const artifacts=JSON.parse(read('data/artifacts.json'));
  return audit({ratings:JSON.parse(read('data/perk_rating_defaults.json')),army:JSON.parse(read('data/army_catalog.json')),groups:context.window.DN.PERK_GROUPS,mapping:context.window.DN.parseMappingCsv(read('data/perk_name_mapping.csv')),artifacts:Array.isArray(artifacts)?artifacts:artifacts.artifacts || []});
}
if(require.main===module) {
  const result=loadAudit();
  if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,'reports/stat-catalog-audit.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
module.exports={audit,loadAudit};
