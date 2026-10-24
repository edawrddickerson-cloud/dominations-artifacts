/* Shared table controls for personal and aggregate crafting observations. */
(() => {
  'use strict';
  const percent=value=>value==null?'—':(100*value).toFixed(1)+'%';
  function cell(row,value){const td=document.createElement('td');td.textContent=value;row.append(td);return td;}
  const dashboards=new WeakMap();
  let selectedHall='main';
  function pageControls(root,view){
    const controls=root.querySelector('.crafted-stats-controls'),target=document.querySelector('#crafting-stats-page-filters .filter-main');
    if(controls && target){controls.dataset.statsControls=view;controls.className='crafting-view-filters';target.insertBefore(controls,target.querySelector(':scope > a.btn'));}
    return controls;
  }
  function dashboard(root,label){
    const section=document.createElement('section');section.className='crafting-stats-dashboard';section.dataset.dashboard=root.id;
    section.dataset.label=label;
    section.innerHTML='<div class="crafting-dashboard-heading"><h3 data-dashboard-title></h3></div><div class="crafting-dashboard-cards">'+[0,1,2,3,4,5].map(count=>'<div class="crafting-dashboard-card" data-roll-count="'+count+'"><span data-roll-label></span><strong data-roll-rate>—</strong><span data-roll-sample>0 / 0</span></div>').join('')+'</div>';
    const target=document.getElementById('crafting-stats-dashboard');if(target)target.append(section);else root.prepend(section);
    dashboards.set(root,section);
    renderDistributions(root,null);
  }
  function renderDistributions(root,data,hall){
    const section=dashboards.get(root);if(!section)return;
    const war=(hall ?? selectedHall)==='war',bins=data?.[war?'six':'eleven'];
    const title=section.querySelector('[data-dashboard-title]'),label=section.dataset.label+' · '+(war?'War 6%':'Main 11%');if(title.textContent!==label)title.textContent=label;
    for(const card of section.querySelectorAll('[data-roll-count]')){
      const count=Number(card.dataset.rollCount),metric=bins?.find(bin=>bin.count===count)?.exact;
      const values={'label':'Exactly '+count+' × '+(war?'6%':'11%'),'rate':percent(metric?.rate),'sample':(metric?.hits || 0)+' / '+(metric?.total || 0)};
      for(const [key,value] of Object.entries(values)){const node=card.querySelector('[data-roll-'+key+']');if(node.textContent!==value)node.textContent=value;}
    }
  }
  function frequency(body){
    const table=body.closest('table'),wrapper=table.parentElement;
    const search=document.createElement('label');search.className='crafted-stats-search filter-control';search.textContent='Search perks';
    const input=document.createElement('input');input.type='search';input.autocomplete='off';search.append(input);
    const root=body.closest('#crafted-log-stats,#crafting-community'),controls=document.querySelector('[data-stats-controls="'+(root?.id==='crafting-community'?'community':'personal')+'"]');if(controls)controls.append(search);else wrapper.before(search);
    let entries=[],total=0,hall='main',sort='rating',direction=-1;
    const headers=[...table.querySelectorAll('th')],keys=['name','rating','items','frequency','rows','tier0','tier1','tier2','repeats'];
    headers.forEach((th,i)=>{if(!keys[i])return;const button=document.createElement('button');button.type='button';button.className='crafted-stats-sort';button.textContent=th.textContent;th.replaceChildren(button);button.addEventListener('click',()=>{direction=sort===keys[i]?-direction:keys[i]==='name'?1:-1;sort=keys[i];render();});});
    function render(){
      const query=input.value.trim().toLowerCase(),fragment=document.createDocumentFragment(),service=window.DNCraftingPurposes;
      const definitions=service?.definitions || [],targets=definitions.filter(entry=>selectedTargets.has(entry.id));
      const canonical=name=>{const stats=window.DN_ARTIFACT_STAT_CONTEXT?.stats || {};return Object.hasOwn(stats,name)?name:Object.keys(stats).find(key=>stats[key].aliases?.includes(name)) || name;};
      const rating=entry=>service && ratingsReady?service.ratingOf(canonical(entry.name)):null;
      const tierRate=(entry,index)=>entry.tiers?.[index] ?? (entry.rows>0 && (hall==='main' || hall==='war')?entry.values?.filter(bin=>Math.abs(bin.value)===(hall==='war'?[1,3,6]:[1,6,11])[index]).reduce((sum,bin)=>sum+bin.count,0)/entry.rows:null);
      const value=entry=>sort.startsWith('tier')?tierRate(entry,Number(sort.slice(-1)))??-1:sort==='rating'?rating(entry)??-1:sort==='frequency'?entry.items:sort==='repeats'?(entry.repeats || []).reduce((sum,bin)=>sum+bin.hits,0):entry[sort];
      const visible=entries.filter(entry=>entry.name.toLowerCase().includes(query) && (!targets.length || targets.some(target=>target.stats.has(canonical(entry.name))))).sort((a,b)=>direction*(sort==='name'?a.name.localeCompare(b.name):value(a)-value(b)) || a.name.localeCompare(b.name));
      headers.forEach((th,i)=>{if(keys[i])th.setAttribute('aria-sort',keys[i]===sort?(direction===1?'ascending':'descending'):'none');});
      const labels=hall==='war'?['1%','3%','6%']:hall==='main'?['1%','6%','11%']:['Low','Mid','High'];
      for(let i=0;i<3;i++){headers[i+5].querySelector('button').textContent=labels[i];headers[i+5].title=['Main 1% · War 1%','Main 6% · War 3%','Main 11% · War 6%'][i];}
      for(const entry of visible){
        const tr=document.createElement('tr');for(const v of [entry.name,rating(entry)??'—',entry.items,percent(total?entry.items/total:null),entry.rows])cell(tr,v);
        for(let i=0;i<3;i++){const value=cell(tr,percent(tierRate(entry,i)));value.className='crafting-stat-values';}
        const repeats=cell(tr,'');for(const bin of entry.repeats || []){const line=document.createElement('div');line.textContent=bin.count+'× · '+bin.hits+' / '+bin.total+' ('+percent(bin.rate)+')';repeats.append(line);}fragment.append(tr);
      }
      if(!visible.length){const tr=document.createElement('tr');cell(tr,entries.length?'No matching perks':'No eligible items').colSpan=9;fragment.append(tr);}
      body.replaceChildren(fragment);
    }
    input.addEventListener('input',render);
    window.addEventListener('dn-crafting-purposes-changed',render);
    window.addEventListener('storage',render);
    window.addEventListener('focus',render);
    window.addEventListener('dn-stats-target-changed',render);
    return {update(data,sample,selectedHall='main'){entries=data;total=sample;hall=selectedHall;render();}};
  }
  window.DNCraftingStatsTables={dashboard,renderDistributions,frequency,pageControls,hall:()=>selectedHall};
  let ratingsReady=false;
  const selectedTargets=new Set(),targetPicker=document.querySelector('[data-stats-target-picker]'),targetMenu=document.querySelector('[data-stats-target-options]');
  const targetSummary=()=>{if(targetPicker)targetPicker.querySelector('summary').textContent='Collection Targets ('+(selectedTargets.size || 'All')+')';};
  function targetOptions(){
    if(!targetMenu)return;
    const definitions=window.DNCraftingPurposes?.definitions || [],signature=JSON.stringify(definitions.map(entry=>[entry.id,entry.label]));
    if(targetMenu.dataset.options===signature)return;
    for(const id of selectedTargets)if(!definitions.some(entry=>entry.id===id))selectedTargets.delete(id);
    targetMenu.replaceChildren();
    for(const entry of definitions){const label=document.createElement('label'),input=document.createElement('input');label.className='perk-check';input.type='checkbox';input.dataset.statsTarget='';input.value=entry.id;input.checked=selectedTargets.has(entry.id);label.append(input,document.createTextNode(entry.label));targetMenu.append(label);}
    if(!definitions.length){const empty=document.createElement('span');empty.textContent='No collection targets';targetMenu.append(empty);}
    targetMenu.dataset.options=signature;targetSummary();
  }
  targetOptions();window.addEventListener('dn-crafting-purposes-changed',targetOptions);window.addEventListener('storage',targetOptions);window.addEventListener('focus',targetOptions);
  targetMenu?.addEventListener('change',event=>{if(!event.target.matches('[data-stats-target]'))return;if(event.target.checked)selectedTargets.add(event.target.value);else selectedTargets.delete(event.target.value);targetSummary();window.dispatchEvent(new Event('dn-stats-target-changed'));});
  if(window.DNCraftingPurposes)fetch('data/perk_rating_defaults.json').then(response=>{if(!response.ok)throw Error('Ratings unavailable');return response.json();}).then(defaults=>{ratingsReady=true;window.DNCraftingPurposes.setDefaults(defaults);}).catch(()=>{});
  const viewButtons=[...document.querySelectorAll('button[data-stats-view]')];
  const hallButtons=[...document.querySelectorAll('button[data-stats-hall]')];
  for(const button of hallButtons)button.addEventListener('click',()=>{selectedHall=button.dataset.statsHall;for(const option of hallButtons){const active=option===button;option.classList.toggle('is-active',active);option.setAttribute('aria-pressed',String(active));}window.dispatchEvent(new Event('dn-stats-hall-changed'));});
  if(viewButtons.length){
    document.body.dataset.statsView='personal';
    for(const button of viewButtons)button.addEventListener('click',()=>{
      document.body.dataset.statsView=button.dataset.statsView;
      for(const option of viewButtons){const active=option===button;option.classList.toggle('is-active',active);option.setAttribute('aria-pressed',String(active));}
    });
  }
})();
