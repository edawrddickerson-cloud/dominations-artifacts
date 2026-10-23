/* Aggregate reporting only. Sharing and private account backup stay independent. */
(() => {
  'use strict';
  const anchor=document.getElementById('scanner-crafted-log');if(!anchor)return;
  const root=document.createElement('details');root.className='crafted-log-stats';root.id='crafting-community';
  root.innerHTML='<summary>Community observed stats</summary><div class="crafted-stats-controls">'+
    '<label>Hall <select data-community="hall"><option value="">All</option><option value="main">Main</option><option value="war">War</option><option value="unknown">Unknown</option></select></label>'+
    '<label>Category <select data-community="category"><option value="">All</option>'+['weapon','armor','jewelry','pottery','equipment','unknown'].map(v=>'<option value="'+v+'">'+v[0].toUpperCase()+v.slice(1)+'</option>').join('')+'</select></label>'+
    '<label>Event <select data-community="event"><option value="">All</option><option value="unknown">Unknown</option></select></label>'+
    '<label>Game version <select data-community="version"><option value="">All</option><option value="unknown">Unknown</option></select></label>'+
    '<button type="button" class="btn" data-community-refresh>Refresh</button></div><p role="status" data-community-status></p><p data-community-count></p>'+
    '<div class="crafted-stats-scroll"><table><thead><tr><th>Observed sample</th><th>Count / sample</th><th>Frequency</th><th>95% CI</th></tr></thead><tbody data-community-results></tbody></table></div>'+
    '<p><a href="crafting-statistics.html">Methods and sampling limits</a></p>';
  anchor.append(root);
  const get=name=>root.querySelector('[data-community-'+name+']');let request=0;
  const ready=()=>window.DNIntegrationCore.researchReady(window.DNServiceConfig);
  const percent=value=>value==null?'—':(100*value).toFixed(1)+'%';
  async function refresh() {
    const current=++request;get('results').replaceChildren();get('count').textContent='';
    if(!ready()){get('status').textContent='Unavailable';get('refresh').disabled=true;return;}
    get('refresh').disabled=true;get('status').textContent='Loading';
    try {
      const args=Object.fromEntries(['hall','category','event','version'].map(key=>['p_'+key,root.querySelector('[data-community="'+key+'"]').value || null]));
      const data=await window.DNCloud.communityReport(args);
      if(current!==request)return;
      for(const key of ['event','version']) {
        const select=root.querySelector('[data-community="'+key+'"]'),value=select.value;
        const registered=data.contexts?.[key] || [],signature=JSON.stringify(registered);
        if(select.dataset.contexts!==signature){for(const option of [...select.options].slice(2))option.remove();for(const id of registered){const option=document.createElement('option');option.value=id;option.textContent=id;select.append(option);}select.value=value;select.dataset.contexts=signature;}
      }
      if(data.status!=='ready'){get('status').textContent='Insufficient sample';return;}
      get('count').textContent=data.recorded.toLocaleString()+' Crafts recorded · '+data.excluded.toLocaleString()+' excluded';
      for(const [key,label] of [['rows11','Starting rows at 11%'],['any11','Artifacts with ≥1 starting 11%'],['two11','Artifacts with ≥2 starting 11%'],['duplicate','Repeated canonical perk']]) {
        const metric=data.metrics[key],tr=document.createElement('tr');
        for(const value of [label,metric.hits+' / '+metric.total,percent(metric.rate),metric.bounds?metric.bounds.map(percent).join(' – '):'—']){const cell=document.createElement('td');cell.textContent=value;tr.append(cell);}
        get('results').append(tr);
      }
      get('status').textContent='Updated '+new Date(data.updatedAt).toLocaleString();
    }catch{if(current===request)get('status').textContent='Unavailable';}
    finally{if(current===request)get('refresh').disabled=!ready();}
  }
  get('refresh').addEventListener('click',refresh);root.addEventListener('change',refresh);root.addEventListener('toggle',()=>{if(root.open)refresh();});
  get('status').textContent=ready()?'Not loaded':'Unavailable';get('refresh').disabled=!ready();
})();
