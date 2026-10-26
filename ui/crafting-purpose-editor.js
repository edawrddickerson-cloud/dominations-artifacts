/* Category-local collection targets with optional stat sources and shared ratings. */
(() => {
  'use strict';
  const root=document.querySelector('[data-crafting-purposes]'),service=window.DNCraftingPurposes,DN=window.DN;
  if(!root||!service)return;
  const categories=[['attacking','Attacking'],['defensive','Defensive'],['economy','Economy']];
  const tabs=[...categories,['rare','Rare Cards'],['ratings','Rating Defaults']];
  let rareView=location.hash==='#rare';
  let ratingsView=location.hash==='#ratings';
  const drafts=new Map();
  const statOrders=new Map();
  let savingRating=false,savingTargets=false,renderedKey=null;
  let draft,profileId,baseline='',status='';
  const requestedCategory=categories.some(([id])=>location.hash==='#'+id)?location.hash.slice(1):null;
  let category=requestedCategory||'attacking';
  let statSort=DN.lsGet('dn-target-stat-sort')||'name';
  if(!['name','name-desc','rating-desc','rating-asc'].includes(statSort))statSort='name';
  const fresh=(targetCategory=category)=>({id:null,label:'',category:targetCategory,selections:targetCategory==='attacking'?['attack-enemy-buildings']:[],perks:[],excludedPerks:[],addOns:{}});
  const dirty=()=>draft && JSON.stringify(draft)!==baseline;
  const firstId=(state,category)=>state.customPurposes.find(purpose=>purpose.category===category)?.id||null;
  const orderKey=()=>profileId+':'+category+':'+(draft.id||'new');
  function loadDraft(state,id=state.activeId) {
    draft=structuredClone(state.customPurposes.find(purpose=>purpose.id===id)||fresh());
    category=draft.category;
    baseline=JSON.stringify(draft);status='';
    drafts.set(profileId+':'+category,{draft,baseline});
  }
  function ensureDraft(state) {
    const current=DN.activeProfileId();
    if(profileId!==current) {
      if(profileId)drafts.set(profileId+':'+category,{draft,baseline});
      profileId=current;
      const active=state.customPurposes.find(p=>p.id===state.activeId);
      category=requestedCategory||active?.category||category;
      const previous=drafts.get(current+':'+category);
      if(previous){({draft,baseline}=previous);}else loadDraft(state,active?.category===category?active.id:firstId(state,category));
    }else if(!draft)loadDraft(state);
    else if(draft.id&&!state.customPurposes.some(purpose=>purpose.id===draft.id))loadDraft(state,firstId(state,category));
    else if(draft.id&&!dirty()&&JSON.stringify(state.customPurposes.find(purpose=>purpose.id===draft.id))!==baseline)loadDraft(state,draft.id);
  }
  function setStatus(message) {status=message;const node=root.querySelector('[data-purpose-settings-status]');if(node){node.textContent=message;node.hidden=!message;}}
  function unsavedStatus() {setStatus(dirty()?'Unsaved target changes. Save this target to update the scanner.':'');}
  function switchCategory(next) {
    if(['rare','ratings'].includes(next) || (rareView || ratingsView) && next===category){
      rareView=next==='rare';ratingsView=next==='ratings';history.replaceState(null,'','#'+next);render();
      root.querySelector('[data-crafting-tab="'+next+'"]').focus();return;
    }
    rareView=false;
    ratingsView=false;
    if(next===category)return;
    drafts.set(profileId+':'+category,{draft,baseline});
    category=next;
    const state=service.settings(),previous=drafts.get(profileId+':'+category);
    if(previous&&(!previous.draft.id||state.customPurposes.some(p=>p.id===previous.draft.id))){({draft,baseline}=previous);status='';}
    else loadDraft(state,firstId(state,category));
    history.replaceState(null,'','#'+category);
    if(draft.id)service.setActive(draft.id);
    render();
    root.querySelector('[data-crafting-tab="'+category+'"]').focus();
  }
  const categoryLabel=id=>id==='attacking'?'Attacking':id==='defensive'?'Defensive':'Economy';
  function renderSources(state) {
    return '<div class="purpose-stat-sources">'+categories.filter(([id])=>id!==category).map(([id])=>{
      const addon=draft.addOns[id],sources=state.customPurposes.filter(p=>p.category===id);
      const missing=addon?.source==='target'&&!sources.some(p=>p.id===addon.targetId);
      return '<div class="purpose-stat-source"><label><input type="checkbox" data-purpose-addon="'+id+'"'+(addon?' checked':'')+' /> Include '+categoryLabel(id)+' Stats</label>'+
        (addon?'<label class="purpose-source-picker"><span class="visually-hidden">'+categoryLabel(id)+' stat source</span><select data-purpose-addon-source="'+id+'"><option value="profile"'+(addon.source==='profile'?' selected':'')+'>Full profile configuration</option>'+sources.map(p=>'<option value="'+p.id+'"'+(addon.targetId===p.id?' selected':'')+'>'+DN.esc(p.label)+'</option>').join('')+(addon.source==='snapshot'?'<option value="snapshot" selected>Previous '+categoryLabel(id).toLowerCase()+' selection</option>':'')+(missing?'<option value="'+DN.esc(addon.targetId)+'" selected>Missing target — choose a replacement</option>':'')+'</select></label>':'')+'</div>';
    }).join('')+'</div>';
  }
  function renderChoices() {
    const choices=service.choices.filter(choice=>choice.category===category&&!choice.id.startsWith('general-'));
    const renderChoice=choice=>'<label><input type="checkbox" data-purpose-selection="'+choice.id+'"'+(draft.selections.includes(choice.id)?' checked':'')+' /> <span>'+DN.esc(choice.label)+'</span></label>';
    if(category!=='attacking')return choices.map(renderChoice).join('');
    return [['barracks','Barracks Troops'],['factory','Factory Troops'],['air','Airstrip Troops']].map(([type,label])=>
      '<fieldset class="purpose-troop-group"><legend>'+label+'</legend><div class="purpose-troop-options">'+choices.filter(choice=>DN.armyUnitType(choice.label.replace(/ attack$/,''))===type).map(renderChoice).join('')+'</div></fieldset>'
    ).join('')+'<div class="purpose-troop-options">'+choices.filter(choice=>choice.id==='attack-enemy-buildings').map(renderChoice).join('')+'</div>';
  }
  function render() {
    if(savingRating||savingTargets)return;
    const previousScroll=root.querySelector('[data-purpose-config-list]')?.scrollTop||0;
    const focusedPerk=root.contains(document.activeElement)&&document.activeElement.matches('[data-purpose-weight]')?document.activeElement.dataset.perk:null;
    const state=service.settings();ensureDraft(state);
    const sameTarget=renderedKey===orderKey();
    const activeTab=ratingsView?'ratings':rareView?'rare':category;
    document.getElementById('rating-defaults-panel').hidden=!ratingsView;
    root.innerHTML=
      '<div class="crafting-purpose-tabs crafting-purpose-tabs-five" role="tablist" aria-label="Target selections">'+tabs.map(([id,label])=>'<button type="button" id="crafting-tab-'+id+'" role="tab" aria-selected="'+(activeTab===id)+'" aria-controls="'+(id==='ratings'?'rating-defaults-panel':'purpose-section-panel')+'" tabindex="'+(activeTab===id?'0':'-1')+'" data-crafting-tab="'+id+'">'+label+'</button>').join('')+'</div>'+
      '<div id="purpose-section-panel" role="tabpanel" aria-labelledby="crafting-tab-'+(rareView?'rare':category)+'"'+(ratingsView?' hidden':'')+'>'+
      (ratingsView?'':rareView?renderRareCards(state):
      '<div class="purpose-saved-toolbar"><div class="purpose-saved-list"><table class="purpose-saved-table"><thead><tr><th scope="col">Target</th><th scope="col">Flag in crafting scanner</th></tr></thead><tbody>'+state.customPurposes.filter(purpose=>purpose.category===category).map(purpose=>'<tr class="purpose-saved-choice"><td><button type="button" class="btn btn-choice" data-purpose-edit="'+purpose.id+'" aria-pressed="'+(purpose.id===draft.id)+'">'+DN.esc(purpose.label)+'</button></td><td><input type="checkbox" data-purpose-enabled="'+purpose.id+'"'+(state.selected.includes(purpose.id)?' checked':'')+' aria-label="'+DN.esc('Flag '+purpose.label+' in crafting scanner')+'" /></td></tr>').join('')+'</tbody></table></div>'+
      '<div class="purpose-new-action"><button type="button" class="btn btn-primary btn-prominent purpose-new-button" data-purpose-new><span aria-hidden="true">+</span> Add target</button></div></div>'+
      '<div class="purpose-editor-heading"><label>Target name <input type="text" maxlength="60" data-purpose-name placeholder="For example, General defence or Anti-bomber" /></label>'+
      '<div class="purpose-builder-actions"><button type="button" class="btn btn-accent" data-purpose-save>Save target</button><button type="button" class="btn" data-purpose-revert>Revert changes</button><button type="button" class="btn" data-purpose-delete'+(!draft.id?' hidden':'')+'>Delete target</button></div></div>'+
      '<p data-purpose-settings-status role="status"></p><div class="crafting-purpose-layout"><div class="crafting-purpose-selection">'+
      '<div id="purpose-selection-panel">'+
      '<div class="crafting-purpose-options">'+renderChoices()+'</div>'+renderSources(state)+'</div></div>'+
      '<aside class="crafting-purpose-configuration" aria-labelledby="purpose-configuration-title"><div class="purpose-config-heading"><h3 id="purpose-configuration-title"><button type="button" data-purpose-sort-column="name">Target settings <span aria-hidden="true"></span></button></h3><h3><button type="button" data-purpose-sort-column="rating">Rating <span aria-hidden="true"></span></button></h3></div><div class="purpose-weight-list purpose-combined-list" data-purpose-config-list></div></aside></div>')+'</div>';
    if(rareView || ratingsView)return;
    root.querySelector('[data-purpose-name]').value=draft.label;
    renderConfiguration();setStatus(status||(dirty()?'Unsaved target changes. Save this target to update the scanner.':''));
    if(sameTarget) {
      if(focusedPerk)[...root.querySelectorAll('[data-purpose-weight]')].find(input=>input.dataset.perk===focusedPerk)?.focus({preventScroll:true});
      root.querySelector('[data-purpose-config-list]').scrollTop=previousScroll;
    }
    renderedKey=orderKey();
  }
  function renderRareCards(state) {
    const segments=(preset,kind,label,options,current)=>'<fieldset class="seg-field"><legend>'+label+'</legend><div class="seg seg-equal" role="group" aria-label="'+DN.esc(preset.label+' '+label)+'">'+options.map(([value,text])=>'<button type="button" class="seg-btn" data-rare-'+kind+'="'+preset.id+'" data-value="'+value+'" aria-pressed="'+(value===current)+'">'+text+'</button>').join('')+'</div></fieldset>';
    return categories.map(([category,label])=>'<section class="purpose-rare-family" data-rare-family="'+category+'" aria-labelledby="rare-family-'+category+'"><div class="purpose-rare-family-heading"><h3 id="rare-family-'+category+'">'+label+'</h3><button type="button" class="btn btn-small" data-rare-family-off="'+category+'" aria-label="Turn off all '+label+' rare card presets">Off all</button></div><div class="purpose-rare-list">'+service.rareDefinitions.filter(preset=>preset.category===category).sort((a,b)=>a.label.localeCompare(b.label)).map(preset=>
      '<section class="purpose-rare-row'+(preset.kind==='stat'?' purpose-rare-stat':'')+'" aria-label="'+DN.esc(preset.label)+'"><h4 class="purpose-rare-name">'+DN.esc(preset.label)+'</h4>'+
      segments(preset,'count','Matching lines',[[3,'3× and 4×'],[4,'4× only'],[0,'Off']],state.rareCards[preset.id]||0)+
      (preset.kind==='unit'?segments(preset,'mode','Stats',[['all','Damage &amp; HP'],['damage','Damage'],['hp','Hitpoints']],state.rareModes[preset.id]||'all'):'')+'</section>').join('')+'</div></section>').join('');
  }
  function renderConfiguration(sortNow=false) {
    const container=root.querySelector('[data-purpose-config-list]');if(!container)return;
    const selections=service.choices.filter(choice=>choice.category===category&&draft.selections.includes(choice.id)).map(choice=>choice.id);
    const tabDraft={category,selections:selections.length?selections:['general-'+category],perks:draft.perks};
    const scroll=container.scrollTop,all=service.baseCandidatePerks(tabDraft),included=new Set(service.baseIncludedPerks(draft));
    service.settings();
    const previous=statOrders.get(orderKey());
    if(sortNow||!previous) {
      if(statSort==='name-desc')all.sort((a,b)=>b.localeCompare(a));
      else if(statSort!=='name')all.sort((a,b)=>(statSort==='rating-desc'?service.ratingOf(b)-service.ratingOf(a):service.ratingOf(a)-service.ratingOf(b))||a.localeCompare(b));
    } else {
      const positions=new Map(previous.map((name,index)=>[name,index]));
      all.sort((a,b)=>(positions.get(a)??Infinity)-(positions.get(b)??Infinity)||a.localeCompare(b));
    }
    statOrders.set(orderKey(),[...all]);
    for(const button of root.querySelectorAll('[data-purpose-sort-column]')) {
      const name=button.dataset.purposeSortColumn==='name',active=name?statSort.startsWith('name'):statSort.startsWith('rating');
      const ascending=name?statSort==='name':statSort==='rating-asc';
      const action=name?(statSort==='name'?'Sort Z to A':'Sort A to Z'):(statSort==='rating-desc'?'Sort lowest rating first':'Sort highest rating first');
      button.querySelector('span').textContent=active?(ascending?'↑':'↓'):'↕';
      button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',(name?'Target settings: ':'Rating: ')+action);
      button.title=name?action:"Each rating is multiplied by the stat's maximum upgraded percentage to calculate its score. For example, Bomber Damage rated 10 with a maximum of +20% scores 200 points. Matching stat scores are added for the artifact total. "+action+'.';
    }
    const sections=category==='attacking'?[
      ['Unit Buffs',['single','multi','generals','utility']],
      ['Enemy Building & Defender Debuffs',['enemy-buildings','enemy-all','enemy-defenders']],
      ['Battle Effects',['battle','enemy-utility']],
    ]:category==='defensive'?[
      ['Invading Unit Debuffs',['invading-single','invading-multi','invading-generals']],
      ['Building Buffs',['buildings','all-towers']],
      ['Defender Buffs',['defenders']],
    ]:[
      ['Looting',['loot']],
      ['Production & Storage',['production']],
      ['Research',['research']],
      ['Expansion',['costs']],
    ];
    const families=new Map(DN.PERK_GROUPS.flatMap(group=>group.perks.map(perk=>[perk.name,group.id])));
    const groups=new Map(sections.map(([label])=>[label,[]]));
    for(const name of all) {
      const key=category==='defensive'&&name.startsWith('Invading ')?'Invading Unit Debuffs':
        category==='attacking'&&name.endsWith(' Healing')?'Unit Buffs':
        sections.find(([,familiesIncluded])=>familiesIncluded.includes(families.get(name)))?.[0]||'Other Effects';
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(name);
    }
    container.innerHTML=[...groups].filter(([,stats])=>stats.length).map(([label,stats])=>
      '<section class="purpose-stat-group" data-purpose-stat-group="'+DN.esc(label)+'"><h4>'+DN.esc(label)+'</h4>'+stats.map(name=>'<div class="purpose-stat-row'+(!included.has(name)?' is-excluded':'')+'" data-purpose-stat="'+DN.esc(name)+'"><input type="checkbox" data-purpose-include="'+DN.esc(name)+'"'+(included.has(name)?' checked':'')+' aria-label="'+DN.esc('Include '+name)+'" /><div class="purpose-stat-rating">'+service.ratingRows('draft',[name])+'</div></div>').join('')+'</section>'
    ).join('')||'<p>No stats available.</p>';
    refreshStatCheckboxes();
    container.scrollTop=scroll;
  }
  function refreshStatCheckboxes() {
    service.settings();
    const included=new Set(service.baseIncludedPerks(draft));
    for(const checkbox of root.querySelectorAll('[data-purpose-include]')) {
      const name=checkbox.dataset.purposeInclude,zero=service.ratingOf(name)===0;
      checkbox.checked=included.has(name)&&!zero;
      checkbox.title=zero?'Set the rating above 0 to include this stat.':'';
      checkbox.closest('[data-purpose-stat]').classList.toggle('is-excluded',!checkbox.checked);
    }
  }
  function pendingDrafts(all=true) {
    drafts.set(profileId+':'+category,{draft,baseline});
    return [...drafts.entries()].filter(([key,value])=>key.startsWith(profileId+':')&&(all||key===profileId+':'+category)&&JSON.stringify(value.draft)!==value.baseline);
  }
  function resolveUnsaved(all=true) {
    const pending=pendingDrafts(all);
    if(!pending.length)return Promise.resolve(true);
    const dialog=document.getElementById('target-unsaved-dialog');
    if(dialog.open)return Promise.resolve(false);
    const error=document.getElementById('target-unsaved-error');
    document.getElementById('target-unsaved-description').textContent=(pending.length>1?'You have unsaved changes in '+pending.length+' tabs. Save all target changes before leaving, discard them, or cancel to return to the page.':'Save your target changes before leaving, discard them, or cancel to return to the page.');
    error.hidden=true;dialog.returnValue='cancel';
    return new Promise(resolve=>{
      function submit(event) {
        const action=event.submitter?.value;
        if(action!=='save'&&action!=='discard')return;
        event.preventDefault();
        try {
          savingTargets=true;
          if(action==='save') {
            const ids=service.saveCustoms(pending.map(([,value])=>value.draft)),state=service.settings();
            pending.forEach(([key,value],index)=>{
              const oldKey=key+':'+(value.draft.id||'new'),saved=state.customPurposes.find(entry=>entry.id===ids[index]);
              if(statOrders.has(oldKey))statOrders.set(key+':'+saved.id,statOrders.get(oldKey));
              drafts.set(key,{draft:structuredClone(saved),baseline:JSON.stringify(saved)});
            });
          }else {
            const state=service.settings();
            for(const [key,value] of pending) {
              const saved=state.customPurposes.find(entry=>entry.id===value.draft.id)||fresh(value.draft.category);
              drafts.set(key,{draft:structuredClone(saved),baseline:JSON.stringify(saved)});
            }
          }
          ({draft,baseline}=drafts.get(profileId+':'+category));
          if(draft.id)service.setActive(draft.id);
          status='';dialog.close(action);
        }catch(problem){error.textContent=problem.message||'Could not save your target changes.';error.hidden=false;}
        finally{savingTargets=false;}
      }
      dialog.addEventListener('submit',submit);
      dialog.addEventListener('close',()=>{
        dialog.removeEventListener('submit',submit);
        const approved=['save','discard'].includes(dialog.returnValue);
        if(approved)render();
        resolve(approved);
      },{once:true});
      dialog.showModal();
    });
  }
  async function edit(id) {
    if(dirty()&&!await resolveUnsaved(false))return;
    const state=service.settings();if(!state.customPurposes.some(purpose=>purpose.id===id))return;
    rareView=false;ratingsView=false;loadDraft(state,id);history.replaceState(null,'','#'+category);service.setActive(id);render();root.scrollIntoView({block:'start'});
  }
  root.addEventListener('input',event=>{
    if(event.target.matches('[data-purpose-name]')){draft.label=event.target.value;unsavedStatus();}
  });
  root.addEventListener('change',event=>{
    const target=event.target;
    if(target.matches('[data-purpose-enabled]')){service.selectPurpose(target.dataset.purposeEnabled,target.checked);return;}
    if(target.matches('[data-purpose-addon]')) {
      if(target.checked)draft.addOns[target.dataset.purposeAddon]={source:'profile'};
      else delete draft.addOns[target.dataset.purposeAddon];
      render();unsavedStatus();return;
    }
    if(target.matches('[data-purpose-addon-source]')) {
      if(target.value==='snapshot')return;
      draft.addOns[target.dataset.purposeAddonSource]=target.value==='profile'?{source:'profile'}:{source:'target',targetId:target.value};
      render();unsavedStatus();return;
    }
    if(target.matches('[data-purpose-selection]')) {
      draft.selections=target.checked?[...new Set([...draft.selections,target.dataset.purposeSelection])]:draft.selections.filter(id=>id!==target.dataset.purposeSelection);
      renderConfiguration();unsavedStatus();return;
    }
    if(target.matches('[data-purpose-include]')) {
      if(target.checked&&service.ratingOf(target.dataset.purposeInclude)===0){refreshStatCheckboxes();return;}
      if(target.checked&&!service.baseCandidatePerks(draft).includes(target.dataset.purposeInclude))draft.perks=[...new Set([...draft.perks,target.dataset.purposeInclude])];
      draft.excludedPerks=target.checked?draft.excludedPerks.filter(name=>name!==target.dataset.purposeInclude):[...new Set([...draft.excludedPerks,target.dataset.purposeInclude])];
      renderConfiguration();unsavedStatus();return;
    }
    if(target.matches('[data-purpose-weight]')) {
      if(!target.validity.valid)return;
      try{savingRating=true;service.setRating(target.dataset.perk,target.value===''?null:Number(target.value));refreshStatCheckboxes();unsavedStatus();}
      catch(error){setStatus(error.message||'Could not save this rating.');}
      finally{savingRating=false;}
    }
  });
  root.addEventListener('click',async event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.matches('[data-rare-family-off]')){
      const category=target.dataset.rareFamilyOff;service.disableRareFamily(category);
      root.querySelector('[data-rare-family-off="'+category+'"]').focus({preventScroll:true});return;
    }
    if(target.matches('[data-rare-count],[data-rare-mode]')){
      const kind=target.hasAttribute('data-rare-count')?'count':'mode',id=target.getAttribute('data-rare-'+kind),value=target.dataset.value;
      if(kind==='count')service.setRareCard(id,Number(value));else service.setRareMode(id,value);
      root.querySelector('[data-rare-'+kind+'="'+id+'"][data-value="'+value+'"]').focus({preventScroll:true});return;
    }
    if(target.matches('[data-purpose-sort-column]')) {
      statSort=target.dataset.purposeSortColumn==='name'?(statSort==='name'?'name-desc':'name'):(statSort==='rating-desc'?'rating-asc':'rating-desc');
      DN.lsSet('dn-target-stat-sort',statSort);renderConfiguration(true);return;
    }
    if(target.matches('[data-crafting-tab]')){switchCategory(target.dataset.craftingTab);return;}
    if(target.matches('[data-purpose-edit]')){edit(target.dataset.purposeEdit);return;}
    try {
      if(target.matches('[data-purpose-new]')){if(dirty()&&!await resolveUnsaved(false))return;draft=fresh();statOrders.delete(orderKey());baseline=JSON.stringify(draft);status='';render();root.querySelector('[data-purpose-name]').focus();}
      if(target.matches('[data-purpose-save]')) {
        const previousKey=orderKey(),id=service.saveCustom(draft);
        if(statOrders.has(previousKey))statOrders.set(profileId+':'+category+':'+id,statOrders.get(previousKey));
        loadDraft(service.settings(),id);status='Target saved and available in the crafting scanner.';render();
      }
      if(target.matches('[data-purpose-revert]')){loadDraft(service.settings(),draft.id);render();}
      if(target.matches('[data-purpose-delete]')&&draft.id&&confirm('Delete “'+draft.label+'”? Shared stat ratings will be kept.')){service.removeCustom(draft.id);const state=service.settings();loadDraft(state,firstId(state,category));service.setActive(draft.id);render();}
    }catch(error){setStatus(error.message||'Could not save this target.');}
  });
  root.addEventListener('keydown',event=>{
    const tab=event.target.closest('[data-crafting-tab]');if(!tab)return;
    const index=tabs.findIndex(([id])=>id===(ratingsView?'ratings':rareView?'rare':category)),next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
    if(next<0)return;event.preventDefault();root.querySelector('[data-crafting-tab="'+tabs[next][0]+'"]').click();
  });
  window.DNCraftingPurposeEditor={edit,canLeave:()=>resolveUnsaved(true)};
  document.addEventListener('click',async event=>{
    const link=event.target.closest('a[href]');
    if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
    const url=new URL(link.href,location.href);
    if(!['http:','https:'].includes(url.protocol)||(url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search&&url.hash)||!pendingDrafts().length)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(await resolveUnsaved())location.assign(url.href);
  },true);
  window.addEventListener('beforeunload',event=>{if(pendingDrafts().length){event.preventDefault();event.returnValue='';}});
  window.addEventListener('hashchange',()=>{if(tabs.some(([id])=>location.hash==='#'+id))switchCategory(location.hash.slice(1));});
  for(const event of ['dn-crafting-purposes-changed','focus','storage'])window.addEventListener(event,render);
  for(const id of ['header-main','header-war'])document.getElementById(id)?.addEventListener('click',render);
  render();
})();
