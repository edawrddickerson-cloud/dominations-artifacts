/* An inline expansion of the existing Crafted item log. Its log controls,
 * persistence, best-read selection and Keep action remain authoritative. */
(() => {
  'use strict';
  if(!document.body.classList.contains('page-crafting-stats'))return;
  function mount() {
    const source=window.DNScannerCollection,core=window.DNCraftedLogStats;
    const anchor=document.getElementById('scanner-crafted-log');
    if(!source || !core || !anchor || document.getElementById('crafted-log-stats'))return;
    const root=document.createElement('details');root.id='crafted-log-stats';root.className='crafted-log-stats';
    root.innerHTML=`<summary>Personal observed stats</summary><p data-stats-count></p>
      <div class="crafted-stats-controls">
        <label>Hall <select data-stat-filter="hall"><option value="">All halls</option><option value="main">Main</option><option value="war">War</option></select></label>
        <label>Category <select data-stat-filter="category"><option value="">All categories</option></select></label>
        <label>Perk position <select data-stat-filter="position"><option value="">All positions</option>${[1,2,3,4,5,6].map(n=>'<option value="'+n+'">'+n+'</option>').join('')}</select></label>
      </div>
      <div class="crafted-stats-scroll"><table><thead><tr><th>Perk</th><th>Rating</th><th>Items</th><th>Item frequency</th><th>Rows</th><th>Value</th><th>Count</th><th>Row frequency</th><th>Copies per artifact · all positions</th></tr></thead><tbody data-stat-frequency></tbody></table></div>`;
    anchor.prepend(root);
    root.open=true;
    window.DNCraftingStatsTables.dashboard(root,'Personal · top-value rolls');
    const frequency=window.DNCraftingStatsTables.frequency(root.querySelector('[data-stat-frequency]'));
    const get=name=>root.querySelector('[data-'+name+']'),filter={excludeManual:true};let dirty=true;
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
      const data=core.analyze(items,filter);
      get('stats-count').textContent=data.history.length+' logged · '+data.kept+' collected · '+data.total+' eligible · '+data.excluded+' excluded · '+data.inferred+' inferred';
      frequency.update(data.frequencies,data.total);
      window.DNCraftingStatsTables.renderDistributions(root,data.distributions,filter.hall);
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
