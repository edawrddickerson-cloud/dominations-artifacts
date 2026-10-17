/* Production scanner totals and row gains for every ordinary hall/category. */
(async()=>{
  const checks={},get=id=>document.getElementById('scanner-'+id);
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name+' / total '+get('item-total').textContent+' / '+get('warnings').textContent);};
  async function wait(test){const end=performance.now()+15000;while(!test()){if(performance.now()>end)throw Error('Timed out');await new Promise(resolve=>setTimeout(resolve,20));}}
  await wait(()=>get('names').children.length);
  get('auto').checked=false;get('collect').checked=false;
  let response,pixel=0;
  window.DNScannerRecognition.create=()=>({recognize:async()=>structuredClone(response),close:async()=>{}});
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  const cases=[['main','Weapon','Heavy Tank Damage',1,100,140],['main','Armor','Invading Heavy Tank Damage',-1,60,100],['main','Jewelry','Oil Looted',1,40,40],['main','Pottery','Vault Interest',1,40,40],['war','Weapon','Heavy Tank Damage',1,30,70],['war','Armor','Heavy Tank Hitpoints',1,15,55],['war','Equipment',"Invading Generals' Hitpoints",-1,75,75],['main','Weapon',"Generals' Damage",1,100,220]];
  for(const [hall,type,name,value,ceiling,total] of cases){
    if(name==="Generals' Damage" && document.getElementById('header-def').getAttribute('aria-pressed')!=='true')document.getElementById('header-def').click();
    response={valid:true,warnings:[],hall,hallSource:'hall-colour',artifact:{type},unlocked:{count:2,states:[true,true,false,false,false]},
      rows:Array.from({length:5},(_,i)=>({name,value,known:true,hasPercent:true,unlocked:i<2,level:1,levelSource:'crafting',rerollEligible:true,rerollSource:'fresh-craft'}))};
    pixel=(pixel+60)%240;canvas.getContext('2d').fillStyle='rgb('+pixel+','+pixel+','+pixel+')';canvas.getContext('2d').fillRect(0,0,640,360);
    window.DNScannerReading.update(canvas,{session:1,current:true});get('read').click();await wait(()=>!get('read').disabled);
    const scores=[...get('result').querySelectorAll('.scanner-stat-score')].map(node=>Number(node.textContent));
    const gains=[...get('result').querySelectorAll('.scanner-reroll-gain')].map(node=>Number(node.textContent));
    check(hall+' '+type+' uses its legal ceiling',get('item-total').textContent===String(total));
    check(hall+' '+type+' row gains agree with the total',scores.reduce((a,b)=>a+b,0)+gains.reduce((a,b)=>a+b,0)===total && gains.filter(value=>value>0).length===1);
    const best=get('result').querySelector('.is-best-reroll');
    check(hall+' '+type+' explains its replacement score',best?.title.includes(ceiling+' points'));
  }
  return {passed:true,ui:checks};
})()
