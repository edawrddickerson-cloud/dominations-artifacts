/* Reviewed October 29 text spellings, with the full competing stat catalogue.
 * These cases establish matching behavior, not independent screenshot truth. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app={window:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};vm.createContext(app);
for(const file of ['ui/data/army_catalog.js','ui/shared.js','ui/scanner-name-catalog.js','ui/scanner-recognition.js'])vm.runInContext(fs.readFileSync(file,'utf8'),app);
const R=app.window.DNScannerRecognition,DN=app.window.DN,catalog=app.window.DNScannerNameCatalog;
const names=Object.keys(JSON.parse(fs.readFileSync('data/perk_rating_defaults.json','utf8')));
const canon=DN.makeCanonPerk(DN.parseMappingCsv(fs.readFileSync('data/perk_name_mapping.csv','utf8')));
for(const [raw,name,value] of [
  ['Redaunt Damage','Redoubt Damage',6],
  ['Enemy Redaunt Damage','Enemy Redoubt Damage',-6],
  ['invading Supply Vehicle Hapcines','Invading Supply Vehicle Hitpoints',-6],
  ['Supply Vehicle Hapcines','Supply Vehicle Hitpoints',6],
  ['Fightet Htpaints','Fighter Hitpoints',6],
  ['Fightet Damage','Fighter Damage',6],
  ['Libary Tech Oil Cost','Library Tech Oil Cost',-6],
  ['Supply Vehicie Healing','Supply Vehicle Healing',6],
  ['Invadimg Supply Vetucle Healing','Invading Supply Vehicle Healing',-6],
]) {
  const percent=(value>0?'+':'')+value+'%';
  for(const parsed of [R.parseFieldRow(raw,percent,names,canon),R.parseText(raw+' '+percent,names,canon,1)]) {
    const row=parsed.row || parsed.rows[0];
    assert.equal(row.name,name,raw);assert.equal(row.assumed,false,raw);assert.equal(parsed.valid,true,raw);
    assert.equal(row.rawName,raw);assert.equal(row.value,value);assert.equal(row.nameMatch.method,'ocr-catalogue',raw);
    assert.ok(row.nameMatch.corrections.length>0,'reviewed correction remains visible');
  }
}
// No generic Hapcines rule: an intact Supply Vehicle anchor is required.
for(const label of ['hapcines','assault vehicle hapcines','brand new vehicle hapcines'])assert.equal(catalog.correct(label).text,label);
assert.equal(catalog.correct('invading supply vehicle hapcines').text,'invading supply vehicle hitpoints');
for(const label of ['hipsinns','hipolis','paral','leading','rational','wines'])assert.equal(catalog.correct(label).text,label,'unreviewed proposals stay inactive: '+label);
for(const label of ['xxredauntxx damage','supply vehicle xxhapcinesxx'])assert.equal(catalog.correct(label).text,label);
for(const label of ['leading Supply Vehicle Hapcines','Enemy Supply Vehicle Hapcines','Invading Brand New Vehicle Hapcines']) {
  assert.notEqual(R.matchName(label,names,-6)?.automatic,true,'cannot supply a qualifier or stat identity: '+label);
}
for(const [raw,name,value] of [
  ['Redaunt Damage','Redoubt Damage',6],
  ['Fightet Damage','Fighter Damage',6],
  ['Supply Vehicle Hapcines','Supply Vehicle Hitpoints',6],
  ['Invading Supply Vehicle Hapcines','Invading Supply Vehicle Hitpoints',-6],
]) {
  assert.notEqual(R.matchName(raw,names.filter(candidate=>candidate!==name),value)?.automatic,true,'missing identity cannot become a neighboring stat: '+raw);
  const parsed=R.parseFieldRow(raw,(value>0?'-':'+')+'6%',names,canon);
  assert.equal(parsed.valid,false,'word corrections cannot invert a sign: '+raw);
  assert.equal(parsed.row.value,-value,'original signed percentage survives');
}
for(const percent of ['6%','+I%','-O%','+61%']) {
  const parsed=R.parseFieldRow('Supply Vehicle Hapcines',percent,names,canon);
  assert.equal(parsed.row.value,null);assert.equal(parsed.valid,false,'a matched name cannot repair '+percent);
}
for(const name of ['Supply Vehicle Healing','Invading Supply Vehicle Healing','Redoubt Hitpoints','Fighter Damage','Fighter Hitpoints']) {
  const value=DN.expectedPerkSign(name) || 1,result=R.matchName(name,names,value);
  assert.equal(result.name,name);assert.equal(result.method,'exact');assert.equal(result.confidence,1);
}
// Installing a reviewed spelling catalogue must preserve the existing glyph
// matcher's independent acceptance evidence for the same canonical stat.
for(const [raw,value,name] of [
  ['Barooka Darnage',1,'Bazooka Damage'],
  ['invading Attack Helicapte: Camage',null,'Invading Attack Helicopter Damage'],
  ['Invading Attack Helicoptes Damage Ll',null,'Invading Attack Helicopter Damage'],
]) {
  app.window.DNScannerNameCatalog=null;const glyph=R.matchName(raw,names,value);
  app.window.DNScannerNameCatalog=catalog;const reviewed=R.matchName(raw,names,value);
  assert.equal(glyph.name,name);assert.equal(glyph.automatic,true,raw+' glyph baseline');
  assert.equal(reviewed.name,name);assert.equal(reviewed.automatic,true,raw+' catalogue must retain acceptance');
  assert.ok(reviewed.confidence>=R.NAME_MATCH_THRESHOLD);
}
console.log('October 29 reviewed spellings, qualifier/entity/effect neighbors, raw numeric evidence and catalogue acceptance regressions passed.');
