const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};vm.createContext(context);
for(const file of ['ui/data/army_catalog.js','ui/shared.js','ui/scanner-name-catalog.js','ui/scanner-recognition.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const R=context.window.DNScannerRecognition,DN=context.window.DN;
const names=Object.keys(JSON.parse(fs.readFileSync('data/perk_rating_defaults.json','utf8')));
const canon=DN.makeCanonPerk(DN.parseMappingCsv(fs.readFileSync('data/perk_name_mapping.csv','utf8')));
// Observed OCR spellings and glyph confusions, with the full competing catalogue.
for(const [raw,name,value] of [
  ['Guernlla Damage','Guerrilla Damage',6],
  ['Invading Guernlla Hitpoints','Invading Guerrilla Hitpoints',-6],
  ['Airstnp Troop Damage','Airstrip Troop Damage',6],
  ['Sniper Tower Hitpomts','Sniper Tower Hitpoints',6],
  ['Enemy Siper Tower Hitpoints','Enemy Sniper Tower Hitpoints',-6],
  ['Heawy Tank Damage','Heavy Tank Damage',6],
  ['Bomiber Damage','Bomber Damage',6],
  ['Vault Interesl','Vault Interest',6],
  ['Library Tech Oil Cosl','Library Tech Oil Cost',-6],
  ['Forest Expansion Cost Ref und','Forest Expansion Cost Refund',6],
]) {
  const percentage=(value>0?'+':'')+value+'%',line=raw+' '+percentage;
  for(const parsed of [R.parseText(line,names,canon,1),R.parseFieldRow(raw,percentage,names,canon)]) {
    const row=parsed.row || parsed.rows[0];
    assert.equal(row.name,name,line);assert.equal(row.assumed,false,line);
    assert.equal(row.nameCorrected,true);assert.equal(parsed.valid,true,line);
    assert.ok(row.nameMatch.confidence>=R.NAME_MATCH_THRESHOLD);
    assert.equal(row.rawName,raw);assert.equal(row.value,value);
  }
}
assert.equal(R.matchName('Guernlla Damage',names,6,{threshold:.99}).automatic,false,'raising threshold leaves a review suggestion');
const catalog=context.window.DNScannerNameCatalog;
const normalize=value=>value.toLowerCase().replace(/['’‘]/g,'').replace(/-/g,' ').replace(/\s+/g,' ').trim();
const variants=new Set();
for(const rule of catalog.rules) {
  assert.ok(!variants.has(rule.from),'one reviewed target per spelling: '+rule.from);variants.add(rule.from);
  assert.ok(rule.source && rule.confidence>=.9 && rule.confidence<1,'rule has provenance and confidence');
  const name=names.find(name=>(' '+normalize(name)+' ').includes(' '+rule.to+' '));assert.ok(name,'known vocabulary target: '+rule.to);
  const label=(' '+normalize(name)+' ').replace(' '+rule.to+' ',' '+rule.from+' ').trim(),value=DN.expectedPerkSign(name) || 1;
  const result=R.parseFieldRow(label,(value>0?'+':'')+value+'%',names,canon);
  assert.equal(result.row.name,name,rule.from);assert.equal(result.row.assumed,false,rule.from);
  assert.ok(result.row.nameMatch.corrections.some(correction=>correction.from===rule.from),rule.from);
}
for(const [label,name,value] of [
  ['Bazooka Hitpomts','Bazooka Hitpoints',6],
  ['Invading Tactical Hehcopter Hitpomnts','Invading Tactical Helicopter Hitpoints',-6],
  ['is sile Silo HApoines','Missile Silo Hitpoints',6],
  ['Irswadiimg MRL Htpowits','Invading MRL Hitpoints',-6],
]) {
  const result=R.parseFieldRow(label,(value>0?'+':'')+value+'%',names,canon);
  assert.equal(result.row.name,name);assert.equal(result.valid,true,label);
  assert.equal(result.row.nameMatch.method,'ocr-catalogue');
  if(name!=='Invading Tactical Helicopter Hitpoints')assert.ok(result.row.nameMatch.rawSimilarity<.9,'reviewed corrections rescue a below-threshold raw name');
  assert.equal(result.row.rawName,label);
}
assert.equal(R.matchName('Oll Looted',['Oll Looted','Oil Looted'],6).name,'Oll Looted','exact known names are never rewritten');
assert.equal(catalog.correct('hitpomts',{protectedWords:new Set(['hitpomts'])}).text,'hitpomts','existing vocabulary protects real words');
assert.equal(catalog.correct('xxhitpomtsxx').text,'xxhitpomtsxx','rules match whole words, never substrings');
assert.equal(R.parseFieldRow('Bazooka Hitpomts','-6%',names,canon).valid,false,'reviewed word correction cannot invert a captured sign');
assert.equal(R.parseFieldRow('Enemy Bazooka Hitpomts','-6%',names,canon).row.known,false,'word catalogue cannot invent a missing Enemy stat');
const weak=R.parseText('Bazooka Hixpoixxs +6%',names,canon,1);
assert.equal(weak.rows[0].name,'Bazooka Hitpoints');assert.equal(weak.rows[0].assumed,true);assert.equal(weak.valid,false);
assert.equal(R.matchName('Long Unit Damag',['Long Unit Damage','Long Unit Damages'],1),null,'near tie stays unresolved');
for(const label of ['Er tpoints','zzzzzzzzzzzz Damage','Invading Brand New Unit Hitpoints'])assert.equal(R.matchName(label,names,1),null,label);
assert.equal(R.matchName('Enemy Sniper Tower Hitpoints',names.filter(name=>name!=='Enemy Sniper Tower Hitpoints'),-6),null,'missing known name cannot lose its qualifier');
assert.equal(R.parseText('Invading Raider Damag +6%',names,canon,1).rows[0].known,false,'wrong-sign candidates are excluded');
for(const raw of ['Guernlla Damage 6%','Guernlla Damage +I%']) {
  const parsed=R.parseText(raw,names,canon,1);assert.equal(parsed.rows[0].name,'Guerrilla Damage');
  assert.equal(parsed.rows[0].value,null);assert.equal(parsed.valid,false,'name confidence cannot repair numeric evidence');
}
// A unique exact name always wins even among closely named real stats.
for(const name of names) {
  const value=DN.expectedPerkSign(name) || 1;
  const row=R.parseFieldRow(name,(value>0?'+':'')+value+'%',names,canon).row;
  assert.equal(row.name,name);assert.equal(row.nameMatch.confidence,1);assert.equal(row.nameCorrected,false);
}
const {loadAudit}=require('./audit_stat_catalog');const audit=loadAudit();
assert.equal(audit.known_stat_count,names.length);
assert.deepEqual(audit.integration.rating_names_missing_mapping,[]);
assert.deepEqual(audit.integration.artifact_names_missing_ratings,[]);
assert.ok(!audit.gaps.some(gap=>gap.candidate==='Coalition Troop Hitpoints'));
assert.ok(!audit.gaps.some(gap=>gap.candidate==='Enemy Defender Damage'));
assert.equal(audit.excluded_candidates.length,4,'user-dismissed symmetry candidates are not suggested again');
assert.ok(!audit.gaps.some(gap=>/Guerrilla|Commando|Supply Vehicle|Tactical Helicopter|Hitpoints &|Airstrip/.test(gap.candidate)),'aliases, combined effects and healing units do not manufacture gaps');
assert.ok(audit.gaps.every(gap=>gap.confirmed===false));
context.document={getElementById:()=>null};
vm.runInContext(fs.readFileSync('ui/scanner-collection.js','utf8'),context);
const collector=context.window.DNScannerCollectionCore.createCollector();
const clear=R.parseText('Guernlla Damage +6%',names,canon,1),assumed={...clear.rows[0],assumed:true};
collector.record({rows:[assumed]});collector.record(clear);
assert.equal(collector.summary().labels[0].known,true,'automatic registration upgrades an earlier assumed label');
collector.record({rows:[assumed]});assert.equal(collector.summary().labels[0].known,true,'weak retry does not downgrade registered label');
const exported=collector.exportData();assert.equal(exported.scans[1].observations[0].rows[0].rawName,'Guernlla Damage');
assert.ok(exported.scans[1].observations[0].rows[0].nameMatch.confidence>=.9,'export retains automatic matching evidence');
collector.clear();collector.record({observations:[{rows:[assumed]},{rows:clear.rows}]});
assert.equal(collector.summary().labels[0].known,true,'a stronger row pass upgrades a label within one scan');
assert.equal(collector.summary().labels[0].seenInScans,1,'multiple passes count as one scan');
console.log('Automatic name thresholds, competing catalogue, glyphs, raw evidence, sign/value gates, all '+names.length+' exact names, and catalogue audit passed.');
