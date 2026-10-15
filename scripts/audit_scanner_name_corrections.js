/* Rebuild the reviewable word/name catalogue from active rules and local evidence.
 * Optional --exports-dir=PATH reads text-only scanner exports. No uploads or
 * automatic learning: newly observed spellings remain proposals for review. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),catalog=require('../ui/scanner-name-catalog');
const normalize=text=>String(text || '').toLowerCase().replace(/['’‘]/g,'').replace(/[-–—.,:;“”"()=]/g,' ').replace(/\s+/g,' ').trim();
function buildReport(files) {
  const context={window:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};vm.createContext(context);
  for(const file of ['ui/data/army_catalog.js','ui/shared.js','ui/scanner-recognition.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  const R=context.window.DNScannerRecognition,names=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'data/perk_rating_defaults.json'),'utf8')));
  const known=new Set(names),words=new Set(names.flatMap(name=>normalize(name).split(' '))),observed=new Map(),proposals=new Map();
  function record(raw,target,value,source) {
    if(typeof raw!=='string')return;
    const name=raw.replace(/\s*[+«»–—=\-]?\s*\d.*$/,'').replace(/\s+[+-].*$/,'').trim();
    if(!/[a-z]/i.test(name) || name.length>150)return;
    const sign=Number.isFinite(value)?Math.sign(value):null,key=normalize(name)+'|'+sign;
    if(!observed.has(key))observed.set(key,{raw_name:name,sign,occurrences:0,sources:new Set(),samples:[]});
    const entry=observed.get(key);entry.occurrences++;entry.sources.add(source);if(entry.samples.length<3 && !entry.samples.includes(raw))entry.samples.push(raw);
    // Existing scan assignments can suggest word pairs; they are not independent
    // labels and never activate a new rule. Known words are protected.
    if(known.has(target) && normalize(name)!==normalize(target)) {
      const a=normalize(name).split(' '),b=normalize(target).split(' ');
      if(a.length===b.length)for(let i=0;i<a.length;i++)if(a[i]!==b[i] && /^[a-z]{3,}$/.test(a[i]) && !words.has(a[i])) {
        const key=a[i]+'|'+b[i];if(catalog.rules.some(rule=>rule.from===a[i] && rule.to===b[i]))continue;
        if(!proposals.has(key))proposals.set(key,{from:a[i],to:b[i],status:'needs_review',sources:new Set(),examples:new Set()});
        proposals.get(key).sources.add(source);proposals.get(key).examples.add(name+' → '+target);
      }
    }
  }
  for(const file of files) {
    const data=JSON.parse(fs.readFileSync(file,'utf8')),source=path.basename(file);
    function visit(value) {
      if(!value || typeof value!=='object')return;
      if(typeof value.raw==='string')record(value.rawName || value.raw,value.name,value.value,source);
      for(const child of Object.values(value))if(typeof child==='object')Array.isArray(child)?child.forEach(visit):visit(child);
    }
    visit(data);
    for(const label of data.labels || [])for(const sample of label.samples || []) {
      const value=/([+-]\s*\d+(?:[.,]\d+)?)\s*%/.exec(sample);
      record(sample,label.name,value?Number(value[1].replace(/\s/g,'').replace(',','.')):null,source);
    }
  }
  const corrected_names=[],unresolved=[];let before=0,after=0,newlyAutomatic=0;
  for(const entry of observed.values()) {
    context.window.DNScannerNameCatalog=null;const baseline=R.matchName(entry.raw_name,names,entry.sign);
    context.window.DNScannerNameCatalog=catalog;const matched=R.matchName(entry.raw_name,names,entry.sign);
    if(baseline?.automatic)before++;if(matched?.automatic)after++;
    if(!baseline?.automatic && matched?.automatic)newlyAutomatic++;
    const evidence={...entry,sources:[...entry.sources]};
    if(matched?.corrections?.length)corrected_names.push({...evidence,canonical_name:matched.name,automatic:matched.automatic,confidence:matched.confidence,raw_similarity:matched.rawSimilarity,corrections:matched.corrections.map(({from,to})=>({from,to}))});
    else if(!matched?.automatic)unresolved.push({...evidence,suggestion:matched?.name || null});
  }
  const rules=catalog.rules.map(rule=>({...rule,evidence:corrected_names.filter(entry=>entry.corrections.some(correction=>correction.from===rule.from && correction.to===rule.to)).map(entry=>({raw_name:entry.raw_name,canonical_name:entry.canonical_name,sources:entry.sources}))}));
  return {version:1,notes:['Active word/phrase rules are reviewed; mined proposals are inactive.','Confidence uses name similarity after reviewed word corrections, capped by the weakest applied rule. It is not a calibrated probability.','Counts describe unique raw-name/sign combinations in selected saved evidence, not independent artifacts, live accuracy or percentage-reading success.','Comparison baseline is the current glyph matcher without the reviewed word catalogue.','Occurrences may repeat evidence in scan passes, saved items and label samples.'],sources:files.map(file=>path.basename(file)),summary:{active_rules:rules.length,target_words_or_phrases:new Set(rules.map(rule=>rule.to)).size,unique_raw_name_sign_pairs:observed.size,automatic_without_word_catalogue:before,automatic_with_word_catalogue:after,newly_automatic:newlyAutomatic,still_unresolved_or_suggested:observed.size-after},rules,corrected_names:corrected_names.sort((a,b)=>a.raw_name.localeCompare(b.raw_name)),proposed_word_corrections:[...proposals.values()].map(entry=>({...entry,sources:[...entry.sources],examples:[...entry.examples].slice(0,5)})).sort((a,b)=>a.to.localeCompare(b.to)||a.from.localeCompare(b.from)),unresolved:unresolved.sort((a,b)=>b.occurrences-a.occurrences)};
}
if(require.main===module) {
  const files=fs.readdirSync(path.join(root,'tests/scanner')).filter(file=>file.endsWith('.ocr-result.json')).map(file=>path.join(root,'tests/scanner',file));
  const dir=process.argv.find(arg=>arg.startsWith('--exports-dir='))?.slice('--exports-dir='.length);
  if(dir)files.push(...fs.readdirSync(dir).filter(file=>/^artifact-perk-observations.*\.json$/.test(file)).map(file=>path.join(dir,file)));
  const report=buildReport(files);
  if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,'reports/scanner-name-corrections.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary,null,2));
}
module.exports={buildReport};
