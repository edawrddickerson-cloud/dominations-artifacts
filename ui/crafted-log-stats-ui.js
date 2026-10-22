/* An inline expansion of the existing Crafted item log. Its log controls,
 * persistence, best-read selection and Keep action remain authoritative. */
(() => {
  'use strict';
  if(!document.getElementById('scanner-crafted-log') || window.DNStorageRecognition)return;
  function mount() {
    const source=window.DNScannerCollection,core=window.DNCraftedLogStats;
    const anchor=document.getElementById('scanner-crafted-log');
    if(!source || !core || !anchor || document.getElementById('crafted-log-stats'))return;
    const root=document.createElement('details');root.id='crafted-log-stats';root.className='crafted-log-stats';
    root.innerHTML=`<summary>Observed stats</summary><p data-stats-count></p>
      <div class="crafted-stats-controls">
        <label>Hall <select data-stat-filter="hall"><option value="">All halls</option><option value="main">Main</option><option value="war">War</option></select></label>
        <label>Category <select data-stat-filter="category"><option value="">All categories</option></select></label>
        <label>Source <select data-stat-filter="source"><option value="">All log records</option><option value="live-capture">Live capture</option><option value="local-image">Images</option><option value="unknown">Unknown</option></select></label>
        <label>Evidence <select data-stat-filter="evidence"><option value="">Best available</option><option value="direct">Direct or corrected</option></select></label>
        <label>Perk position <select data-stat-filter="position"><option value="">All positions</option>${[1,2,3,4,5,6].map(n=>'<option value="'+n+'">'+n+'</option>').join('')}</select></label>
      </div>
      <div class="crafted-stats-scroll"><table><thead><tr><th>Perk</th><th>Items</th><th>Item frequency</th><th>Rows</th><th>Values</th></tr></thead><tbody data-stat-frequency></tbody></table></div>
      <div class="crafted-stats-controls"><label>Perk <select data-stat-filter="perk"><option value="">Choose perk</option></select></label><label>Value ≥ <input data-stat-filter="minimum" type="number" step="any"></label><label>Future crafts <input data-stat-filter="attempts" type="number" min="1" max="100000" step="1" value="100"></label></div>
      <dl data-stat-estimates></dl><p data-stat-note></p>
      <div class="crafted-stats-scroll"><table><thead><tr><th>Perk value</th><th>Rows</th><th>Row frequency</th></tr></thead><tbody data-stat-values></tbody></table></div>`;
    const log=anchor.querySelector('#scanner-item-log')?.closest('details');
    if(log)log.after(root);else anchor.append(root);
    const get=name=>root.querySelector('[data-'+name+']'),filter={attempts:100};let dirty=true;
    const percent=value=>value===null?'—':(value*100).toFixed(1)+'%';
    function cell(tr,value){const td=document.createElement('td');td.textContent=String(value);tr.append(td);return td;}
    function line(list,label,value){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;list.append(dt,dd);}
    function options(select,entries) {
      const signature=JSON.stringify(entries);if(select.dataset.options===signature)return;
      const previous=select.value,first=select.options[0].cloneNode(true);select.replaceChildren(first);
      for(const [value,label] of entries){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
      select.value=entries.some(([value])=>value===previous)?previous:'';filter[select.dataset.statFilter]=select.value;select.dataset.options=signature;
    }
    function refresh() {
      if(!root.open){dirty=true;return;}
      dirty=false;const items=source.historyItems();
      options(root.querySelector('[data-stat-filter="category"]'),[...new Set(items.map(i=>i.type).filter(Boolean))].sort().map(v=>[v,v]));
      let data=core.analyze(items,filter);
      options(root.querySelector('[data-stat-filter="perk"]'),data.frequencies.map(f=>[f.name,f.name]));data=core.analyze(items,filter);
      get('stats-count').textContent=data.history.length+' logged · '+data.kept+' collected · '+data.total+' eligible · '+data.excluded+' excluded · '+data.inferred+' inferred';
      const rows=get('stat-frequency');rows.replaceChildren();
      for(const f of data.frequencies){const tr=document.createElement('tr');for(const v of [f.name,f.items,percent(f.items/data.total),f.rows,f.min===f.max?f.min+'%':f.min+'% to '+f.max+'%'])cell(tr,v);rows.append(tr);}
      if(!data.total){const tr=document.createElement('tr');cell(tr,'No eligible items').colSpan=5;rows.append(tr);}
      const estimates=get('stat-estimates');estimates.replaceChildren();
      if(filter.perk && data.total){
        line(estimates,'Matching items',data.hits+' / '+data.total);line(estimates,'Observed match rate',percent(data.rate));line(estimates,'95% Wilson interval',data.bounds.map(percent).join(' to '));
        if(data.projected){line(estimates,'At least one in '+data.projected.attempts+' crafts',percent(data.projected.rate));line(estimates,'Estimate range',data.projected.bounds.map(percent).join(' to '));}
      }
      get('stat-note').textContent=!filter.perk || !data.total?'':!data.liveOnly?'Select Live capture for projections.':!data.homogeneous?'Select one hall and category for projections.':'OCR estimate; assumes independent crafts under the same conditions.';
      const values=get('stat-values');values.replaceChildren();for(const [value,count] of data.values){const tr=document.createElement('tr');cell(tr,value+'%');cell(tr,count);cell(tr,percent(count/data.selectedRows));values.append(tr);}
    }
    root.querySelectorAll('[data-stat-filter]').forEach(input=>input.addEventListener('change',()=>{
      if(input.type==='number' && !input.checkValidity()){input.reportValidity();return;}
      filter[input.dataset.statFilter]=input.type==='number'?(input.value===''?null:Number(input.value)):input.value;refresh();
    }));
    root.addEventListener('toggle',()=>{if(root.open && dirty)refresh();});
    source.subscribe(refresh);window.addEventListener('focus',refresh);refresh();
  }
  window.addEventListener('dn-crafted-log-ready',mount,{once:true});mount();
})();
