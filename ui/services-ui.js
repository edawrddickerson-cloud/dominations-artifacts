/* Optional account/privacy controls. Existing game workflows remain independent.
 * Destructive replacements require an explicit choice after durable recovery. */
(() => {
  'use strict';
  const config=window.DNServiceConfig,cloud=window.DNCloud,consent=window.DNConsent;
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='services.css?v=20261022-discord-account';document.head.appendChild(sheet);
  const text={disabled:'Cloud sync unavailable.',
    'signed-out':'Not signed in.',unlinked:'Choose which data to use.',
    synced:'Saved to your account.',upload:'Waiting to sync.',remote:'Newer account data available.',
    conflict:'Conflicting changes. Choose which data to use.',
    pending:'Saved locally. Sync pending.',offline:'Saved locally. Cloud sync unavailable.',error:'Saved locally. Cloud sync needs attention.'};
  function download(value,prefix) {
    const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    link.href=url;link.download=prefix+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function privacyMarkup(prefix) {
    const prompt=prefix==='banner';
    return '<fieldset class="service-preferences"><legend>Optional data sharing</legend>'+
      '<label><input type="checkbox" data-consent="analytics" id="'+prefix+'-analytics"><span><strong>Improve features</strong><small>Share which features you use.</small></span></label>'+
      '<label><input type="checkbox" data-consent="diagnostics" id="'+prefix+'-diagnostics"><span><strong>Improve scanner reliability</strong><small>Share errors and scan performance.</small></span></label>'+
      '<label><input type="checkbox" data-consent="research" id="'+prefix+'-research"><span><strong>Contribute crafting research</strong><small>Only from research sessions you choose to start.</small></span></label>'+
      '</fieldset><p class="service-sharing-facts">No screenshots or full scan text.'+(prompt?' Sharing is optional.':'')+' <a href="privacy.html">Privacy details</a></p>'+
      (prompt?'<p class="service-sharing-settings">Change anytime in <a href="config.html#account-privacy">Profiles → Account & Privacy</a>.</p>':'')+
      '<div class="service-actions"><button type="button" class="btn'+(prompt?' profile-delete-confirm':'')+'" data-save-consent>'+(prompt?'Share selected data':'Save preferences')+'</button><button type="button" class="btn" data-reject-consent>'+(prompt?'No thanks':'Turn off sharing')+'</button></div><p class="service-privacy-status" role="status" aria-live="polite" aria-atomic="true" data-privacy-status></p>';
  }
  function privacySummary(value) {
    return 'Preferences saved.';
  }
  function showPrivacyNotice(message) {
    document.querySelector('.service-consent-notice')?.remove();
    const notice=document.createElement('aside');notice.className='service-panel service-consent-notice';notice.setAttribute('role','status');notice.textContent=message+' ';
    const link=document.createElement('a');link.href='config.html#account-privacy';link.textContent='Change preferences';notice.appendChild(link);document.body.appendChild(notice);setTimeout(()=>notice.remove(),6000);
  }
  function wirePrivacy(root) {
    const inputs=[...root.querySelectorAll('[data-consent]')],save=root.querySelector('[data-save-consent]'),status=root.querySelector('[data-privacy-status]');
    const prompt=root.matches('dialog'),saveLabel=prompt?'Share selected data':'Save preferences';
    function refresh(){
      const ready=window.DNIntegrationCore.privacyReady(config),researchReady=window.DNIntegrationCore.researchReady(config),value=consent.get();
      for(const input of inputs){
        const research=input.dataset.consent==='research';input.disabled=!ready || research && !researchReady;input.checked=!input.disabled && value[input.dataset.consent];
        if(research)input.closest('label').hidden=!researchReady;
      }
      save.disabled=!ready || value.decided;save.textContent=ready && value.decided?'Saved':saveLabel;
      status.dataset.state=ready?'saved':'unavailable';
      status.textContent=!ready?'Sharing is unavailable.':value.decided?privacySummary(value):'';
    }
    refresh();const unsubscribe=consent.subscribe(refresh);
    for(const input of inputs)input.addEventListener('change',()=>{
      const value=consent.get(),dirty=inputs.some(field=>!field.disabled && field.checked!==value[field.dataset.consent]);
      save.disabled=!window.DNIntegrationCore.privacyReady(config) || value.decided && !dirty;
      save.textContent=save.disabled && value.decided?'Saved':saveLabel;
      status.dataset.state=dirty?'unsaved':'saved';
      status.textContent=prompt?'':dirty?'Unsaved changes.':value.decided?privacySummary(value):'';
    });
    function persist(values) {
      try{
        const previous=consent.get();consent.set(values);
        if(['analytics','diagnostics','research'].some(key=>values[key] && !previous[key]))showPrivacyNotice('Thank you for helping make the tool better for everyone.');
        else if(prompt && !document.getElementById('account-privacy'))showPrivacyNotice('Sharing preferences saved.');
      }
      catch{status.dataset.state='error';status.textContent='Preferences could not be saved in this browser. Your previously saved choices still apply. Please try again.';}
    }
    save.addEventListener('click',()=>persist(Object.fromEntries(inputs.map(input=>[input.dataset.consent,!input.disabled && input.checked]))));
    root.querySelector('[data-reject-consent]').addEventListener('click',()=>persist({}));
    return unsubscribe;
  }
  let banner;
  if(window.DNIntegrationCore.privacyReady(config) && config.posthogToken && !consent.get().decided) {
    banner=document.createElement('dialog');banner.className='profile-delete-dialog service-panel service-consent-banner';banner.setAttribute('aria-labelledby','sharing-title');banner.setAttribute('aria-describedby','sharing-request');
    banner.innerHTML='<h2 id="sharing-title">A little help for everyone?</h2><p id="sharing-request">Would you help make the tool better for everyone? Sharing which features you use helps us decide what to improve next. Sharing scan errors and timings helps us find problems and make the scanner faster and more reliable.</p>'+privacyMarkup('banner');
    banner.addEventListener('cancel',event=>{event.preventDefault();banner.querySelector('[data-reject-consent]').click();});
    let promptTimer=null;
    const show=()=>{
      if(consent.get().decided)return;
      if(document.hidden || document.querySelector('dialog[open]')){promptTimer=setTimeout(show,500);return;}
      document.body.appendChild(banner);
      banner.showModal();
    };
    const stopWaiting=window.DNTelemetry.onSuccessfulScan(()=>{promptTimer=setTimeout(show,1200);});
    const unwire=wirePrivacy(banner),unsubscribe=consent.subscribe(value=>{
      if(promptTimer!==null)clearTimeout(promptTimer);stopWaiting();
      if(banner.open)banner.close();banner.remove();unwire();unsubscribe();
    });
  }
  if(document.body.classList.contains('page-config')) {
    const root=document.createElement('section');root.id='account-privacy';root.className='service-panel';root.setAttribute('aria-label','Account and privacy');
    root.innerHTML='<h2>Account & Privacy</h2><p role="status" data-cloud-status></p><p role="alert" data-auth-error hidden></p>'+
      '<div class="service-actions service-discord-account"><button type="button" class="btn" data-signin>Continue with Discord</button><button type="button" class="btn" data-signout hidden>Sign out</button><span data-account-identity></span></div>'+
      '<div class="service-actions" data-signed-in hidden><button type="button" class="btn" data-sync>Sync now</button><button type="button" class="btn" data-export-account>Export account data</button></div>'+
      '<div class="service-choice" data-cloud-choice hidden><p>A safety backup is saved before replacement. Close other tabs and stop scanning first.</p><div class="service-actions"><button type="button" class="btn" data-use-local>Use this browser’s data</button><button type="button" class="btn" data-use-cloud>Use the account’s data</button></div></div>'+
      '<div class="service-actions"><button type="button" class="btn" data-download-recovery>Show safety backups</button></div><div data-recovery-list></div><p role="status" data-account-action-status></p>'+
      privacyMarkup('settings')+'<details data-privacy-details><summary>Data & privacy details</summary><p data-privacy-contact></p><p data-retention></p><p data-analytics-id></p></details>'+
      '<details data-delete-options hidden><summary>Delete account or research</summary><p>Deletes cloud collections, settings and research. Analytics deletion is requested separately. Local data stays on this device. Export a backup first.</p><div class="service-actions"><button type="button" class="btn" data-delete-research>Delete contributed research</button><button type="button" class="btn" data-delete-account>Delete account</button></div></details>';
    document.querySelector('.app-main').appendChild(root);wirePrivacy(root);
    const get=name=>root.querySelector('[data-'+name+']');let busy=false;
    async function run(action) {
      if(busy)return;busy=true;refresh();get('account-action-status').textContent='';
      try{await action();}catch(error){get('account-action-status').textContent=error.message || 'The action could not be completed. Your local data is unchanged.';}
      finally{busy=false;refresh();}
    }
    function refresh() {
      const user=cloud.user(),state=cloud.state();
      get('cloud-status').textContent=text[state.status] || text.offline;
      get('account-identity').textContent=user?'Discord User: '+user.displayName:'';
      get('signin').hidden=!!user || !cloud.configured();get('signout').hidden=!user;
      get('auth-error').textContent=state.authError || '';get('auth-error').hidden=!state.authError;
      get('signed-in').hidden=!user;get('delete-options').hidden=!user;
      get('cloud-choice').hidden=!user || !['unlinked','remote','conflict','error'].includes(state.status);
      get('use-cloud').disabled=busy || !state.revision;
      for(const button of root.querySelectorAll('button:not([data-use-cloud]):not([data-save-consent]):not([data-reject-consent])'))button.disabled=busy;
      get('privacy-contact').textContent=config.privacyContact?'Privacy contact: '+config.privacyContact:'';
      get('retention').textContent=window.DNIntegrationCore.privacyReady(config)?'Analysis history: feature use '+config.analyticsRetentionDays+' days; scanner reliability '+config.diagnosticsRetentionDays+' days. This is not a deletion deadline.'+(window.DNIntegrationCore.researchReady(config)?' Research retention: '+config.researchRetentionDays+' days.':''):'';
      const analyticsId=window.DNTelemetry.analyticsId();get('analytics-id').textContent=analyticsId?'Analytics reference: '+analyticsId:'';
    }
    get('signin').addEventListener('click',()=>run(()=>cloud.signInWithDiscord()));
    get('sync').addEventListener('click',()=>run(()=>cloud.sync()));
    get('signout').addEventListener('click',()=>run(()=>cloud.signOut()));
    get('export-account').addEventListener('click',()=>run(async()=>download(await cloud.exportAccount(),'dominations-account')));
    get('download-recovery').addEventListener('click',()=>run(async()=>{
      const copies=await cloud.recovery();if(!copies.length)throw Error('No safety backups.');
      const list=get('recovery-list');list.textContent='Download a backup, then use Import Backup above.';
      copies.forEach((copy,index)=>{
        const actions=document.createElement('div');actions.className='service-actions';
        const local=document.createElement('button');local.type='button';local.className='btn';local.textContent='Local backup '+copy.createdAt;
        local.addEventListener('click',()=>download(copy.local,'dominations-before-cloud-'+index));actions.appendChild(local);
        if(copy.remote?.data){const remote=document.createElement('button');remote.type='button';remote.className='btn';remote.textContent='Cloud backup · version '+copy.remote.revision;
          remote.addEventListener('click',()=>download({kind:'dominations-planner-backup',version:1,exportedAt:copy.createdAt,settings:copy.remote.data.settings,records:copy.remote.data.records},'dominations-cloud-version-'+copy.remote.revision));actions.appendChild(remote);}
        list.appendChild(actions);
      });
    }));
    for(const [name,choice] of [['use-local','local'],['use-cloud','cloud']])get(name).addEventListener('click',()=>run(async()=>{
      if(choice==='cloud' && !confirm('Use the account’s saved data in this browser? Stop scanning and close other planner tabs first. Your current data will be saved as a safety copy.'))return;
      if(choice==='local' && cloud.state().revision && !confirm('Replace the account’s current version with this browser’s data? A safety copy of both versions will be retained.'))return;
      const result=await cloud.choose(choice);if(result.reload)location.reload();
    }));
    get('delete-research').addEventListener('click',()=>run(async()=>{if(!confirm('Delete this account’s contributed research? Collection data will remain.'))return;consent.set({...consent.get(),research:false});await window.DNResearch.clear();await cloud.deleteResearch();get('account-action-status').textContent='Contributed research deleted.';}));
    get('delete-account').addEventListener('click',()=>run(async()=>{if(!confirm('Permanently delete this cloud account and its contributed research? Export your data first. Local planner data will remain.'))return;const response=await cloud.deleteAccount();get('account-action-status').textContent=response.analyticsDeletionRequested?'Account deleted. Analytics deletion has been requested.':'Account deleted. Your local planner data remains available.';}));
    cloud.subscribe(refresh);consent.subscribe(refresh);refresh();
    if(location.hash==='#account-privacy')root.scrollIntoView({block:'start'});
  }
  const scanner=document.getElementById('scanner-collect');
  if(scanner && !window.DNStorageRecognition && window.DNResearch && window.DNIntegrationCore.researchReady(config)) {
    const root=document.createElement('details');root.className='service-panel service-research';
    root.innerHTML='<summary>Optional crafting research</summary><p>Confirm only artifacts just generated in the game. Revisiting an artifact is not a new craft. Include rejected and incomplete results as well as good ones. This does not add items to your Collection.</p>'+
      '<div data-research-start><label>Game version, if known <input type="text" maxlength="80" data-game-version></label><label>Crafting event, if known <input type="text" maxlength="120" data-event-context></label><label>Planned craft count, if known <input type="number" min="0" max="100000" data-expected-crafts></label><button type="button" class="btn" data-start-research>Start research session</button></div>'+
      '<div data-research-active hidden><p data-research-latest></p><div class="service-actions"><button type="button" class="btn" data-confirm-craft>Confirm this is a new craft</button><label>Decision <select data-disposition><option value="unknown">Unknown</option><option value="retained">Retained</option><option value="rejected">Rejected</option></select></label></div><label>Total crafts actually attempted, if known <input type="number" min="0" max="100000" data-attempted-crafts></label><button type="button" class="btn" data-finish-research>Finish session</button></div>'+
      '<p role="status" data-research-status></p><button type="button" class="btn" data-export-research>Export research evidence</button><p><a href="config.html#account-privacy">Account and sharing preferences</a></p>';
    scanner.closest('details').after(root);
    const get=name=>root.querySelector('[data-'+name+']');let busy=false,localError='';
    function refresh() {
      const state=window.DNResearch.status(),ready=consent.get().research && !!cloud.user();
      get('research-start').hidden=!!state.active;get('research-active').hidden=!state.active;
      get('start-research').disabled=busy || !ready;get('confirm-craft').disabled=busy || !state.latest || !!state.latest.new_craft;
      get('finish-research').disabled=busy;get('disposition').disabled=busy || !state.latest;
      get('disposition').value=state.latest?.disposition || 'unknown';
      get('research-latest').textContent=state.latest?(state.latest.category || 'Unidentified artifact')+' · '+state.latest.perks.length+' rows · '+(state.latest.new_craft?'confirmed new craft':'not confirmed as a new craft'):'Read the next newly crafted artifact.';
      get('research-status').textContent=localError || state.error || (!ready?'Enable research sharing and sign in to contribute.':state.confirmed+' confirmed outcomes recorded.');
    }
    async function run(fn){if(busy)return;busy=true;localError='';refresh();try{await fn();}catch(error){localError=error.message;}finally{busy=false;refresh();}}
    get('start-research').addEventListener('click',()=>run(()=>window.DNResearch.start({gameVersion:get('game-version').value,eventContext:get('event-context').value,expectedCrafts:get('expected-crafts').value===''?null:Number(get('expected-crafts').value)})));
    get('confirm-craft').addEventListener('click',()=>run(()=>window.DNResearch.confirm()));
    get('disposition').addEventListener('change',()=>{const value=get('disposition').value;run(()=>window.DNResearch.disposition(value));});
    get('finish-research').addEventListener('click',()=>run(()=>window.DNResearch.finish(get('attempted-crafts').value===''?null:Number(get('attempted-crafts').value))));
    get('export-research').addEventListener('click',()=>run(()=>{const value=window.DNResearch.export();if(!value)throw Error('There is no saved research for this account on this device.');download(value,'dominations-research');}));
    window.DNResearch.subscribe(refresh);consent.subscribe(refresh);cloud.subscribe(refresh);refresh();
  }
})();
