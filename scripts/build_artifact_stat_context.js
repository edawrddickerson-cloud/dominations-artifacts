/* Consolidate reviewed stat facts; OCR observations are separate audit evidence.
 * Never infer ordinary Hall pools from named artifacts, or signs from ratings. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function build(){
  const army=JSON.parse(read('data/army_catalog.json')),ratings=JSON.parse(read('data/perk_rating_defaults.json'));
  const possible=JSON.parse(read('data/possible_artifact_stats.json')),artifacts=JSON.parse(read('data/artifacts.json'));
  const video=JSON.parse(read('tests/scanner/video/2026-10-16.json'));
  const sandbox={window:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};vm.createContext(sandbox);
  for(const file of ['ui/data/army_catalog.js','ui/shared.js'])vm.runInContext(read(file),sandbox);
  const DN=sandbox.window.DN,mapping=DN.parseMappingCsv(read('data/perk_name_mapping.csv')),canon=DN.makeCanonPerk(mapping);
  const reviewed=new Map(possible.stats.filter(stat=>stat.active).map(stat=>[stat.canonical_name,stat]));
  const groups=new Map(DN.PERK_GROUPS.flatMap(group=>group.perks.map(perk=>[perk.name,{group:group.id,kind:perk.kind}])));
  const names=[...new Set([...Object.keys(ratings),...Object.keys(army.perk_signs)])].sort();
  const profiles=Object.fromEntries(Object.entries(possible.tier_profiles).map(([mode,p])=>[p.hall.toLowerCase(),{
    mode,scope:p.scope,tiers:Object.fromEntries(['white','green','blue'].map((tier,i)=>[tier,p.user_supplied_starting_magnitudes[i]])),
    levels:{min:1,max:10,magnitude_step:1},status:p.status,source:p.source,
  }]));
  const stats=Object.fromEntries(names.map(name=>{
    const extra=reviewed.get(name),sign=army.perk_signs[name] ?? null;
    if(extra?.expected_sign && sign!==extra.expected_sign)throw new Error('Sign sources disagree: '+name);
    const availability=Object.fromEntries(['main','war'].map(hall=>{
      const value=extra?.availability[hall==='main'?'Multiplayer':'War'];
      return [hall,{status:value?.status || 'unknown',source:value?.confirmation_source || value?.evidence_source || null}];
    }));
    return [name,{expected_sign:sign,sign_source:sign?army.perk_sign_authority:null,unit:extra?.unit || 'unknown',
      ...groups.get(name),aliases:[...new Set(Object.entries(mapping).filter(([alias,target])=>target===name && alias!==name).map(([alias])=>alias))].sort(),
      ordinary_availability:availability,named_evidence:{}}];
  }));
  // Reviewed pixels establish positive availability evidence for that Hall and
  // category. They never establish that an unseen stat is unavailable elsewhere.
  for(const label of video.cases){
    const type=label.category.toLowerCase().replace(/^war /,''),hall=label.hall;
    if(!({main:['weapon','armor','jewelry','pottery'],war:['weapon','armor','equipment']}[hall] || []).includes(type))continue;
    for(const [name] of label.rows){
      const stat=stats[canon(name)];if(!stat)continue;
      stat.unit='percent';const availability=stat.ordinary_availability[hall];
      if(availability.status==='unknown'){availability.status='observed-reviewed';availability.source='tests/scanner/video/2026-10-16.json';}
      availability.reviewed_frames ||= [];if(!availability.reviewed_frames.includes(label.time))availability.reviewed_frames.push(label.time);
    }
  }
  for(const item of artifacts.filter(item=>item.release_status==='Released'))for(let row=1;row<=6;row++){
    const stat=stats[canon(item['perk_'+row+'_name'])];if(!stat)continue;
    const key=item.hall.toLowerCase()+':'+item.grade.toLowerCase();
    const evidence=stat.named_evidence[key] ||= {count:0,bases:[],maxima:[],examples:[]};evidence.count++;
    for(const [suffix,target] of [['base','bases'],['max','maxima']]){
      const raw=item['perk_'+row+'_'+suffix];if(raw==='' || raw==null)continue;
      const value=Number(raw);if(!Number.isFinite(value))continue;
      if(stat.expected_sign && Math.sign(value)!==stat.expected_sign)throw new Error('Named evidence sign conflict: '+item.name);
      if(!evidence[target].includes(value))evidence[target].push(value);
    }
    if(evidence.examples.length<3 && !evidence.examples.includes(item.artifact_id))evidence.examples.push(item.artifact_id);
  }
  for(const stat of Object.values(stats))for(const evidence of Object.values(stat.named_evidence))for(const key of ['bases','maxima'])evidence[key].sort((a,b)=>a-b);
  return {schema_version:1,kind:'artifact-stat-context',sources:['data/army_catalog.json','data/possible_artifact_stats.json','data/artifacts.json','data/perk_name_mapping.csv','tests/scanner/video/2026-10-16.json'],
    rules:{fixed_sign:true,ordinary_categories:{main:['weapon','armor','jewelry','jewellery','pottery'],war:['weapon','armor','equipment']},
      unknown_availability_is_not_absence:true,stored_text_colour_is_not_tier:true,named_evidence_is_not_an_ordinary_roll_pool:true,
      raw_ocr_is_preserved:true,context_resolution_is_not_direct_ocr:true},tier_profiles:profiles,stats};
}
function files(data){const json=JSON.stringify(data,null,2)+'\n';return {
  'data/artifact_stat_context.json':json,'ui/data/artifact_stat_context.json':json,
  'ui/data/artifact_stat_context.js':'// Generated by scripts/build_artifact_stat_context.js; edit its reviewed source data.\nwindow.DN_ARTIFACT_STAT_CONTEXT = '+JSON.stringify(data)+';\n',
};}
function main(){
  const data=build(),check=process.argv.includes('--check');
  for(const [file,content] of Object.entries(files(data))){if(check){if(read(file)!==content)throw new Error('Regenerate '+file);}else fs.writeFileSync(path.join(root,file),content);}
  const summary={stats:Object.keys(data.stats).length,withSign:Object.values(data.stats).filter(stat=>stat.expected_sign).length,
    missingSign:Object.entries(data.stats).filter(([,stat])=>!stat.expected_sign).map(([name])=>name),
    ordinaryAvailability:Object.fromEntries(['main','war'].map(hall=>[hall,Object.values(data.stats).filter(stat=>stat.ordinary_availability[hall].status!=='unknown').length])),tierProfiles:data.tier_profiles};
  const observations=process.argv.filter(arg=>arg.startsWith('--observations=')).map(arg=>arg.slice(15));
  if(observations.length){const {create}=require('../ui/artifact-stat-context.js'),context=create(data);summary.observations=observations.map(file=>({file:path.basename(file),...context.summarizeObservations(JSON.parse(fs.readFileSync(file,'utf8')))}));}
  const report=process.argv.find(arg=>arg.startsWith('--report='))?.slice(9);
  if(report){const target=path.resolve(root,report);if(!target.startsWith(path.join(root,'reports')+path.sep)||path.extname(target)!=='.json')throw new Error('Audit reports must be JSON inside reports/.');fs.writeFileSync(target,JSON.stringify(summary,null,2)+'\n');}
  console.log(JSON.stringify({...summary,...(summary.observations?{observations:summary.observations.map(({file,counts,itemRecords})=>({file,counts,...(itemRecords?{itemRecords:itemRecords.counts}:{})}))}:{})},null,2));
}
if(require.main===module)main();
module.exports={build,files};
