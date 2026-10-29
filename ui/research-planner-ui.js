/* Profile-scoped, local research progress. No account service or scanner state. */
(() => {
  'use strict';
  const core=window.DNResearchPlannerCore, $=id=>document.getElementById(id);
  const profile=window.DN?.activeProfileId() || 'main';
  const storageKey=`dn-p:${profile}:dn-research-planner`;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data,state,byId,readFailed=false,pinned=null;
  const fields={focus:$('research-focus'),age:$('research-age'),University:$('research-university'),Library:$('research-library'),building:$('research-building'),relation:$('research-relation'),availability:$('research-status'),query:$('research-search'),future:$('research-future'),finished:$('research-finished'),disputed:$('research-disputed')};
  function error(message='') {$('research-error').textContent=message;$('research-error').hidden=!message;}
  function load() {
    try {state=core.normalize(data,JSON.parse(localStorage.getItem(storageKey)||'null'));readFailed=false;}
    catch {state=core.normalize(data,null);readFailed=true;error('Saved progress unavailable. Reload to retry.');}
  }
  function save(change) {
    if(readFailed){error('Saved progress unavailable. Changes were not saved.');return false;}
    try {
      const latest=core.normalize(data,JSON.parse(localStorage.getItem(storageKey)||'null'));
      change(latest);localStorage.setItem(storageKey,JSON.stringify(latest));state=latest;
      $('research-save').textContent='Progress saved on this device';error();return true;
    } catch {error('Progress could not be saved on this device.');$('research-save').textContent='Changes not saved';return false;}
  }
  function options() {return Object.fromEntries(Object.entries(fields).filter(([k])=>!['age','University','Library'].includes(k)).map(([k,e])=>[k,e.type==='checkbox'?e.checked:e.value]));}
  function syncFields() {
    fields.age.value=state.age??'';
    for(const building of ['University','Library'])fields[building].value=state.buildings[building]??'';
  }
  function progressField(entry,id) {
    return `<div class="research-progress"><input id="${id}" data-progress="${esc(entry.id)}" type="number" min="0" max="${entry.max_level}" step="1" placeholder="—" aria-label="Completed levels: ${esc(entry.line)} ${esc(entry.name)} ${esc(entry.grid||'')}"><span>/ ${entry.max_level}</span></div>`;
  }
  function details(row) {
    const {entry,stage,dependencies,later}=row;
    const next=entry.stages[(row.completed??0)];
    const requirements=dependencies.map(r=>`<li>${r.any.map(p=>{
      const target=byId.get(p.id),n=core.completed(state,p.id);
      return `<button type="button" class="btn btn-small" data-prerequisite="${esc(p.id)}">${esc(target.name)} · ${p.level}</button> <span>${r.satisfied?'Met':`${n===null?'Unknown':n} / ${p.level}`}</span>`;
    }).join(' or ')}</li>`).join('');
    return `<details class="research-details"><summary>Requirements &amp; sources</summary><div class="research-meta">${entry.building} ${stage.building_level} · ${esc(data.ages[stage.age])}</div>
      ${next&&next.level!==stage.level?`<p>Next: ${entry.building==='Library'?'Chapter':'Level'} ${next.level} · ${esc(next.effect)}</p>`:''}
      ${requirements?`<ul>${requirements}</ul>`:'<p>No research prerequisites</p>'}
      ${stage.conditions?.length?`<ul>${stage.conditions.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:''}
      ${later.length&&entry.building==='Library'?`<ul>${later.map(s=>`<li>Chapter ${s.level}: ${esc(s.effect)}</li>`).join('')}</ul>`:''}
      ${entry.age_status==='conflicting_sources'?'<p>Age disputed · Excluded from ready research</p>':''}
      <a href="${esc(entry.source_url)}" target="_blank" rel="noopener noreferrer">Wiki source</a></details>`;
  }
  function render() {
    let rows=core.results(data,state,pinned?{focus:'all',future:true,disputed:true,finished:true}:options());
    if(pinned)rows=rows.filter(r=>r.entry.id===pinned);
    const body=$('research-rows'),existing=new Map([...body.querySelectorAll('tr[data-id]')].map(tr=>[tr.dataset.id,tr]));
    const focused=document.activeElement?.matches('[data-progress]')?document.activeElement.closest('tr[data-id]'):null;
    const keep=new Set(rows.map(r=>r.entry.id));
    for(const [id,tr] of existing)if(!keep.has(id)&&tr!==focused)tr.remove();
    for(const row of rows) {
      const {entry,stage,match}=row;
      let tr=existing.get(entry.id);
      if(!tr) {
        tr=document.createElement('tr');tr.dataset.id=entry.id;
        for(let n=0;n<5;n++)tr.append(document.createElement('td'));
        tr.children[4].innerHTML=progressField(entry,`completed-${entry.id}`);
        body.append(tr);
      }
      const open=tr.querySelector('details')?.open;
      tr.children[0].innerHTML=`<strong>${esc(entry.name)}</strong><div class="research-meta">${esc(entry.building)} · ${esc(entry.line)}</div><div class="research-meta">${esc(entry.study||'')} ${esc(entry.grid||'')} · ${entry.building==='Library'?'Chapter':'Level'} ${stage.level}</div>${details(row)}`;
      if(open)tr.querySelector('details').open=true;
      const bonus=stage.bonus?`<div class="research-meta">Level ${stage.level}: ${esc(stage.bonus)} · Max: ${esc(entry.stages.at(-1).bonus||'—')}</div>`:'';
      tr.children[1].innerHTML=`${esc(stage.effect)}<div class="research-meta">${esc(core.RELATIONS[match.relation])}${match.conditional?' · Conditional':''}</div>${bonus}`;
      tr.children[2].textContent=data.ages[stage.age];
      tr.children[3].textContent=row.status;
      tr.children[3].className=row.status==='Ready'?'research-status-ready':/disputed|conditions/.test(row.status)?'research-status-review':'';
      const field=tr.querySelector('[data-progress]');
      if(field!==document.activeElement)field.value=row.completed??'';
      field.setAttribute('aria-invalid',String(!field.validity.valid));
    }
    body.querySelector('[data-empty]')?.remove();
    if(!rows.length){const tr=document.createElement('tr');tr.dataset.empty='1';tr.innerHTML='<td colspan="5">No matching research</td>';body.append(tr);}
    $('research-count').textContent=`${rows.length} research items · ${rows.filter(r=>r.status==='Ready').length} ready`;
    $('research-return').hidden=!pinned;
  }
  const back=document.createElement('button');back.id='research-return';back.className='btn btn-small';back.textContent='Back to results';back.type='button';back.hidden=true;
  document.querySelector('.research-options').append(back);
  back.addEventListener('click',()=>{pinned=null;render();});
  async function start() {
    try {
      document.querySelectorAll('.research-filters select').forEach(field=>field.classList.add('ui-compact'));
      const labels={'Progress needed':'Record progress','Prerequisites needed':'Prerequisites','Building level needed':'Choose building level','Building upgrade needed':'Upgrade building','Check building level':'Check building','Check conditions':'Check conditions'};
      [...fields.availability.options].forEach(option=>{if(labels[option.value]){const value=option.value;option.textContent=labels[value];option.value=value;}});
      const response=await fetch('data/research_planner.json?v=1');if(!response.ok)throw Error('Catalogue unavailable');
      data=await response.json();byId=new Map(data.entries.map(e=>[e.id,e]));
      fields.focus.innerHTML='<option value="all">All research</option>'+['barracks','factory','air','goal'].map(type=>`<optgroup label="${({barracks:'Barracks',factory:'Factory',air:'Airstrip',goal:'Goals'})[type]}">${data.goals.filter(g=>g.type===type).map(g=>`<option value="${esc(g.id)}">${esc(g.label)}</option>`).join('')}</optgroup>`).join('');fields.focus.value='APC';
      fields.age.innerHTML+=[...Object.entries(data.ages)].filter(([i])=>Number(i)>=5).map(([i,name])=>`<option value="${i}">${esc(name)}</option>`).join('');
      for(const building of ['University','Library'])fields[building].innerHTML+=Object.keys(data.building_age_gates[building.toLowerCase()]).map(n=>`<option value="${n}">${n}</option>`).join('');
      fields.relation.innerHTML+=Object.entries(core.RELATIONS).map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('');
      load();syncFields();render();
      $('research-reference').textContent=`Reference data · ${data.checked_date}`;
      window.DNResearchPlanner={data,getState:()=>structuredClone(state),render,results:()=>core.results(data,state,options())};
    } catch {error('Research unavailable. Reload to retry.');$('research-count').textContent='Research unavailable';}
  }
  for(const [key,field] of Object.entries(fields))field.addEventListener(key==='query'?'input':'change',()=>{
    if(!data)return;
    if(key==='age'||key==='University'||key==='Library') {
      const value=field.value===''?null:Number(field.value);
      save(next=>{if(key==='age')next.age=value;else next.buildings[key]=value;});syncFields();
    }
    pinned=null;render();
  });
  $('research-rows').addEventListener('change',event=>{
    const field=event.target.closest('[data-progress]');if(!field||!data)return;
    const entry=byId.get(field.dataset.progress),value=field.value===''?null:Number(field.value);
    if(field.validity.badInput||value!==null&&(!Number.isInteger(value)||value<0||value>entry.max_level)) {
      field.setAttribute('aria-invalid','true');error(`Enter a completed level from 0 to ${entry.max_level}.`);return;
    }
    save(next=>{if(value===null)delete next.levels[entry.id];else next.levels[entry.id]=value;});render();
  });
  $('research-rows').addEventListener('focusout',event=>{if(event.target.matches('[data-progress]')&&event.target.getAttribute('aria-invalid')!=='true')setTimeout(()=>{if(data)render();},0);});
  $('research-rows').addEventListener('click',event=>{const button=event.target.closest('[data-prerequisite]');if(button){pinned=button.dataset.prerequisite;render();$('research-rows').querySelector('[data-progress]')?.focus();}});
  $('research-export').addEventListener('click',()=>{
    if(!data)return;
    const blob=new Blob([JSON.stringify({profile,exported_at:new Date().toISOString(),...state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='research-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  window.addEventListener('storage',event=>{if(event.key===storageKey&&data){load();syncFields();render();}});
  start();
})();
