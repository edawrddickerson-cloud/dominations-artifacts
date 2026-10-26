/* Aggregate reporting only. Sharing and private account backup stay independent. */
(() => {
  'use strict';
  const anchor=document.getElementById('scanner-crafted-log');if(!anchor)return;
  if(!document.body.classList.contains('page-crafting-stats'))return;
  const root=document.createElement('section');root.className='crafted-log-stats';root.id='crafting-community';root.setAttribute('aria-label','Community crafting statistics');
  root.innerHTML='<div class="crafted-stats-controls">'+
    '<label>Category <select data-community="category"><option value="">All</option>'+['weapon','armor','jewelry','pottery','equipment','unknown'].map(v=>'<option value="'+v+'">'+v[0].toUpperCase()+v.slice(1)+'</option>').join('')+'</select></label>'+
    '<label>Event <select data-community="event"><option value="">All</option><option value="unknown">Unknown</option></select></label>'+
    '<button type="button" class="btn" data-community-refresh>Refresh</button></div><p data-community-opt-in><label><input type="checkbox" data-community-share> Share crafted stats</label> <a href="config.html#account-privacy" data-community-signin hidden>Sign in</a></p><p role="status" data-community-sharing hidden></p><p role="status" data-community-status hidden></p>'+
    '<div data-community-expanded hidden><div class="crafted-stats-scroll"><table><thead><tr><th>Perk</th><th>Rating</th><th>Items</th><th>Item frequency</th><th>Rows</th><th>1%</th><th>6%</th><th>11%</th><th>Copies per artifact · all positions</th></tr></thead><tbody data-community-frequency></tbody></table></div></div>';
  const log=anchor.querySelector('#crafting-log-details');if(log)log.before(root);else anchor.append(root);
  const controls=window.DNCraftingStatsTables.pageControls(root,'community');
  const frequency=window.DNCraftingStatsTables.frequency(root.querySelector('[data-community-frequency]'));
  window.DNCraftingStatsTables.dashboard(root,'Community · top-value rolls');
  const get=name=>root.querySelector('[data-community-'+name+']') || controls.querySelector('[data-community-'+name+']');let request=0,hasReport=false,reportSignature='';
  const status=text=>{get('status').textContent=text;get('status').hidden=!text;};
  const ready=()=>window.DNIntegrationCore.researchReady(window.DNServiceConfig);
  async function refresh() {
    const current=++request;
    if(!ready()){status('Unavailable');get('refresh').disabled=true;root.setAttribute('aria-busy','false');return;}
    get('refresh').disabled=true;root.setAttribute('aria-busy','true');
    if(!hasReport)status('Loading');
    try {
      const hall=window.DNCraftingStatsTables.hall(),args={p_hall:hall || null,...Object.fromEntries(['category','event'].map(key=>['p_'+key,controls.querySelector('[data-community="'+key+'"]').value || null]))};
      const data=await window.DNCloud.communityReport(args);
      if(current!==request)return;
      for(const key of ['event']) {
        const select=controls.querySelector('[data-community="'+key+'"]'),value=select.value;
        const registered=data.contexts?.[key] || [],signature=JSON.stringify(registered);
        if(select.dataset.contexts!==signature){for(const option of [...select.options].slice(2))option.remove();for(const id of registered){const option=document.createElement('option');option.value=id;option.textContent=id;select.append(option);}select.value=value;select.dataset.contexts=signature;}
      }
      const signature=JSON.stringify({...data,updatedAt:undefined,filters:args});
      if(signature===reportSignature){window.DNCraftingStatsTables.renderDistributions(root,data.distributions,hall);status(data.status==='ready'?'':'No crafts recorded');return;}
      if(data.status!=='ready'){
        get('expanded').hidden=true;
        window.DNCraftingStatsTables.renderDistributions(root,null,hall);
        status('No crafts recorded');hasReport=true;reportSignature=signature;return;
      }
      hasReport=true;reportSignature=signature;
      get('expanded').hidden=!data.distributions;
      if(data.distributions){frequency.update(data.frequencies || [],data.recorded-data.excluded,hall);window.DNCraftingStatsTables.renderDistributions(root,data.distributions,hall);}
      status('');
    }catch{if(current===request)status('Unavailable');}
    finally{if(current===request){get('refresh').disabled=!ready();root.setAttribute('aria-busy','false');}}
  }
  get('refresh').addEventListener('click',refresh);controls.addEventListener('change',event=>{if(event.target.matches('[data-community]'))refresh();});window.addEventListener('dn-stats-hall-changed',refresh);
  let timer,sharingBusy=false,sharingError='';
  function sharingStatus(){
    const signedIn=!!window.DNCloud?.user();
    const accepted=!!window.DNConsent?.get().research;
    get('opt-in').hidden=accepted;
    get('signin').hidden=accepted || signedIn || !ready();
    get('share').checked=accepted;
    get('share').disabled=sharingBusy || !ready() || !signedIn;
    get('sharing').textContent=sharingError;get('sharing').hidden=!sharingError;
  }
  get('share').addEventListener('change',async()=>{
    const enabled=get('share').checked;
    sharingBusy=true;sharingError='';
    try{
      window.DNConsent.set({...window.DNConsent.get(),research:enabled,researchPolicy:'2026-10-23'});
      sharingStatus();
      if(enabled)await window.DNResearch.setSharing(true);
    }catch{sharingError='Could not save sharing preference.';}
    finally{sharingBusy=false;sharingStatus();}
  });
  window.DNConsent?.subscribe(sharingStatus);
  window.DNCloud?.subscribe(sharingStatus);
  window.DNResearch?.subscribe(()=>{sharingStatus();clearTimeout(timer);timer=setTimeout(refresh,300);});
  sharingStatus();
  status(ready()?'':'Unavailable');get('refresh').disabled=!ready();
  refresh();
})();
