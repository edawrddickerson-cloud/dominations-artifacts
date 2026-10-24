/* Shared table controls for personal and aggregate crafting observations. */
(() => {
  'use strict';
  const percent=value=>value==null?'—':(100*value).toFixed(1)+'%';
  function cell(row,value){const td=document.createElement('td');td.textContent=value;row.append(td);return td;}
  const distributionsMarkup=()=>'<h3>11% stats per artifact · Main · all positions</h3>'+table('eleven','11% stats')+'<h3>Largest same-perk group per artifact · all positions</h3>'+table('duplicates','Same perk rows');
  function table(key,label){return '<div class="crafted-stats-scroll"><table><thead><tr><th>'+label+'</th><th>Exactly · count / sample</th><th>Frequency</th><th>At least · count / sample</th><th>Frequency</th></tr></thead><tbody data-distribution="'+key+'"></tbody></table></div>';}
  function renderDistributions(root,data){
    for(const key of ['eleven','duplicates']){
      const body=root.querySelector('[data-distribution="'+key+'"]'),fragment=document.createDocumentFragment();
      for(const bin of data?.[key] || []){const tr=document.createElement('tr');for(const value of [bin.count,bin.exact.hits+' / '+bin.exact.total,percent(bin.exact.rate),bin.atLeast.hits+' / '+bin.atLeast.total,percent(bin.atLeast.rate)])cell(tr,value);fragment.append(tr);}
      body.replaceChildren(fragment);
    }
  }
  function frequency(body){
    const table=body.closest('table'),wrapper=table.parentElement;
    const search=document.createElement('label');search.className='crafted-stats-search filter-control';search.textContent='Search perks';
    const input=document.createElement('input');input.type='search';input.autocomplete='off';search.append(input);wrapper.before(search);
    let entries=[],total=0,sort='items',direction=-1;
    const headers=[...table.querySelectorAll('th')],keys=['name','items','frequency','rows'];
    headers.forEach((th,i)=>{if(!keys[i])return;const button=document.createElement('button');button.type='button';button.className='crafted-stats-sort';button.textContent=th.textContent;th.replaceChildren(button);button.addEventListener('click',()=>{direction=sort===keys[i]?-direction:keys[i]==='name'?1:-1;sort=keys[i];render();});});
    function render(){
      const query=input.value.trim().toLowerCase(),fragment=document.createDocumentFragment();
      const value=entry=>sort==='frequency'?entry.items:entry[sort];
      const visible=entries.filter(entry=>entry.name.toLowerCase().includes(query)).sort((a,b)=>direction*(sort==='name'?a.name.localeCompare(b.name):value(a)-value(b)) || a.name.localeCompare(b.name));
      headers.forEach((th,i)=>{if(keys[i])th.setAttribute('aria-sort',keys[i]===sort?(direction===1?'ascending':'descending'):'none');});
      for(const entry of visible){
        const tr=document.createElement('tr');for(const v of [entry.name,entry.items,percent(total?entry.items/total:null),entry.rows])cell(tr,v);
        const values=cell(tr,'');for(const bin of entry.values){const line=document.createElement('div');line.textContent=bin.count+' @ '+bin.value+'% ('+percent(bin.rate)+')';values.append(line);}fragment.append(tr);
      }
      if(!visible.length){const tr=document.createElement('tr');cell(tr,entries.length?'No matching perks':'No eligible items').colSpan=5;fragment.append(tr);}
      body.replaceChildren(fragment);
    }
    input.addEventListener('input',render);
    return {update(data,sample){entries=data;total=sample;render();}};
  }
  window.DNCraftingStatsTables={distributionsMarkup,renderDistributions,frequency};
})();
