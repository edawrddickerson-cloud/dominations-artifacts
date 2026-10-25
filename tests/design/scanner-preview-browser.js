/* Synthetic OCR preview; no recognition, capture permission or external service. */
(async () => {
  const get = id => document.getElementById('scanner-' + id);
  const until = performance.now() + 10000;
  while (!get('names')?.children.length) {
    if (performance.now() > until) throw Error('Scanner preview timed out');
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  get('auto').checked = false;
  window.DNScannerCollection.isEnabled = () => false;
  document.getElementById('header-main').click();
  const names = ['Heavy Tank Damage','Heavy Tank Hitpoints','Ranged Infantry Damage','Barracks Troop Damage','All Resources Looted'];
  const result = {valid:true,hall:'main',hallSource:'hall-colour',artifact:{type:'Weapon',name:'Sample Weapon',nameEvidence:{text:'Sample Weapon',confidence:95,accepted:true}},unlocked:{count:2,states:[true,true,false,false,false]},warnings:[],rows:names.map((name,index)=>({name,value:index===4?6:11,known:true,hasPercent:true,unlocked:index<2,level:1,levelSource:'crafting',rerollEligible:false,rerollSource:'manual'}))};
  DNScannerRecognition.create = () => ({recognize:async()=>structuredClone(result),close:async()=>{}});
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 320;
  // A clearly synthetic sample panel, rather than a misleading photograph.
  const context = canvas.getContext('2d');context.fillStyle='#24282e';context.fillRect(0,0,640,320);context.fillStyle='#c4a35a';context.font='28px Segoe UI';context.fillText('Sample Weapon',36,60);
  context.font='18px Segoe UI';names.forEach((name,index)=>context.fillText(name,36,105+index*35));
  DNScannerReading.update(canvas,{session:1,current:true,itemPresent:true,categorySource:canvas,panelRegion:{x:0,y:0,width:1,height:1}});
  get('read').click();
  while (get('read').disabled) { if(performance.now()>until)throw Error('Scanner sample read timed out');await new Promise(resolve=>setTimeout(resolve,30)); }
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  get('result').scrollIntoView({block:'start'});
  return {rows:get('result').querySelectorAll('.scanner-perk').length};
})();
