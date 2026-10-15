/* Authority: Scanner OCR validation contract and verified pic1 fixture labels.
 * Ownership: Deterministic parser tests; real browser OCR lives in the fixture harness.
 * Invariants: Unknown names, missing signs/values, and incomplete rows never confirm.
 * History: All visible rows count, including locked rows and duplicate perks. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const context={window:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
vm.createContext(context);
for(const file of ['ui/data/army_catalog.js','ui/shared.js','ui/scanner-recognition.js'])vm.runInContext(read(file),context);
const DN=context.window.DN, parse=context.window.DNScannerRecognition.parseText;
const categoryRecognition=context.window.DNScannerRecognition;
for(const [text,type] of [['Weapon','Weapon'],['War Armor','Armor'],['Armour','Armor'],['Jewellery','Jewelry'],['Pottery','Pottery'],['War Equipment','Equipment']])assert.equal(categoryRecognition.parseCraftCategory(text),type);
assert.equal(categoryRecognition.parseCraftCategory('Pottery',41),'Pottery','exact ornate-font label can be accepted at moderate confidence');
assert.equal(categoryRecognition.parseCraftCategory('Pottery',20),null,'very weak labels require manual fallback');
assert.equal(categoryRecognition.parseCraftCategory('Pottery &',41),null,'weak noisy labels are not exact matches');
assert.equal(categoryRecognition.parseCraftCategory('Weapon Armor',90),null,'ambiguous category matches are rejected');
assert.equal(categoryRecognition.parseCraftCategory('Wcapon',90),null,'no fuzzy category guessing');
assert.equal(categoryRecognition.craftCategoryEvidence({text:'Pottery icon Main Hall',confidence:25,words:[{text:'Pottery',confidence:91},{text:'icon',confidence:12}]}),'Pottery','clear category word survives a weak icon or surrounding labels');
assert.equal(categoryRecognition.craftCategoryEvidence({text:'Weapon Armor',confidence:90,words:[{text:'Weapon',confidence:90},{text:'Armor',confidence:90}]}),null,'contradictory category words remain ambiguous');
assert.equal(categoryRecognition.craftCategoryEvidence({words:[{text:'Weapon'}]}),null,'missing word confidence cannot confirm a category');
const swatch=(...colours)=>new Uint8ClampedArray(colours.flatMap(colour=>Array.from({length:100},()=>[...colour,255]).flat()));
const hallColour=categoryRecognition.classifyHallColour;
assert.equal(hallColour(swatch([145,12,20])),'main','red ribbon identifies Main');
assert.equal(hallColour(swatch([16,54,156])),'war','blue ribbon identifies War');
assert.equal(hallColour(swatch([65,12,18])),'main','dim red ribbon is still Main');
assert.equal(hallColour(swatch([12,25,64])),'war','dim blue ribbon is still War');
assert.equal(hallColour(swatch([76,89,103],[220,181,74],[60,240,80])),null,'grey panel, gold trim and green text do not choose a hall');
assert.equal(hallColour(swatch([145,12,20],[16,54,156])),null,'both hall colours require manual selection');
assert.equal(hallColour(new Uint8ClampedArray([240,0,0,255,...Array(399).fill(0)])),null,'a stray coloured pixel cannot choose a hall');
assert.equal(categoryRecognition.craftHall({colourHall:'war',type:'Pottery',rows:[{value:11}],selected:'main',colourOnly:true}).hall,'war','ribbon colour takes priority over text, tiers and the selected hall');
assert.equal(categoryRecognition.craftHall({type:'Equipment',rows:[{value:5}],selected:'main',colourOnly:true}).source,'selected-hall','uncertain colour retains manual selection instead of inferring from OCR');
const header=categoryRecognition.categoryRect({width:1316,height:746},{x:493/1316,y:179/746,width:633/1316,height:327/746});
assert.ok(header.x<=325 && header.x+header.width>=450 && header.y<=102 && header.y+header.height>=132,'category crop includes the real crafting label');
assert.equal(categoryRecognition.categoryRect({width:640,height:360},null),null,'no header crop without a calibrated panel');
const classify=categoryRecognition.craftHall;
assert.equal(classify({type:'Equipment',selected:'main'}).hall,'war');
assert.equal(classify({type:'Pottery',selected:'war'}).hall,'main');
assert.equal(classify({type:'Armor',rawType:'War Armor',selected:'main'}).hall,'war');
assert.equal(classify({type:'Weapon',rows:[{value:-3}],selected:'main'}).hall,'war','signed war tiers override the previous hall');
assert.equal(classify({type:'Armor',rows:[{value:11}],selected:'war'}).hall,'main');
assert.equal(classify({rows:[{value:1}],selected:'war'}).source,'selected-hall','white tiers cannot distinguish halls');
for(const selected of ['main','war']) {
  const shared=classify({rows:[{value:6}],selected});
  assert.equal(shared.hall,selected,'shared 6% tier keeps the selected hall');
  assert.equal(shared.source,'selected-hall');
}
assert.equal(classify({rows:[{value:5,inferred:true}],selected:'main'}).hall,'main','inferred values cannot determine hall');
assert.equal(classify({rows:[{value:3},{value:11}],selected:'war'}).source,'selected-hall','conflicting tiers require selected hall');
const names=Object.keys(JSON.parse(read('ui/data/perk_rating_defaults.json')));
const canon=DN.makeCanonPerk(DN.parseMappingCsv(read('ui/data/perk_name_mapping.csv')));
const text=['Air Defense Damage +1%','Sniper Tower Hitpoints +1%','Catapult Hitpoints +1%','Catapult Damage +1%','Catapult Damage +1%'].join('\n');
for(const value of [123,-123,40.01,-40.01]) {
  const read=parse('Catapult Damage '+(value>=0?'+':'')+value+'%',names,canon,1);
  assert.equal(read.rows[0].value,null,'out-of-range percentage is unread, never clamped');
  assert.equal(read.valid,false);assert.match(read.warnings.join(' '),/-40% to \+40%/);
}
assert.equal(parse('Catapult Damage +40%',names,canon,1).rows[0].value,40);
assert.equal(parse("Invading Generals' Damage -40%",names,canon,1).rows[0].value,-40);
let result=parse(text,names,canon,5);
assert.equal(result.valid,true);
assert.equal(result.rows.length,5);
assert.equal(result.rows[3].name,result.rows[4].name,'duplicates remain separate');
assert.equal(parse(text.replace('Air Defense','Enemy Air Defense'),names,canon,5).rows[0].name,'Enemy Air Defense Damage');
assert.equal(parse(text.replace('Air Defense','Alien Defense'),names,canon,5).valid,false);
assert.equal(parse(text.replace('+1%','1%'),names,canon,5).valid,false,'missing sign is uncertain');
assert.equal(parse(text.replace('+1%','+I%'),names,canon,5).valid,false,'ambiguous glyph is uncertain');
assert.equal(parse(text.replace('+1%',''),names,canon,5).valid,false,'missing percentage is uncertain');
assert.equal(parse(text.split('\n').slice(0,4).join('\n'),names,canon,5).valid,false,'partial panel');
assert.equal(parse('',names,canon,5).valid,false,'no artifact visible');
assert.equal(parse(text+'\nUnknown +4%',names,canon,5).valid,false,'extra rows are not silently dropped');
assert.equal(parse('Artifact Benefits\n'+text,names,canon,5).valid,true);
assert.equal(parse(text.replace('+1%','-1.5%'),names,canon,5).rows[0].value,-1.5);
assert.equal(parse(text.replace('+1%','+1,5%'),names,canon,5).rows[0].value,1.5);
const reconcile=context.window.DNScannerRecognition.reconcileReads;
const good=parse(text,names,canon,5);
assert.equal(reconcile(parse(text.replace('Catapult Hitpoints','Er tpoints'),names,canon,5),good).valid,true,'clearer exact reread may recover clipped text');
assert.equal(reconcile(parse(text.replace('Sniper Tower Hitpoints','Enemy Sniper Tower Hitpoints'),names,canon,5),good).valid,false,'never discard enemy qualifier');
assert.equal(reconcile(parse(text.replace('Catapult Hitpoints','Bomber Hitpoints'),names,canon,5),good).valid,false,'conflicting known labels need review');
assert.equal(reconcile(parse(text.replace('+1%','+2%'),names,canon,5),good).valid,false,'conflicting values need review');
assert.equal(reconcile(parse(text+'\nExtra label',names,canon,5),good).valid,true,'unrecognisable text without percent is discarded');
console.log('Scanner known-name, strict percentage, duplicate, and partial-input validation passed.');
assert.equal(reconcile(parse(text.split('\n').filter((_,index)=>index!==2).join('\n'),names,canon),good).valid,true,'consistent complete retry recovers missing faded row');
assert.equal(reconcile(parse(text.split('\n').slice(0,4).join('\n').replace('Catapult Hitpoints','Bomber Hitpoints'),names,canon),good).valid,false,'incomplete first pass cannot hide conflicting name');
const contrast=context.window.DNScannerRecognition.textContrast;
assert.equal(contrast(15,95,15),contrast(15,15,95),'green and blue text retain equal contrast');
assert.ok(contrast(15,95,15)<contrast(95,95,95),'saturated text receives extra contrast');
assert.equal(reconcile({rows:good.rows.slice(0,4),valid:false,warnings:['partial']},{rows:[...good.rows.slice(0,4),{name:'New Unit Healing',value:1,raw:'New Unit Healing +1%',known:false}],valid:false,warnings:['Unknown or ambiguous perk: New Unit Healing']}).rows.length,5,'improved retry displays collected rows while keeping rating unconfirmed');

assert.equal(parse(text+'\nyou want to sell Caterina',names,canon).rows.length,5);
assert.equal(parse('Sniper Tower Hitpomts +1%',names,canon).rows[0].assumed,true);
assert.equal(parse('Sniper Tower Hitpomts +1%',names,canon).rows[0].name,'Sniper Tower Hitpoints');
assert.equal(parse('Sniper Tower Hitpomts +1%',names,canon).valid,false);
assert.equal(parse('Enemy Sniper Tower Hitpoints -1%',names.filter(name=>name!=='Enemy Sniper Tower Hitpoints'),canon).rows[0].known,false);
const brightness=context.window.DNScannerRecognition.classifyBrightness;
for(let count=1;count<=3;count++)assert.equal(brightness(Array.from({length:5},(_,i)=>i<count?180:95)).count,count);
assert.equal(brightness([180,180,180,180,95]).count,null);
assert.equal(brightness([100,100,100,100,100]).count,null);
assert.equal(brightness([180,95,180,95,95]).count,null);
assert.equal(parse("Generals’ Damage +1%",["Generals' Damage"],value=>value).rows[0].assumed,false,'harmless punctuation normalises');
assert.equal(parse('Long Unit Damag +1%',['Long Unit Damage','Long Unit Damages'],value=>value).rows[0].known,false,'close competing candidates require correction');
assert.equal(parse('Invading Raider Damag -6%', ['Raider Damage','Invading Raider Damage'],value=>value).rows[0].name,'Invading Raider Damage');
assert.equal(parse('Raider Damag +I%', ['Raider Damage'],value=>value).rows[0].value,null,'matching a name never repairs percentage glyphs');
for(const [raw,name] of [['Enemy Siper Tower Hitpomts -6%','Enemy Sniper Tower Hitpoints'],['Guernlla Damage +6%','Guerrilla Damage'],['Bazooka Hitpomts +6%','Bazooka Hitpoints'],['Invading Guernlla Hitpomnts -6%','Invading Guerrilla Hitpoints']]) {
  const row=parse(raw,[name],value=>value).rows[0];assert.equal(row.name,name);assert.equal(row.assumed,true);
}
const coverage=context.window.DNScannerRecognition.coverage;
assert.equal(coverage([]).light,'red');
for(let count=1;count<5;count++)assert.equal(coverage(good.rows.slice(0,count)).light,'orange');
assert.equal(coverage(good.rows).light,'green','duplicate perk rows count individually');
const mixed=[...good.rows.slice(0,3),{raw:'New Unit Healing +1%',name:'New Unit Healing',value:1,known:false},parse('Bazooka Hitpomts +6%',['Bazooka Hitpoints'],value=>value).rows[0]];
assert.equal(coverage(mixed).total,5);assert.equal(coverage(mixed).known,3);assert.equal(coverage(mixed).collected,1);assert.equal(coverage(mixed).assumed,1);assert.equal(coverage(mixed).light,'green');
assert.equal(coverage([{name:'Er tpoints',raw:'Er tpoints +1%',value:1,known:false}]).light,'red');
assert.equal(coverage(parse('for 307 and 18%? It will be',names,canon).rows).light,'red');
assert.equal(coverage([...good.rows,good.rows[0]]).light,'orange','extra rows cannot produce green');
assert.equal(coverage(parse(text.replace('+1%','+I%'),names,canon).rows).total,4,'unreadable percentage does not count');

// Fixed polarity constrains both exact names and close spelling suggestions.
const recognition=context.window.DNScannerRecognition;
for(const [raw,name] of [
  ['is sile Silo HApoines «6%','Missile Silo Hitpoints'],
  ['Irswadiimg MRL Htpowits 6%','Invading MRL Hitpoints'],
  ['Irwadimg Fighter Higpoiks 6%','Invading Fighter Hitpoints'],
  ['Irv ading Machine Gun infaiiry Hipoints 6% -','Invading Machine Gun Infantry Hitpoints'],
  ['Art Tank Gun Damage «6%','Anti-Tank Gun Damage'],
  ['Supply Venicle kealing = 6%','Supply Vehicle Healing'],
  ['Redout Hitpoints « &%','Redoubt Hitpoints'],
  ['Redoubt Hitpoints « §%','Redoubt Hitpoints']
]) {
  const row=parse(raw,names,canon).rows[0];assert.equal(row.name,name,raw);assert.equal(row.known,true);
  assert.equal(row.value,null,'a name suggestion must not repair the percentage');
}
assert.equal(parse('Invading Attack Helicopter Damage -1%',names,canon).rows[0].known,true,'user-approved Invading Attack Helicopter Damage is recognised');
assert.equal(parse('Invading Ranged Siege Damage -1%',names,canon,1).valid,true,'new Main stat is recognised with its fixed negative sign');
assert.equal(parse('Invading Ranged Siege Damage +1%',names,canon,1).valid,false,'new Invading stat rejects positive values');
for(const raw of ['Alien Tank Hitpoints +6%','Irwading Heavy Bomber Hitpoints -6%'])assert.equal(parse(raw,names,canon).rows[0].known,false,'missing catalogue entries and different units remain unknown: '+raw);
const emptyRow={raw:'',name:'',value:null,known:false,hasPercent:false};
const combinationA={valid:false,warnings:['Row unclear'],rows:[good.rows[0],emptyRow,...good.rows.slice(2)]};
const combinationB={valid:false,warnings:['Other row unclear'],rows:[emptyRow,...good.rows.slice(1)]};
const combination=recognition.combineReads(combinationA,combinationB);
assert.equal(coverage(combination.rows).total,5,'complementary reads combine per physical row');assert.equal(combination.valid,false,'combined evidence still needs review');
const nameConflict=recognition.combineReads(combinationA,{...combinationB,rows:[parse('Bomber Damage +1%',names,canon).rows[0],...good.rows.slice(1)]});
assert.equal(nameConflict.valid,false);assert.match(nameConflict.warnings.join(' '),/disagree/);assert.equal(nameConflict.rows[0].name,combinationA.rows[0].name,'do not overwrite a conflicting known name');
const oldNumber={valid:false,warnings:[],rows:good.rows.map(row=>({...row,value:5,raw:row.name+' +5%',colour:'green'}))};
const newNumber={valid:false,warnings:[],hall:'main',rows:good.rows.map(row=>({...row,value:6,raw:row.name+' +6%',colour:'green'}))};
const numericConflict=recognition.combineReads(oldNumber,newNumber);
assert.equal(numericConflict.rows[0].value,6,'a new signed OCR read supported by colour can improve the display');
assert.equal(numericConflict.rows[0].conflict,true);assert.equal(numericConflict.valid,false,'numeric disagreement remains unconfirmed');
const panel=raw=>[raw,...Array(4).fill('Catapult Damage +1%')].join('\n');
assert.equal(parse(panel('Invading Raider Damage -6%'),names,canon).valid,true);
for(const raw of ['Invading Raider Damage +6%','Invading Brand New Unit Hitpoints +1%','Catapult Damage -6%']) {
  const result=parse(panel(raw),names,canon);
  assert.equal(result.valid,false,raw);
  assert.match(result.warnings.join(' '),/Invalid sign/);
  assert.equal(coverage(result.rows).light,'orange','wrong-sign rows cannot produce a green completeness badge');
}
assert.equal(parse('Invading Raider Damag +6%',names,canon).rows[0].known,false,'wrong-sign fuzzy candidate is excluded');
assert.equal(parse('Invading Raider Damag -6%',names,canon).rows[0].assumed,true);
assert.equal(parse('Sniper Tower Hitpomts -6%',names,canon).rows[0].known,false,'positive stat cannot be suggested for a negative value');
assert.equal(parse(panel('Enemy Defender Spawn Time +6%'),names,canon).valid,true,'Enemy prefix alone does not determine polarity');
assert.equal(parse(panel('Defender Spawn Time -6%'),names,canon).valid,true,'own stat can legitimately be negative');
const missingSign=parse(panel('Invading Raider Damage 11%'),names,canon);
assert.equal(missingSign.rows[0].value,null,'negative expectation does not fabricate a missing sign');
assert.equal(missingSign.valid,false);
const mixedSigns=[{name:'New Unit Healing',value:1},{name:'New Unit Healing',value:-6}];
assert.match(recognition.signIssues(mixedSigns).join(' '),/Mixed signs/,'new unknown stats cannot have mixed signs within a panel');
assert.equal(reconcile(parse(panel('Invading Raider Damag +6%'),names,canon),parse(panel('Invading Raider Damage -6%'),names,canon)).valid,false,'retry cannot silently invert an unknown first-pass sign');
assert.equal(DN.expectedPerkSign('Invading Uncatalogued Unit Damage'),-1);
console.log('Fixed signs, fuzzy polarity filtering, mixed-sign checks, and missing-sign preservation passed.');
for(const raw of ['Food Looted «6%','Food Looted » 6%','Food Looted 6%']) {
  const row=parse(raw,['Food Looted'],value=>value).rows[0];assert.equal(row.name,'Food Looted');assert.equal(row.known,true);assert.equal(row.value,null);
}
assert.equal(parse('Enemy Anti-Tank Gun Damage -&%',['Enemy Anti-Tank Gun Damage'],value=>value).rows[0].name,'Enemy Anti-Tank Gun Damage');
for(const raw of ['Catapult Damage +1% oo','Catapult Damage +1% Co oo B']) {
  const row=parse(raw,names,canon).rows[0];
  assert.equal(row.value,1);assert.equal(row.raw,raw);assert.equal(row.trailingNoise,true);
  assert.equal(coverage([row]).total,1);assert.equal(parse(panel(raw),names,canon).valid,false,'noise removal stays reviewable');
}
for(const raw of ['Catapult Damage +1% extra damage','Catapult Damage +1% 6','New Unit Healing +1% oo'])assert.equal(parse(raw,names,canon).rows[0].value,null,'do not absorb extra values, words or unknown labels');
for(const [raw,name] of [['Figjhites Hitpoints «6%','Fighter Hitpoints'],['Invading Guernlla Bitpomis 6%','Invading Guerrilla Hitpoints'],['Enemy Air Defense Hithomits -6%','Enemy Air Defense Hitpoints']]) {
  const row=parse(raw,[name],value=>value).rows[0];assert.equal(row.name,name);assert.equal(row.assumed,true);
}
const missingFifth={valid:false,warnings:['Missing row'],rows:good.rows.slice(0,4)};
const sparse=parse('Catapult Damage +1%\nSniper Tower Hitpoints +1%',names,canon);
const positioned=recognition.positionRows(sparse,[{text:sparse.rows[0].raw,bbox:{y0:4,y1:12}},{text:sparse.rows[1].raw,bbox:{y0:84,y1:92}}],100);
assert.equal(positioned.rows[4].name,'Sniper Tower Hitpoints');assert.equal(positioned.rows[1].name,'','a dropped line must leave its physical slot empty');
assert.equal(positioned.valid,false);assert.equal(coverage(positioned.rows).total,2);
const physicalRows={valid:false,warnings:['Unreadable row'],rows:[good.rows[0],{name:'',raw:'',known:false,value:null},...good.rows.slice(1,4)]};
assert.equal(reconcile(missingFifth,physicalRows).rows.length,5,'keep physical row positions when equally complete retries recover row boundaries');
for(let count=1;count<=3;count++)assert.equal(recognition.classifyStars(Array.from({length:5},(_,i)=>i<count?.8:.01)).count,count);
for(const fills of [[0,0,0,0,0],[.8,.8,.8,.8,0],[.8,0,.8,0,0],[.2,0,0,0,0]])assert.equal(recognition.classifyStars(fills).count,null);
const inferredInput={valid:false,warnings:['Unreadable signed percentage'],rows:Array.from({length:5},()=>({name:'Invading APC Hitpoints',known:true,value:null,raw:'Invading APC Hitpoints «6%',hasPercent:true}))};
const colours=['neutral','green','blue','neutral','green'];
const mainInferred=recognition.inferColourValues(inferredInput,colours,'main');
assert.equal(JSON.stringify(mainInferred.rows.map(row=>row.value)),JSON.stringify([-1,-6,-11,-1,-6]));
assert.equal(JSON.stringify(recognition.inferColourValues(inferredInput,colours,'war').rows.map(row=>row.value)),JSON.stringify([-1,-3,-6,-1,-3]));
assert.equal(mainInferred.valid,false,'inferred percentages require user review');
assert.equal(mainInferred.rows[0].raw,inferredInput.rows[0].raw,'inference preserves original OCR');
assert.equal(recognition.coverage(mainInferred.rows).light,'green','inferred values can complete capture without confirming rating');
assert.equal(recognition.inferColourValues({...inferredInput,rows:inferredInput.rows.map(row=>({...row,name:'Unknown Unit Damage',known:false}))},colours).rows[0].value,null);
const conflict=recognition.inferColourValues({...inferredInput,rows:inferredInput.rows.map(row=>({...row,value:-69}))},colours);
assert.equal(conflict.rows[0].value,-69,'do not replace an OCR value silently');assert.match(conflict.warnings.join(' '),/Colour and OCR disagree/);
const colourPixels=new Uint8ClampedArray(100*100*4);
const palette=[[100,100,100],[15,75,15],[15,60,65],[100,100,100],[15,75,15]];
for(let row=0;row<5;row++)for(let y=row*20+4;y<row*20+13;y++)for(let x=10;x<60;x+=4){const p=(y*100+x)*4;colourPixels.set([...palette[row],255],p);}
assert.equal(JSON.stringify(recognition.rowColours(colourPixels,100,100)),JSON.stringify(colours));
for(const [raw,name] of [['Irwading Bomiber Dannage «6%','Invading Bomber Damage'],['Vauk Capacity +6%','Vault Capacity'],['Invading Fughier Dantage 6%','Invading Fighter Damage'],['Invading Ranged Siege Hipomnis 6%','Invading Ranged Siege Hitpoints'],['Farest Expan san Cost Refund +11%,','Forest Expansion Cost Refund']]) {
  const row=parse(raw,[name],value=>value).rows[0];assert.equal(row.name,name);assert.equal(row.assumed,true);
}

// Stored artifacts can have a sixth perk; callers select the required count.
const sixText=text+'\nCatapult Damage +13%';
const sixParsed=parse(sixText,names,canon,6);
assert.equal(sixParsed.valid,true);
assert.equal(sixParsed.rows.length,6);
assert.equal(sixParsed.rows[5].value,13);
assert.equal(parse(text,names,canon,6).valid,false,'a missing sixth row must not confirm');
assert.equal(parse(sixText,names,canon,5).valid,false,'a sixth row must not be dropped');
assert.equal(recognition.coverage(sixParsed.rows,6).light,'green');
assert.equal(recognition.coverage(sixParsed.rows).light,'orange');
assert.equal(parse('Catapult Damage +13%',names,canon,1).valid,true,'independent storage fields validate their own row count');
assert.equal(recognition.combineReads(sixParsed,{...sixParsed,valid:false,warnings:['weak']},6).rows.length,6);
vm.runInContext(read('ui/storage-recognition.js'),context);
const storageRecognition=context.window.DNStorageRecognition;
assert.equal(storageRecognition.levelOf('3/10'),3);
assert.equal(storageRecognition.levelOf('10/10'),10);
for(const raw of ['310','0/10','11/10','3/1','3/10 extra'])assert.equal(storageRecognition.levelOf(raw),null,'uncertain level text stays unknown');
console.log('Five/six-row storage validation, upgraded percentages and strict levels passed.');
