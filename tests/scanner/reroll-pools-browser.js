/* Production scanner totals and row gains for every ordinary hall/category. */
(async()=>{
  const checks={},get=id=>document.getElementById('scanner-'+id);
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name+' / total '+get('item-total').textContent+' / category '+get('compare-type').value+' / '+get('result').textContent+' / '+get('warnings').textContent);};
  async function wait(test){const end=performance.now()+15000;while(!test()){if(performance.now()>end)throw Error('Timed out');await new Promise(resolve=>setTimeout(resolve,20));}}
  await wait(()=>window.DNScannerCollection&&window.DNScannerReading&&window.DNCraftingPurposes&&get('names').children.length);
  get('auto').checked=false;window.DNScannerCollection.isEnabled=()=>false;
  for(const family of ['attacking','defensive','economy'])DNCraftingPurposes.disableRareFamily(family);
  const ratings=Object.fromEntries(Object.keys(window.DN_ARTIFACT_STAT_CONTEXT.stats).map(name=>[name,{offensive:0,defensive:0}]));
  for(const [name,offensive,defensive] of [["Generals' Damage",5,5],['Defender Damage',0,3],['Enemy Tower Damage',2,0],['Tower Damage',0,2],['Heavy Tank Damage',2,0],['Heavy Tank Hitpoints',1,0],['All Enemy Defensive Towers Hitpoints',0,5]])ratings[name]={offensive,defensive};
  DN.saveGlobalPerkRatings(ratings);
  let response,pixel=0,session=0;
  window.DNScannerRecognition.create=()=>({recognize:async()=>structuredClone(response),close:async()=>{}});
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  const cases=[['main','Weapon','Heavy Tank Damage',1,100,180],['main','Armor','Invading Heavy Tank Damage',-1,60,60],['main','Jewelry','Oil Looted',1,40,40],['main','Pottery','Vault Interest',1,40,40],['war','Weapon','Heavy Tank Damage',1,30,110],['war','Armor','Heavy Tank Hitpoints',1,15,55],['war','Equipment',"Invading Generals' Hitpoints",-1,75,75],['main','Weapon',"Generals' Damage",1,100,300]];
  for(const [hall,type,name,value,ceiling,total] of cases){
    if(name==="Generals' Damage" && document.getElementById('header-def').getAttribute('aria-pressed')!=='true')document.getElementById('header-def').click();
    response={valid:true,warnings:[],hall,hallSource:'hall-colour',artifact:{type},unlocked:{count:2,states:[true,true,false,false,false]},
      rows:Array.from({length:5},(_,i)=>({name,value,known:true,hasPercent:true,unlocked:i<2,level:1,levelSource:'crafting',rerollEligible:true,rerollSource:'fresh-craft'}))};
    pixel=(pixel+60)%240;canvas.getContext('2d').fillStyle='rgb('+pixel+','+pixel+','+pixel+')';canvas.getContext('2d').fillRect(0,0,640,360);
    window.DNScannerReading.update(canvas,{session:++session,current:true});get('read').click();await wait(()=>!get('read').disabled);
    const scores=[...get('result').querySelectorAll('.scanner-stat-base-score')].map(node=>Number(node.textContent));
    const gains=[...get('result').querySelectorAll('.scanner-reroll-gain')].map(node=>Number(node.textContent.replace(/\s/g,'')));
    check(hall+' '+type+' uses its legal ceiling',get('item-total').textContent===String(total));
    check(hall+' '+type+' row gains agree with the total',scores.reduce((a,b)=>a+b,0)+gains.reduce((a,b)=>a+b,0)===total && gains.filter(value=>value>0).length===1);
    const best=get('result').querySelector('.is-best-reroll');
    check(hall+' '+type+' explains its replacement score',best?.querySelector('.scanner-reroll-gain')?.title.includes(ceiling+' points'));
  }
  let captured;const update=DNScannerComparison.update;
  DNScannerComparison.update=function(...args){captured=args[3]?.captureResult;return update.apply(this,args);};
  try{for(const [name,value] of [['Heavy Tank Hitpoints',6],['Invading Heavy Tank Damage',-6]]){
    response={valid:false,warnings:['Zero OCR percentage'],hall:'war',hallSource:'hall-colour',artifact:{type:'Armor'},colours:Array(5).fill('blue'),unlocked:{count:1,states:[true,false,false,false,false]},
      rows:Array.from({length:5},(_,i)=>({name,value:0,rawPercentage:'+0%',known:true,hasPercent:true,unlocked:i===0,level:1,levelSource:'crafting',rerollEligible:false}))};
    DNScannerReading.update(canvas,{session:++session,current:true});get('read').click();await wait(()=>!get('read').disabled);
    check(name+' zero OCR displays signed blue War inference',Array.from(get('result').querySelectorAll('.scanner-stat-value')).every(node=>node.textContent===(value>0?'+':'')+value+'%'));
    check(name+' zero recovery stays inferred with raw OCR preserved',captured?.rows.every(row=>row.value===value && row.inferred && row.rawPercentage==='+0%') && captured.valid===false);
  }}finally{DNScannerComparison.update=update;}
  return {passed:true,ui:checks};
})()
