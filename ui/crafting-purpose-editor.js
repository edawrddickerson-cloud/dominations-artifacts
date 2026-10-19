/* Named purpose editor. Selection sets combine across tabs; ratings stay shared. */
(() => {
  'use strict';
  const root=document.querySelector('[data-crafting-purposes]'),service=window.DNCraftingPurposes,DN=window.DN;
  if(!root||!service)return;
  const categories=[['attacking','Attacking'],['defensive','Defensive'],['economy','Economy']];
  const drafts=new Map();
  let draft,profileId,baseline='',status='';
  const requestedCategory=categories.some(([id])=>location.hash==='#'+id)?location.hash.slice(1):null;
  let category=requestedCategory||'attacking';
  const fresh=()=>({id:null,label:'',selections:[],perks:[],excludedPerks:[]});
  const dirty=()=>draft && JSON.stringify(draft)!==baseline;
  const defaultId=category=>'custom-general-'+category;
  function loadDraft(state,id=state.activeId) {
    draft=structuredClone(state.customPurposes.find(purpose=>purpose.id===id)||fresh());
    if(draft.builtIn)category=draft.category;
    baseline=JSON.stringify(draft);status='';
  }
  function ensureDraft(state) {
    const current=DN.activeProfileId();
    if(profileId!==current) {
      if(profileId)drafts.set(profileId,{draft,baseline});
      profileId=current;
      const previous=drafts.get(current);
      if(previous){({draft,baseline}=previous);}else loadDraft(state,requestedCategory&&state.customPurposes.find(p=>p.id===state.activeId)?.builtIn?defaultId(requestedCategory):state.activeId);
    }else if(!draft)loadDraft(state);
    else if(draft.id&&!state.customPurposes.some(purpose=>purpose.id===draft.id))loadDraft(state);
    else if(draft.id&&!dirty()&&JSON.stringify(state.customPurposes.find(purpose=>purpose.id===draft.id))!==baseline)loadDraft(state,draft.id);
  }
  function setStatus(message) {status=message;const node=root.querySelector('[data-purpose-settings-status]');if(node)node.textContent=message;}
  function unsavedStatus() {setStatus(dirty()?'Unsaved target changes. Save this target to update the scanner.':'Target saved. Shared rating edits save automatically.');}
  function render() {
    const state=service.settings();ensureDraft(state);
    root.innerHTML='<p>Set which artifact stats matter to you and how highly you value them. Save targets and enable them to flag useful upgrades in the crafting scanner.</p>'+
      '<div class="crafting-purpose-tabs" role="tablist" aria-label="Target selections">'+categories.map(([id,label])=>'<button type="button" id="crafting-tab-'+id+'" role="tab" aria-selected="'+(category===id)+'" aria-controls="purpose-section-panel" tabindex="'+(category===id?'0':'-1')+'" data-crafting-tab="'+id+'">'+label+'</button>').join('')+'</div>'+
      '<div id="purpose-section-panel" role="tabpanel" aria-labelledby="crafting-tab-'+category+'">'+
      '<div class="purpose-saved-toolbar"><div class="purpose-saved-list"><table class="purpose-saved-table"><thead><tr><th scope="col">Target</th><th scope="col">Flag in crafting scanner</th></tr></thead><tbody>'+state.customPurposes.filter(purpose=>purpose.builtIn?purpose.category===category:service.candidatePerks(purpose).some(name=>service.categoryFor(name)===category)||purpose.id===draft.id).map(purpose=>'<tr class="purpose-saved-choice"><td><button type="button" class="btn" data-purpose-edit="'+purpose.id+'" aria-pressed="'+(purpose.id===draft.id)+'">'+DN.esc(purpose.label)+'</button></td><td><input type="checkbox" data-purpose-enabled="'+purpose.id+'"'+(state.selected.includes(purpose.id)?' checked':'')+' aria-label="'+DN.esc('Flag '+purpose.label+' in crafting scanner')+'" /></td></tr>').join('')+'</tbody></table></div>'+
      '<div class="purpose-new-action"><button type="button" class="btn btn-accent purpose-new-button" data-purpose-new><span aria-hidden="true">+</span> Add target</button></div></div>'+
      '<div class="purpose-editor-heading"><label>Target name <input type="text" maxlength="60" data-purpose-name'+(draft.builtIn?' readonly':'')+' placeholder="For example, General defence or Anti-bomber" /></label>'+
      '<div class="purpose-builder-actions"><button type="button" class="btn btn-accent" data-purpose-save>Save target</button><button type="button" class="btn" data-purpose-revert>Revert changes</button><button type="button" class="btn" data-purpose-delete'+(!draft.id||draft.builtIn?' hidden':'')+'>Delete target</button></div></div>'+
      '<p data-purpose-settings-status role="status"></p><div class="crafting-purpose-layout"><div class="crafting-purpose-selection">'+
      '<div id="purpose-selection-panel">'+
      (draft.builtIn?'<p>This default target includes every catalogue stat in this section. Adjust the included stats on the right. Its name is fixed and it cannot be deleted.</p>':'')+
      '<div class="crafting-purpose-options">'+(draft.builtIn?'':service.choices.filter(choice=>choice.category===category&&!choice.id.startsWith('general-')).map(choice=>'<label><input type="checkbox" data-purpose-selection="'+choice.id+'"'+(draft.selections.includes(choice.id)?' checked':'')+' /> <span>'+DN.esc(choice.label)+'</span></label>').join(''))+'</div></div></div>'+
      '<aside class="crafting-purpose-configuration" aria-labelledby="purpose-configuration-title"><h3 id="purpose-configuration-title">Target settings</h3><div class="purpose-weight-list purpose-combined-list" data-purpose-config-list></div></aside></div></div>';
    root.querySelector('[data-purpose-name]').value=draft.label;
    renderConfiguration();setStatus(status|| (dirty()?'Unsaved target changes. Save this target to update the scanner.':draft.id?'Target saved. Shared rating edits save automatically.':'Choose selections and save a named target. Shared rating edits save automatically.'));
  }
  function renderConfiguration() {
    const container=root.querySelector('[data-purpose-config-list]');if(!container)return;
    const selections=service.choices.filter(choice=>choice.category===category&&draft.selections.includes(choice.id)).map(choice=>choice.id);
    const tabDraft={selections:selections.length?selections:['general-'+category],perks:draft.perks.filter(name=>service.categoryFor(name)===category)};
    const scroll=container.scrollTop,all=service.candidatePerks(tabDraft),included=new Set(service.includedPerks(draft));
    container.innerHTML=all.map(name=>'<div class="purpose-stat-row'+(!included.has(name)?' is-excluded':'')+'" data-purpose-stat="'+DN.esc(name)+'"><input type="checkbox" data-purpose-include="'+DN.esc(name)+'"'+(included.has(name)?' checked':'')+' aria-label="'+DN.esc('Include '+name)+'" /><div class="purpose-stat-rating">'+service.ratingRows('draft',[name])+'</div></div>').join('')||'<p>No stats available.</p>';
    container.scrollTop=scroll;
  }
  function canDiscard() {return !dirty()||confirm('Discard unsaved changes to this target? Shared rating edits are already saved.');}
  function edit(id) {
    if(!canDiscard())return;
    const state=service.settings();if(!state.customPurposes.some(purpose=>purpose.id===id))return;
    loadDraft(state,id);service.setActive(id);render();root.scrollIntoView({block:'start'});
  }
  root.addEventListener('input',event=>{
    if(event.target.matches('[data-purpose-name]')){draft.label=event.target.value;unsavedStatus();}
  });
  root.addEventListener('change',event=>{
    const target=event.target;
    if(target.matches('[data-purpose-enabled]')){service.selectPurpose(target.dataset.purposeEnabled,target.checked);return;}
    if(target.matches('[data-purpose-selection]')) {
      draft.selections=target.checked?[...new Set([...draft.selections,target.dataset.purposeSelection])]:draft.selections.filter(id=>id!==target.dataset.purposeSelection);
      renderConfiguration();unsavedStatus();return;
    }
    if(target.matches('[data-purpose-include]')) {
      if(target.checked&&!service.candidatePerks(draft).includes(target.dataset.purposeInclude))draft.perks=[...new Set([...draft.perks,target.dataset.purposeInclude])];
      draft.excludedPerks=target.checked?draft.excludedPerks.filter(name=>name!==target.dataset.purposeInclude):[...new Set([...draft.excludedPerks,target.dataset.purposeInclude])];
      renderConfiguration();unsavedStatus();return;
    }
    if(target.matches('[data-purpose-weight]')) {
      if(!target.validity.valid)return;
      try{service.setRating(target.dataset.perk,target.value===''?null:Number(target.value));setStatus('Shared profile rating saved in both editors. '+(dirty()?'Target selections still need saving.':''));}
      catch(error){setStatus(error.message||'Could not save this rating.');}
    }
  });
  root.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.matches('[data-crafting-tab]')){const next=target.dataset.craftingTab;if(draft.builtIn&&next!==category){if(!canDiscard())return;loadDraft(service.settings(),defaultId(next));service.setActive(draft.id);}category=next;history.replaceState(null,'','#'+category);render();root.querySelector('[data-crafting-tab="'+category+'"]').focus();return;}
    if(target.matches('[data-purpose-edit]')){edit(target.dataset.purposeEdit);return;}
    try {
      if(target.matches('[data-purpose-new]')){if(!canDiscard())return;draft=fresh();baseline=JSON.stringify(draft);status='';render();root.querySelector('[data-purpose-name]').focus();}
      if(target.matches('[data-purpose-save]')) {
        const id=service.saveCustom(draft);loadDraft(service.settings(),id);status='Target saved and available in the crafting scanner.';render();
      }
      if(target.matches('[data-purpose-revert]')){loadDraft(service.settings(),draft.id);render();}
      if(target.matches('[data-purpose-delete]')&&draft.id&&!draft.builtIn&&confirm('Delete “'+draft.label+'”? Shared stat ratings will be kept.')){service.removeCustom(draft.id);loadDraft(service.settings());render();}
    }catch(error){setStatus(error.message||'Could not save this target.');}
  });
  root.addEventListener('keydown',event=>{
    const tab=event.target.closest('[data-crafting-tab]');if(!tab)return;
    const index=categories.findIndex(([id])=>id===category),next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:-1;
    if(next<0)return;event.preventDefault();root.querySelector('[data-crafting-tab="'+categories[next][0]+'"]').click();
  });
  window.DNCraftingPurposeEditor={edit};
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  window.addEventListener('hashchange',()=>{if(categories.some(([id])=>location.hash==='#'+id)){const next=location.hash.slice(1);if(draft.builtIn&&next!==category){if(!canDiscard())return;loadDraft(service.settings(),defaultId(next));service.setActive(draft.id);}category=next;render();}});
  for(const event of ['dn-crafting-purposes-changed','focus','storage'])window.addEventListener(event,render);
  for(const id of ['header-main','header-war'])document.getElementById(id)?.addEventListener('click',render);
  render();
})();
