/* Aggregate reporting only. Sharing and private account backup stay independent. */
(() => {
  'use strict';
  const anchor=document.getElementById('scanner-crafted-log');if(!anchor)return;
  if(!document.body.classList.contains('page-crafting-stats'))return;
  const root=document.createElement('details');root.className='crafted-log-stats';root.id='crafting-community';
  root.innerHTML='<summary>Community observed stats</summary><div class="crafted-stats-controls">'+
    '<label>Hall <select data-community="hall"><option value="">All</option><option value="main" selected>Main</option><option value="war">War</option><option value="unknown">Unknown</option></select></label>'+
    '<label>Category <select data-community="category"><option value="">All</option>'+['weapon','armor','jewelry','pottery','equipment','unknown'].map(v=>'<option value="'+v+'">'+v[0].toUpperCase()+v.slice(1)+'</option>').join('')+'</select></label>'+
    '<label>Event <select data-community="event"><option value="">All</option><option value="unknown">Unknown</option></select></label>'+
    '<button type="button" class="btn" data-community-refresh>Refresh</button></div><p data-community-opt-in><label><input type="checkbox" data-community-share> Share crafted stats</label> <a href="config.html#account-privacy" data-community-signin hidden>Sign in to share</a></p><p role="status" data-community-sharing></p><p role="status" data-community-status></p><p data-community-count></p><dl data-community-exclusions hidden></dl>'+
    '<div data-community-expanded hidden><h3>Perk frequencies</h3><div class="crafted-stats-scroll"><table><thead><tr><th>Perk</th><th>Rating</th><th>Items</th><th>Item frequency</th><th>Rows</th><th>1%</th><th>6%</th><th>11%</th><th>Copies per artifact · all positions</th></tr></thead><tbody data-community-frequency></tbody></table></div></div>'+
    '<p><a href="crafting-statistics.html">Methods and sampling limits</a></p>';
  const log=anchor.querySelector('#crafting-log-details');if(log)log.before(root);else anchor.append(root);
  const frequency=window.DNCraftingStatsTables.frequency(root.querySelector('[data-community-frequency]'));
  window.DNCraftingStatsTables.dashboard(root,'Community · top-value rolls');
  const get=name=>root.querySelector('[data-community-'+name+']');let request=0,hasReport=false,reportSignature='';
  const ready=()=>window.DNIntegrationCore.researchReady(window.DNServiceConfig);
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
      const signature=JSON.stringify({...data,updatedAt:undefined,filters:args});
      if(signature===reportSignature){window.DNCraftingStatsTables.renderDistributions(root,data.distributions,root.querySelector('[data-community="hall"]').value);get('status').textContent=data.status==='ready'?'Updated '+new Date(data.updatedAt).toLocaleString():'No crafts recorded';return;}
      if(data.status!=='ready'){
        get('count').textContent='';get('exclusions').replaceChildren();get('exclusions').hidden=true;
        get('expanded').hidden=true;
        window.DNCraftingStatsTables.renderDistributions(root,null,root.querySelector('[data-community="hall"]').value);
        get('status').textContent='No crafts recorded';hasReport=true;reportSignature=signature;return;
      }
      get('count').textContent=data.recorded.toLocaleString()+' Crafts recorded · '+data.excluded.toLocaleString()+' excluded';
      const reasons={manual:'Manually entered stats','starting-unknown':'Starting rolls unverified',identity:'Craft encounter unverified',incomplete:'Incomplete stats',upgraded:'Upgraded stats',uncertain:'Uncertain stat readings',range:'Unsupported perk or starting value',conflict:'Conflicting records',archived:'Archived records'};
      const exclusions=document.createDocumentFragment();
      for(const [reason,count] of Object.entries(data.exclusions || {})){
        const label=document.createElement('dt'),value=document.createElement('dd');label.textContent=reasons[reason] || reason;value.textContent=count.toLocaleString();exclusions.append(label,value);
      }
      get('exclusions').replaceChildren(exclusions);get('exclusions').hidden=!get('exclusions').children.length;
      hasReport=true;reportSignature=signature;
      get('expanded').hidden=!data.distributions;
      if(data.distributions){frequency.update(data.frequencies || [],data.recorded-data.excluded,root.querySelector('[data-community="hall"]').value);window.DNCraftingStatsTables.renderDistributions(root,data.distributions,root.querySelector('[data-community="hall"]').value);}
      get('status').textContent='Updated '+new Date(data.updatedAt).toLocaleString();
    }catch{if(current===request)get('status').textContent='Unavailable';}
    finally{if(current===request){get('refresh').disabled=!ready();root.setAttribute('aria-busy','false');}}
  }
  get('refresh').addEventListener('click',refresh);root.addEventListener('change',event=>{if(event.target.matches('[data-community]'))refresh();});root.addEventListener('toggle',()=>{if(root.open)refresh();});
  let timer,sharingBusy=false,sharingError='';
  function sharingStatus(){
    const state=window.DNResearch?.status(),signedIn=!!window.DNCloud?.user();
    const accepted=!!window.DNConsent?.get().research;
    get('opt-in').hidden=accepted;
    get('signin').hidden=accepted || signedIn || !ready();
    get('share').checked=accepted;
    get('share').disabled=sharingBusy || !ready() || !signedIn;
    get('sharing').textContent=sharingError || (!ready()?'Sharing unavailable':state?.error || (state?.pending?'Contributions pending':''));
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
