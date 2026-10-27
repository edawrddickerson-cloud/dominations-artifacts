/* Real top controls, target weights, owned cutoff and current-row renderer. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),checks={},api=DNCraftingPurposes,store=DNStoredArtifacts;
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name+' '+get('purpose-results').textContent);};
  const wait=async fn=>{const until=performance.now()+15000;while(!await fn()){if(performance.now()>until)throw Error('Axis test timeout: '+get('purpose-results').textContent);await new Promise(resolve=>setTimeout(resolve,20));}};
  await wait(()=>window.DNScannerComparison && get('names').children.length);
  DNConsent?.set({});get('auto').checked=false;DNScannerCollection.isEnabled=()=>false;
  for(const family of ['attacking','defensive','economy'])api.disableRareFamily(family);
  const names=['Heavy Tank Damage','Heavy Tank Hitpoints','Assault Vehicle Damage','Invading Heavy Tank Damage','Invading Heavy Tank Hitpoints'],weights=[10,9,4,6,1];
  const donor=api.saveCustom({label:'Axis defence donor',category:'defensive',perks:names.slice(3)});api.selectPurpose(donor,false);
  const target=api.saveCustom({label:'Axis mixed target',category:'attacking',perks:names.slice(0,3),addOns:{defensive:{source:'target',targetId:donor}}});
  api.configure(target,{weights:Object.fromEntries(names.map((name,i)=>[name,weights[i]]))});
  const rows=[6,3,1,-3,-1].map((value,i)=>({name:names[i],value,known:true,hasPercent:true,level:1,levelSource:'crafting',unlocked:i===0,rerollEligible:false,rerollSource:'manual'}));
  const owned=(id,name,stats)=>({id,name,hall:'war',type:'Weapon',rows:stats.map(row=>({...row,base:row.value,max:Math.sign(row.value)*(Math.abs(row.value)+9)}))});
  await store.write(store.collectionKey(),[owned('axis-best','Best crafted card',rows.map((row,i)=>i===1?{...row,value:6}:row)),owned('axis-second','Second crafted card',rows)]);
  window.dispatchEvent(new Event('focus'));
  let response,reads=0,session=0;DNScannerRecognition.create=()=>({warm:async()=>{},close:async()=>{},recognize:async()=>{reads++;return structuredClone(response);}});
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=320;
  const scan=async(hall,type,stats=rows)=>{
    document.getElementById('header-'+hall).click();DNScannerReading.reset();
    response={valid:true,warnings:[],hall,hallSource:'hall-colour',artifact:{name:'Axis fixture',type},unlocked:{count:1,states:[true,false,false,false,false]},rows:stats};
    DNScannerReading.update(canvas,{session:++session,current:true});get('read').click();await wait(()=>!get('read').disabled && get('progress').textContent.startsWith('Finished'));
  };
  const select=async(off,def)=>{
    for(const [id,wanted] of [['header-off',off],['header-def',def]])if(wanted && document.getElementById(id).getAttribute('aria-pressed')!=='true')document.getElementById(id).click();
    for(const [id,wanted] of [['header-off',off],['header-def',def]])if(!wanted && document.getElementById(id).getAttribute('aria-pressed')==='true')document.getElementById(id).click();
    await new Promise(resolve=>setTimeout(resolve,0));
  };
  const targetNode=id=>get('purpose-results').querySelector('[data-purpose-result="'+id+'"]');
  const score=id=>Number(targetNode(id)?.querySelector('.scanner-focus-score').textContent.replace('~',''));
  for(const type of ['Weapon','Armor','Equipment']) {
    await scan('war',type);await wait(()=>targetNode(target));
    for(const [mode,off,def,total,contributions] of [['Off',true,false,298,[150,108,40,0,0]],['Def',false,true,82,[0,0,0,72,10]],['Off+Def',true,true,380,[150,108,40,72,10]]]) {
      const before=reads;await select(off,def);await wait(()=>score(target)===total);
      check('War '+type+' '+mode+' current score',score(target)===total);
      check('War '+type+' '+mode+' row contributions',JSON.stringify([...get('result').querySelectorAll('.scanner-stat-base-score')].map(node=>Number(node.textContent)))===JSON.stringify(contributions));
      check('War '+type+' '+mode+' does not rerun OCR',reads===before);
      if(type==='Weapon') {
        check(mode+' second-owned cutoff matches selected weights',targetNode(target).querySelector('.scanner-focus-target').textContent==='> '+total);
        check(mode+' cutoff identifies its source card',targetNode(target).querySelector('.scanner-focus-target').title==='Second owned: Second crafted card · '+total);
      }
    }
  }
  names.forEach((name,i)=>check(name+' shared rating is unchanged',api.ratingOf(name)===weights[i]));
  await scan('main','Weapon',rows.map(row=>({...row,value:Math.sign(row.value)})));
  for(const [off,def,total] of [[true,false,230],[false,true,70],[true,true,300]]){await select(off,def);await wait(()=>score(target)===total);check('Mixed Main Weapon '+total,score(target)===total);}
  await scan('main','Armor',Array.from({length:5},(_,i)=>({...rows[3],value:-1,unlocked:i===0})));await select(true,false);await wait(()=>score(target)===300);
  check('Defensive-only Main Armor overrides Off selection',score(target)===300 && get('off').checked && !get('def').checked);
  const economy=api.saveCustom({label:'Axis economy target',category:'economy',perks:['All Resources Looted']});api.configure(economy,{weights:{'All Resources Looted':7}});
  await scan('main','Jewelry',Array.from({length:5},(_,i)=>({...rows[0],name:'All Resources Looted',value:1,unlocked:i===0})));await select(false,true);await wait(()=>score(economy)===350);
  check('Offensive-only Jewelry overrides Def selection',score(economy)===350 && !get('off').checked && get('def').checked);
  DNScannerReading.reset();return {passed:true,ui:checks};
})()
