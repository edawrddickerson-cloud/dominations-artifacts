/* Aggregate reporting only. Sharing and private account backup stay independent. */
(() => {
  'use strict';
  const anchor=document.getElementById('scanner-crafted-log');if(!anchor)return;
  if(!document.body.classList.contains('page-crafting-stats'))return;
  const root=document.createElement('details');root.className='crafted-log-stats';root.id='crafting-community';
  root.innerHTML='<summary>Community observed stats</summary><div class="crafted-stats-controls">'+
    '<label>Hall <select data-community="hall"><option value="">All</option><option value="main">Main</option><option value="war">War</option><option value="unknown">Unknown</option></select></label>'+
    '<label>Category <select data-community="category"><option value="">All</option>'+['weapon','armor','jewelry','pottery','equipment','unknown'].map(v=>'<option value="'+v+'">'+v[0].toUpperCase()+v.slice(1)+'</option>').join('')+'</select></label>'+
    '<label>Event <select data-community="event"><option value="">All</option><option value="unknown">Unknown</option></select></label>'+
    '<button type="button" class="btn" data-community-refresh>Refresh</button></div><p><label><input type="checkbox" data-community-share> Share my crafted stats to contribute to community stats.</label></p><p role="status" data-community-sharing></p><p role="status" data-community-status></p><p data-community-count></p><dl data-community-exclusions hidden></dl>'+
    '<div class="crafted-stats-scroll"><table><thead><tr><th>Observed sample</th><th>Count / sample</th><th>Frequency</th><th>95% CI</th></tr></thead><tbody data-community-results></tbody></table></div>'+
    '<div data-community-expanded hidden><h3>Perk frequencies</h3><div class="crafted-stats-scroll"><table><thead><tr><th>Perk</th><th>Items</th><th>Item frequency</th><th>Rows</th><th>Value · count · row frequency</th></tr></thead><tbody data-community-frequency></tbody></table></div>'+window.DNCraftingStatsTables.distributionsMarkup()+'</div>'+
    '<p><a href="crafting-statistics.html">Methods and sampling limits</a></p>';
  const log=anchor.querySelector('#crafting-log-details');if(log)log.before(root);else anchor.append(root);
  const frequency=window.DNCraftingStatsTables.frequency(root.querySelector('[data-community-frequency]'));
  const get=name=>root.querySelector('[data-community-'+name+']');let request=0,hasReport=false,reportSignature='';
  const ready=()=>window.DNIntegrationCore.researchReady(window.DNServiceConfig);
  const percent=value=>value==null?'—':(100*value).toFixed(1)+'%';
  async function refresh() {
    const current=++request;
    if(!ready()){get('status').textContent='Unavailable';get('refresh').disabled=true;root.setAttribute('aria-busy','false');return;}
    get('refresh').disabled=true;root.setAttribute('aria-busy','true');
    if(!hasReport)get('status').textContent='Loading';
    try {
      const args=Object.fromEntries(['hall','category','event'].map(key=>['p_'+key,root.querySelector('[data-community="'+key+'"]').value || null]));
      const data=await window.DNCloud.communityReport(args);
      if(current!==request)return;
      for(const key of ['event']) {
        const select=root.querySelector('[data-community="'+key+'"]'),value=select.value;
        const registered=data.contexts?.[key] || [],signature=JSON.stringify(registered);
        if(select.dataset.contexts!==signature){for(const option of [...select.options].slice(2))option.remove();for(const id of registered){const option=document.createElement('option');option.value=id;option.textContent=id;select.append(option);}select.value=value;select.dataset.contexts=signature;}
      }
      const signature=JSON.stringify({...data,updatedAt:undefined});
      if(signature===reportSignature){get('status').textContent=data.status==='ready'?'Updated '+new Date(data.updatedAt).toLocaleString():'No crafts recorded';return;}
      if(data.status!=='ready'){
        get('results').replaceChildren();get('count').textContent='';get('exclusions').replaceChildren();get('exclusions').hidden=true;
        get('expanded').hidden=true;
        get('status').textContent='No crafts recorded';hasReport=true;reportSignature=signature;return;
      }
      get('count').textContent=data.recorded.toLocaleString()+' Crafts recorded · '+data.excluded.toLocaleString()+' excluded';
      const reasons={'starting-unknown':'Starting rolls unverified',identity:'Craft encounter unverified',incomplete:'Incomplete stats',upgraded:'Upgraded stats',uncertain:'Uncertain stat readings',range:'Unsupported perk or starting value',conflict:'Conflicting records',archived:'Archived records'};
      const exclusions=document.createDocumentFragment(),results=document.createDocumentFragment();
      for(const [reason,count] of Object.entries(data.exclusions || {})){
        const label=document.createElement('dt'),value=document.createElement('dd');label.textContent=reasons[reason] || reason;value.textContent=count.toLocaleString();exclusions.append(label,value);
      }
      get('exclusions').replaceChildren(exclusions);get('exclusions').hidden=!get('exclusions').children.length;
      for(const [key,label] of [['rows11','Starting rows at 11%'],['any11','Artifacts with ≥1 starting 11%'],['two11','Artifacts with ≥2 starting 11%'],['duplicate','Repeated canonical perk']]) {
        const metric=data.metrics[key],tr=document.createElement('tr');
        for(const value of [label,metric.hits+' / '+metric.total,percent(metric.rate),metric.bounds?metric.bounds.map(percent).join(' – '):'—']){const cell=document.createElement('td');cell.textContent=value;tr.append(cell);}
        results.append(tr);
      }
      get('results').replaceChildren(results);hasReport=true;reportSignature=signature;
      get('expanded').hidden=!data.distributions;
      if(data.distributions){frequency.update(data.frequencies || [],data.recorded-data.excluded);window.DNCraftingStatsTables.renderDistributions(root,data.distributions);}
      get('status').textContent='Updated '+new Date(data.updatedAt).toLocaleString();
    }catch{if(current===request)get('status').textContent='Unavailable';}
    finally{if(current===request){get('refresh').disabled=!ready();root.setAttribute('aria-busy','false');}}
  }
  get('refresh').addEventListener('click',refresh);root.addEventListener('change',event=>{if(event.target.matches('[data-community]'))refresh();});root.addEventListener('toggle',()=>{if(root.open)refresh();});
  let timer,sharingBusy=false,sharingError='';
  function sharingStatus(){
    const state=window.DNResearch?.status(),signedIn=!!window.DNCloud?.user();
    get('share').checked=!!window.DNConsent?.get().research;
    get('share').disabled=sharingBusy || !ready() || !signedIn;
    get('sharing').textContent=sharingError || (!ready()?'Sharing unavailable':!signedIn?'Sign in through Profiles to share crafted stats.':state?.error || (state?.pending?'Contributions pending':state?.active?'Sharing on':''));
  }
  get('share').addEventListener('change',async()=>{
    const enabled=get('share').checked;
    sharingBusy=true;sharingError='';
    try{
      window.DNConsent.set({...window.DNConsent.get(),research:enabled,researchPolicy:'2026-10-23'});
      sharingStatus();
      if(enabled)await window.DNResearch.setSharing(true);
    }catch(error){sharingError=error.message || 'Could not save sharing preference.';}
    finally{sharingBusy=false;sharingStatus();}
  });
  window.DNConsent?.subscribe(sharingStatus);
  window.DNCloud?.subscribe(sharingStatus);
  window.DNResearch?.subscribe(()=>{sharingStatus();if(root.open){clearTimeout(timer);timer=setTimeout(refresh,300);}});
  sharingStatus();
  get('status').textContent=ready()?'Not loaded':'Unavailable';get('refresh').disabled=!ready();
  root.open=true;
})();
