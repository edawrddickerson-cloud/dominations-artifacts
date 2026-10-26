/* Calculator controls are local preferences; model inputs never alter history. */
(() => {
  'use strict';
  const root=document.getElementById('crafting-probability'),P=window.DNCraftingProbability;
  if(!root || !P)return;
  const key='dn-crafting-probability-v1',get=name=>root.querySelector('[data-probability-'+name+']');
  let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{}
  let hall=['main','war'].includes(saved?.hall)?saved.hall:'main',category=P.categories[hall].includes(saved?.category)?saved.category:'Weapon';
  let scenario=saved?.scenario==='event'?'event':'normal',requirements=[],data=null,generation=0,timer,subscribed=false,researchSubscribed=false;
  get('dataset').value=saved?.dataset==='personal'?'personal':'community';
  const source=()=>get('dataset').value;
  const status=text=>{get('status').textContent=text;get('status').hidden=!text;};
  function save(){try{localStorage.setItem(key,JSON.stringify({version:1,hall,category,scenario,dataset:source(),attempts:get('attempts').value,requirements:requirements.map(r=>r.value)}));}catch{}}
  function options(select,entries,value){select.replaceChildren(...entries.map(([value,label])=>new Option(label,value)));select.value=value;}
  options(get('hall'),[['main','Main'],['war','War']],hall);
  options(get('category'),P.categories[hall].map(v=>[v,v]),category);get('scenario').value=scenario;
  get('attempts').value=/^\d+$/.test(String(saved?.attempts))?saved.attempts:1;
  const formatPercent=p=>p===0?'0%':p===1?'100%':(p*100).toPrecision(3).replace(/\.0+(?=e|$)/,'')+'%';
  function render(){
    save();get('chance').textContent='—';get('odds').textContent='—';get('attempt-chance').textContent='—';get('sample').textContent='';
    for(const row of requirements){
      const magnitudes=hall==='war'?[1,3,6]:[1,6,11],pattern=P.maximum(row.value);
      row.pattern.textContent=row.value.tier==='max'&&row.value.perks.length&&Number.isInteger(row.value.count)&&row.value.count>=1&&row.value.count<=5?pattern.map((n,i)=>({n,value:magnitudes[i]})).reverse().filter(p=>p.n).map(p=>p.n+' × '+p.value+'%').join(' + '):'';
    }
    if(!data)return;
    if(!data.artifacts){status('Insufficient data');return;}
    try{
      const result=P.calculate(data,requirements.map(r=>r.value),scenario,Number(get('attempts').value));
      if(result.status!=='ready'){status(result.reason);return;}
      get('chance').textContent=formatPercent(result.probability);
      get('odds').textContent=result.oneIn?'≈ 1 in '+Number(result.oneIn.toPrecision(3)).toLocaleString():'No matching outcome';
      get('attempt-chance').textContent=formatPercent(result.attemptChance);
      get('sample').textContent=(source()==='personal'?'Personal':'Community')+' sample · '+result.artifacts.toLocaleString()+' artifacts';
      status(result.lowSample?'Low sample':'');
    }catch(error){status(error.message);}
  }
  function allNames(){
    const names=new Set(data?.perks.map(p=>p.name)||[]),pool=window.DN_CRAFTED_PERK_POOLS?.pools?.[hall]?.[category];
    for(const name of Object.keys(pool || {}))names.add(name);
    return [...names].sort((a,b)=>a.localeCompare(b));
  }
  function refreshPicker(row){
    const names=allNames(),signature=JSON.stringify(names);
    if(row.list.dataset.names!==signature){
      row.list.replaceChildren(...names.map(name=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=name;input.checked=row.value.perks.includes(name);label.append(input,document.createTextNode(name));return label;}));row.list.dataset.names=signature;
    }
    const observed=new Set(data?.perks.map(p=>p.name)||[]),search=row.search.value.toLowerCase().trim();
    for(const label of row.list.children){const input=label.querySelector('input');input.checked=row.value.perks.includes(input.value);input.disabled=false;label.title=data&&!observed.has(input.value)?'No sample':'';label.hidden=!label.textContent.toLowerCase().includes(search);}
    row.summary.textContent=row.value.perks.length===1?row.value.perks[0]:row.value.perks.length+' perks';
    row.mode.disabled=row.value.perks.length<2;
  }
  function addRequirement(initial={perks:['Heavy Infantry Damage'],count:3,match:'atLeast',mode:'combined',tier:null}){
    if(requirements.length>=5)return;
    const value={perks:Array.isArray(initial.perks)?initial.perks.filter(n=>typeof n==='string'):[],count:Number(initial.count)||1,match:initial.match==='exact'?'exact':'atLeast',mode:initial.mode==='same'?'same':'combined',tier:initial.tier==null?null:'max'};
    const element=document.createElement('div');element.className='probability-requirement';
    element.innerHTML='<details class="probability-perks"><summary></summary><div class="probability-perk-menu"><input type="search" aria-label="Search requirement perks" placeholder="Search perks"><div class="probability-perk-actions"><button class="btn" type="button" data-select-visible>Select visible</button><button class="btn" type="button" data-clear-perks>Clear</button></div><div class="probability-perk-list"></div></div></details><label>Count<input type="number" min="1" max="5" step="1" data-count></label><label>Match<select data-match><option value="atLeast">At least</option><option value="exact">Exactly</option></select></label><label>Group<select data-mode><option value="combined">Combined</option><option value="same">Same perk</option></select></label><label>Tier<select data-tier></select><small data-tier-pattern></small></label><button type="button" class="btn" data-remove>Remove</button>';
    const row={value,element,list:element.querySelector('.probability-perk-list'),search:element.querySelector('input[type="search"]'),summary:element.querySelector('summary'),mode:element.querySelector('[data-mode]'),tier:element.querySelector('[data-tier]'),pattern:element.querySelector('[data-tier-pattern]')};
    const count=element.querySelector('[data-count]'),match=element.querySelector('[data-match]');count.value=value.count;match.value=value.match;row.mode.value=value.mode;
    options(row.tier,[["",'Any'],['max','Max']],value.tier==null?'':'max');
    requirements.push(row);get('requirements').append(element);refreshPicker(row);
    row.search.addEventListener('input',()=>refreshPicker(row));
    row.list.addEventListener('change',()=>{value.perks=[...row.list.querySelectorAll('input:checked')].map(input=>input.value);refreshPicker(row);render();});
    element.querySelector('[data-select-visible]').addEventListener('click',()=>{for(const label of row.list.children)if(!label.hidden&&!label.querySelector('input').disabled)label.querySelector('input').checked=true;row.list.dispatchEvent(new Event('change'));});
    element.querySelector('[data-clear-perks]').addEventListener('click',()=>{for(const input of row.list.querySelectorAll('input'))input.checked=false;row.list.dispatchEvent(new Event('change'));});
    count.addEventListener('input',()=>{value.count=Number(count.value);render();});match.addEventListener('change',()=>{value.match=match.value;render();});row.mode.addEventListener('change',()=>{value.mode=row.mode.value;render();});row.tier.addEventListener('change',()=>{value.tier=row.tier.value===''?null:'max';render();});
    element.querySelector('[data-remove]').addEventListener('click',()=>{requirements=requirements.filter(r=>r!==row);element.remove();get('add').disabled=false;render();});
    get('add').disabled=requirements.length>=5;
  }
  const drafts=Array.isArray(saved?.requirements)&&saved.requirements.length?saved.requirements.slice(0,5):[undefined],legacy=new Map(),migrated=[];
  for(const draft of drafts){
    if(typeof draft?.tier!=='number'){migrated.push(draft);continue;}
    const id=JSON.stringify([...(draft.perks || [])].sort())+'|'+draft.mode+'|'+draft.match;
    if(legacy.has(id))legacy.get(id).count+=Number(draft.count)||0;
    else{const value={...draft,count:Number(draft.count)||1,tier:'max'};legacy.set(id,value);migrated.push(value);}
  }
  for(const initial of migrated)addRequirement(initial);
  async function refresh(){
    const request=++generation,view=source();data=null;render();status('Loading');get('source').textContent=view==='community'?'Community':'Personal';
    try{
      let next;
      if(view==='community'){
        await window.DNServicesReady;
        if(!window.DNCloud)throw Error('Community model unavailable');
        try{
          if(!window.DNCloud.communityProbabilityModel)throw Object.assign(Error('Model endpoint unavailable'),{code:'PGRST202'});
          next=await window.DNCloud.communityProbabilityModel({p_hall:hall,p_category:category.toLowerCase()});
        }catch(error){
          if(!['PGRST202','42883'].includes(error?.code))throw error;
          const summary=await window.DNCloud.communityReport({p_hall:hall,p_category:category.toLowerCase()});
          next={version:1,hall,category,artifacts:(summary.recorded || 0)-(summary.excluded || 0),rows:(summary.frequencies || []).reduce((sum,p)=>sum+p.rows,0),perks:(summary.frequencies || []).map(p=>({name:p.name,rows:p.rows})),profiles:{},calibration:P.calibration};
        }
      }else{
        if(!window.DNScannerCollection || !window.DNCraftingCommunity){if(request===generation)status('Loading');return;}
        next=P.model(window.DNScannerCollection.historyItems(),hall,category);
      }
      if(request!==generation)return;
      data=next;
      const allowed=new Set(allNames());for(const row of requirements){row.value.perks=row.value.perks.filter(name=>allowed.has(name));refreshPicker(row);}render();
    }catch{if(request===generation){data=null;render();status(view==='community'?'Community model unavailable':'Personal model unavailable');}}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(refresh,150);}
  get('hall').addEventListener('change',()=>{
    hall=get('hall').value;if(!P.categories[hall].includes(category))category=P.categories[hall][0];options(get('category'),P.categories[hall].map(v=>[v,v]),category);
    refresh();
  });
  get('category').addEventListener('change',()=>{category=get('category').value;refresh();});
  get('scenario').addEventListener('change',()=>{scenario=get('scenario').value;render();});get('attempts').addEventListener('input',render);
  get('add').addEventListener('click',()=>{addRequirement({perks:[],count:1});render();});get('refresh').addEventListener('click',refresh);
  // Calculator data source is independent of the statistics view tabs.
  get('dataset').addEventListener('change',refresh);
  window.addEventListener('dn-stats-hall-changed',()=>{const selected=window.DNCraftingStatsTables.hall();if(selected&&selected!==hall){get('hall').value=selected;get('hall').dispatchEvent(new Event('change'));}});
  function subscribe(){
    if(!subscribed&&window.DNScannerCollection){subscribed=true;window.DNScannerCollection.subscribe(()=>{if(source()==='personal')schedule();});}
    if(!researchSubscribed&&window.DNResearch){researchSubscribed=true;window.DNResearch.subscribe(()=>{if(source()==='community')schedule();});}
    schedule();
  }
  window.addEventListener('dn-crafted-log-ready',subscribe);window.addEventListener('focus',schedule);window.addEventListener('storage',schedule);
  Promise.resolve(window.DNServicesReady).then(subscribe);subscribe();
  window.DNCraftingProbabilityUI={refresh};
})();
