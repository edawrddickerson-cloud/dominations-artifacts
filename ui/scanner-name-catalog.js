/* Reviewed OCR spellings, separate from canonical stat identities and ratings.
 * Edit these groups to teach the scanner recurring word/phrase misreads.
 * Sources describe spelling evidence, not proof of a new stat or mode pool.
 * Unknown candidates mined from exports never become active rules automatically. */
((root,factory)=>{
  const catalog=factory();
  if(typeof module==='object' && module.exports)module.exports=catalog;
  else root.DNScannerNameCatalog=catalog;
})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const groups=[
    {to:'hitpoints',from:['bitpomis','hitporis','hithomits','htpoiris','hitpoinis','hitpomts','hitpomnts','hitpainis','hipomnis','hitpoimis','hitpairits'],source:'Earlier reviewed scanner word confusions in scanner-recognition.js',confidence:.98},
    {to:'fighter',from:['figjhites'],source:'Earlier reviewed scanner word confusions in scanner-recognition.js',confidence:.98},
    {to:'guerrilla',from:['guernlla','guernla'],source:'docs/scanner-observations-2026-10-11-batch3.md',confidence:.98},
    {to:'tactical',from:['tactucal'],source:'docs/scanner-observations-2026-10-11-batch2.md',confidence:.98},
    {to:'sniper',from:['siper','sripes','sriped'],source:'Earlier reviewed scanner word confusions in scanner-recognition.js',confidence:.98},
    {to:'oil',from:['oll','qil'],source:'docs/scanner-observations-2026-10-11-batch2.md',confidence:.98},
    {to:'damage',from:['dannage','danmage','dantage'],source:'Earlier reviewed scanner word confusions in scanner-recognition.js',confidence:.98},
    {to:'bomber',from:['bomiber'],source:'Earlier reviewed scanner word confusions in scanner-recognition.js',confidence:.98},
    {to:'vault',from:['vauk'],source:'Earlier reviewed scanner word confusions in scanner-recognition.js',confidence:.98},
    {to:'heavy',from:['heawy'],source:'Earlier reviewed scanner word confusions in scanner-recognition.js',confidence:.98},
    {to:'assault',from:['assauli'],source:'Earlier reviewed scanner word confusions in scanner-recognition.js',confidence:.98},
    {to:'forest',from:['farest'],source:'Earlier reviewed scanner word confusions in scanner-recognition.js',confidence:.98},
    {to:'expansion',from:['expan san'],source:'Earlier reviewed scanner phrase confusion in scanner-recognition.js',confidence:.98},
    {to:'helicopter',from:['hehcopter'],source:'docs/scanner-observations-2026-10-11-batch3.md',confidence:.98},
    {to:'machine',from:['mache'],source:'docs/scanner-observations-2026-10-11-batch2.md',confidence:.98},
    {to:'anti tank',from:['ant tank','art tank'],source:'docs/scanner-observations-2026-10-11-batch2.md; docs/scanner-review-2026-10-11-batch6.md',confidence:.97},
    {to:'missile',from:['is sile'],source:'docs/scanner-review-2026-10-11-batch6.md',confidence:.97},
    {to:'hitpoints',from:['hapoines','htpowits','hipoints'],source:'docs/scanner-review-2026-10-11-batch6.md',confidence:.97},
    {to:'invading',from:['irswadiimg','irwadimg','irv ading'],source:'docs/scanner-review-2026-10-11-batch6.md',confidence:.97},
    {to:'infantry',from:['infaiiry'],source:'docs/scanner-review-2026-10-11-batch6.md',confidence:.97},
    {to:'vehicle',from:['venicle'],source:'scripts/test_scanner_recognition.js (prior difficult-read regression)',confidence:.97},
    {to:'healing',from:['kealing'],source:'scripts/test_scanner_recognition.js (prior difficult-read regression)',confidence:.97},
  ];
  // Reviewed in full-name context from the saved 2026-10-11..14 exports.
  // Ordinary English words with competing meanings (e.g. "leading", "wines",
  // "rational") and clipped qualifiers remain proposals, not active rules.
  const exportReview={
    air:['arr','aur'],armored:['admored','armaied','armared','armoied','arthored','aviored'],
    assault:['assauk'],attack:['aftack','allack','altack'],catapult:['catanult','catapuit','catapuli'],cavalry:['cavaky'],
    cost:['casi','cosi'],damage:['camage','damages','damags','dapnage','darfage','darmage','darnage','darrage','diarmage'],
    defense:['cetense','detense'],enemy:['enedy','eneify','eneriy','enermry','enermy','enerry','enery','eremy','erermy'],
    expansion:['expansian','fxpanswon'],food:['faod'],forest:['faresi','foresi'],from:['fom','fram','fromm','trom'],
    generals:['geneials'],gold:['gola'],guerrilla:['guerrila'],healing:['healng'],
    helicopter:['hebcopter','helcapter','helcopted','helcopter','helhcopter','helicopte','helicopters','helicoptes','mebcopter','melicopter'],
    hitpoints:['fipomnts','hapoints','hepoints','hibpoints','hiepoiaes','hiepoints','hifpomits','hifpomnis','hifpomnts','higgomnts','higomnts','higpomnts','higpomrts','higpomts','hiipomts','hilponts','hipoimis','hipoines','hipomnts','hipomts','hiponts','hipowts','hirdoints','hirpoinis','hirpomts','hirpowts','hitdoims','hitdoints','hitgomts','hithoints','hithomnts','hitpaimes','hitpaimts','hitpainks','hitpaints','hitpairts','hitpants','hitpoant','hitpoiits','hitpoines','hitpoirits','hitpoirns','hitpoirts','hitpomes','hitpomis','hitpomnes','hitpomnis','hitpomte','hitponits','hitponnis','hitponts','hitporits','hitports','hitposnts','hitpowits','hitpowts','hrpoints','htpoings','ktpoints','mifpomnts'],
    hunting:['huibing','huihing','huithng','hunbing'],infantry:['ifantry','infaniry','intaniry','intantry','intany','irtaniry'],
    invading:['ifvading','iivvading','iiwading','imeading','imvading','invaching','inveading','inwading','ireading','irivadimg','irsvading','irvadimg','irvading','irveading','irvvading','irwading','ivadimg','ivading','limeading','livading','rivading'],
    library:['libiary'],looted:['loated'],machine:['machime','machume','rachime'],missile:['kissile','yissile'],mortar:['monar'],
    national:['matonal'],redoubt:['redoulit','redoutt'],resources:['resaurces','resournes','resourngs','resourpes'],
    silo:['siig','sila','sio','slo'],sniper:['snipe'],tactical:['tacbcal','tachcal','tacucal'],tank:['tark'],tower:['toner'],
    vault:['vauli'],vehicle:['veliclke','veyicle','wehicle'],
  };
  for(const [to,from] of Object.entries(exportReview))groups.push({to,from,source:'Saved scanner exports 2026-10-11 through 2026-10-14; word/context review 2026-10-15',confidence:.96});
  // Narrow spelling review of complete stat labels in the October 29 export.
  // Keep the badly degraded effect token scoped to its intact unit: it is not
  // a general hitpoints rule, and does not supply an Enemy/Invading qualifier.
  const octoberReview={
    redoubt:['redaunt'],fighter:['fightet'],hitpoints:['htpaints'],
    library:['libary'],vehicle:['vehicie','vetucle'],
    'supply vehicle hitpoints':['supply vehicle hapcines'],
  };
  for(const [to,from] of Object.entries(octoberReview))groups.push({to,from,source:'Saved artifact-perk-observations-2026-10-29 export; complete stat spelling/context review 2026-10-29',confidence:.96});
  const rules=groups.flatMap(group=>group.from.map(from=>({from,to:group.to,confidence:group.confidence,source:group.source})))
    .sort((a,b)=>b.from.split(' ').length-a.from.split(' ').length || a.from.localeCompare(b.from));
  function correct(text,{protectedWords=new Set()}={}) {
    // One left-to-right pass over whole tokens. Replacements never cascade.
    const words=text.split(' '),output=[],corrections=[];
    for(let index=0;index<words.length;) {
      const rule=rules.find(rule=>{
        const parts=rule.from.split(' ');
        return !(parts.length===1 && protectedWords.has(parts[0])) && parts.every((word,offset)=>word===words[index+offset]);
      });
      if(rule){output.push(rule.to);corrections.push({...rule});index+=rule.from.split(' ').length;}
      else output.push(words[index++]);
    }
    return {text:output.join(' '),corrections,confidence:corrections.length?Math.min(...corrections.map(rule=>rule.confidence)):1};
  }
  return {version:1,groups,rules,correct};
});
