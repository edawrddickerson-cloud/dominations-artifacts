/* Optional account/privacy controls. Existing game workflows remain independent.
 * Destructive replacements require an explicit choice after durable recovery. */
(() => {
  'use strict';
  const config=window.DNServiceConfig,cloud=window.DNCloud,consent=window.DNConsent;
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='services.css?v=2';document.head.appendChild(sheet);
  const nav=document.querySelector('.site-nav-section[data-nav-settings]') || document.querySelector('.site-nav');
  if(nav && !nav.querySelector('[data-account-link]')) {
    const link=document.createElement('a');link.href='config.html#account-privacy';link.dataset.accountLink='1';link.className='nav-link';
    link.innerHTML='<span class="nav-text">Account & Privacy</span>';nav.appendChild(link);
  }
  const text={disabled:'Cloud accounts are not enabled in this version. Your data is saved in this browser.',
    'signed-out':'Use the planner locally, or sign in to save a cloud copy.',unlinked:'This browser is not linked to this account. Choose which data to use.',
    synced:'Saved to your account.',upload:'Local changes are waiting to sync.',remote:'A newer cloud version is available. Choose when to use it.',
    conflict:'This browser and the account have different changes. Both are preserved until you choose a version.',
    pending:'Saved locally. Cloud sync is pending.',offline:'Saved locally. Account services are unavailable; sync will retry.',error:'Saved locally. Cloud sync needs attention.'};
  function download(value,prefix) {
    const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    link.href=url;link.download=prefix+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function privacyMarkup(prefix) {
    return '<fieldset class="service-preferences"><legend>Optional data sharing</legend>'+
      '<label><input type="checkbox" data-consent="analytics" id="'+prefix+'-analytics"> Product analytics — help improve features and understand repeat usage.</label>'+
      '<label><input type="checkbox" data-consent="diagnostics" id="'+prefix+'-diagnostics"> Diagnostics — send error locations and sampled scanner timing and reliability metrics.</label>'+
      '<label><input type="checkbox" data-consent="research" id="'+prefix+'-research"> Crafting research — allow contributions from research sessions that I explicitly start.</label>'+
      '</fieldset><p>These choices do not affect scanning, scoring, local saving or account sync. Screenshots and full OCR text are excluded. <a href="privacy.html">Privacy details</a></p>'+
      '<div class="service-actions"><button type="button" class="btn" data-save-consent>Save preferences</button><button type="button" class="btn" data-reject-consent>Reject optional sharing</button></div><p class="service-privacy-status" role="status" aria-live="polite" aria-atomic="true" data-privacy-status></p>';
  }
  function privacySummary(value) {
    return 'Preferences saved in this browser. Product analytics: '+(value.analytics?'on':'off')+'. Diagnostics: '+(value.diagnostics?'on':'off')+'.'+
      (window.DNIntegrationCore.researchReady(config)?' Crafting research: '+(value.research?'on':'off')+'.':'');
  }
  function wirePrivacy(root) {
    const inputs=[...root.querySelectorAll('[data-consent]')],save=root.querySelector('[data-save-consent]'),status=root.querySelector('[data-privacy-status]');
    function refresh(){
      const ready=window.DNIntegrationCore.privacyReady(config),researchReady=window.DNIntegrationCore.researchReady(config),value=consent.get();
      for(const input of inputs){
        const research=input.dataset.consent==='research';input.disabled=!ready || research && !researchReady;input.checked=!input.disabled && value[input.dataset.consent];
        if(research)input.closest('label').hidden=!researchReady;
      }
      save.disabled=!ready || value.decided;save.textContent=ready && value.decided?'Saved':'Save preferences';
      status.dataset.state=ready?'saved':'unavailable';
      status.textContent=!ready?'Optional sharing is not available in this version.':value.decided?privacySummary(value):'Optional sharing is off. Choose your preferences, then save.';
    }
    refresh();const unsubscribe=consent.subscribe(refresh);
    for(const input of inputs)input.addEventListener('change',()=>{
      const value=consent.get(),dirty=inputs.some(field=>!field.disabled && field.checked!==value[field.dataset.consent]);
      save.disabled=!window.DNIntegrationCore.privacyReady(config) || value.decided && !dirty;
      save.textContent=save.disabled && value.decided?'Saved':'Save preferences';
      status.dataset.state=dirty?'unsaved':'saved';
      status.textContent=dirty?'Unsaved changes. Select Save preferences to apply them.':value.decided?privacySummary(value):'Optional sharing is off. Choose your preferences, then save.';
    });
    function persist(values) {
      try{consent.set(values);}
      catch{status.dataset.state='error';status.textContent='Preferences could not be saved in this browser. Your previously saved choices still apply. Please try again.';}
    }
    save.addEventListener('click',()=>persist(Object.fromEntries(inputs.map(input=>[input.dataset.consent,!input.disabled && input.checked]))));
    root.querySelector('[data-reject-consent]').addEventListener('click',()=>persist({}));
    return unsubscribe;
  }
  let banner;
  if(window.DNIntegrationCore.privacyReady(config) && config.posthogToken && !consent.get().decided) {
    banner=document.createElement('aside');banner.className='service-panel service-consent-banner';banner.setAttribute('aria-label','Privacy preferences');
    banner.innerHTML='<h2>Choose what to share</h2>'+privacyMarkup('banner');
    document.body.appendChild(banner);const unwire=wirePrivacy(banner),unsubscribe=consent.subscribe(value=>{
      banner.remove();unwire();unsubscribe();
      if(!document.getElementById('account-privacy')){
        const notice=document.createElement('aside');notice.className='service-panel service-consent-notice';notice.setAttribute('role','status');notice.textContent=privacySummary(value)+' ';
        const link=document.createElement('a');link.href='config.html#account-privacy';link.textContent='Change preferences';notice.appendChild(link);document.body.appendChild(notice);setTimeout(()=>notice.remove(),6000);
      }
    });
  }
  if(document.body.classList.contains('page-config')) {
    const root=document.createElement('section');root.id='account-privacy';root.className='service-panel';root.setAttribute('aria-label','Account and privacy');
    root.innerHTML='<h2>Account & privacy</h2><p role="status" data-cloud-status></p><p data-account-identity></p><p role="alert" data-auth-error hidden></p>'+
      '<div class="service-actions"><button type="button" class="btn" data-signin>Continue with Discord</button></div>'+
      '<div class="service-actions" data-signed-in hidden><button type="button" class="btn" data-sync>Sync now</button><button type="button" class="btn" data-export-account>Export account data</button><button type="button" class="btn" data-signout>Sign out</button></div>'+
      '<div class="service-choice" data-cloud-choice hidden><p>Before replacing either version, a safety copy is saved in this browser. Close other planner tabs and stop scanning before using the cloud version.</p><div class="service-actions"><button type="button" class="btn" data-use-local>Use this browser’s data</button><button type="button" class="btn" data-use-cloud>Use the account’s data</button></div></div>'+
      '<p>Cloud sync includes your profiles, collections, museum layouts, strategies, Council and scoring settings. Captured artwork, scanner logs and capture calibration stay on this device.</p>'+
      '<div class="service-actions"><button type="button" class="btn" data-download-recovery>Show safety backups</button></div><div data-recovery-list></div><p role="status" data-account-action-status></p>'+
      privacyMarkup('settings')+'<p data-privacy-contact></p><p data-retention></p><p data-analytics-id></p>'+
      '<details data-delete-options hidden><summary>Delete account or contributed research</summary><p>Account deletion removes cloud collections, settings and contributed research, and requests removal of account-linked analytics. Local planner data remains in this browser. Export a backup first. Sign in again with Discord before deleting an account.</p><div class="service-actions"><button type="button" class="btn" data-delete-research>Delete contributed research</button><button type="button" class="btn" data-delete-account>Delete account</button></div></details>';
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
      get('account-identity').textContent=user?'Signed in as '+user.displayName:'';
      get('signin').hidden=!cloud.configured();get('signin').textContent=user?'Sign in again with Discord':'Continue with Discord';
      get('auth-error').textContent=state.authError || '';get('auth-error').hidden=!state.authError;
      get('signed-in').hidden=!user;get('delete-options').hidden=!user;
      get('cloud-choice').hidden=!user || !['unlinked','remote','conflict','error'].includes(state.status);
      get('use-cloud').disabled=busy || !state.revision;
      for(const button of root.querySelectorAll('button:not([data-use-cloud]):not([data-save-consent]):not([data-reject-consent])'))button.disabled=busy;
      get('privacy-contact').textContent=config.privacyContact?'Privacy contact: '+config.privacyContact:'';
      get('retention').textContent=window.DNIntegrationCore.privacyReady(config)?'PostHog event analysis window: product events '+config.analyticsRetentionDays+' days; diagnostics '+config.diagnosticsRetentionDays+' days. This window is not a guaranteed deletion deadline. You can request deletion using the privacy contact.'+(window.DNIntegrationCore.researchReady(config)?' Contributed research is retained for '+config.researchRetentionDays+' days.':'')+' Recovery and operational backups have separate expiry arrangements.':'';
      const analyticsId=window.DNTelemetry.analyticsId();get('analytics-id').textContent=analyticsId?'Your analytics reference for export or deletion requests: '+analyticsId:'';
    }
    get('signin').addEventListener('click',()=>run(()=>cloud.signInWithDiscord()));
    get('sync').addEventListener('click',()=>run(()=>cloud.sync()));
    get('signout').addEventListener('click',()=>run(()=>cloud.signOut()));
    get('export-account').addEventListener('click',()=>run(async()=>download(await cloud.exportAccount(),'dominations-account')));
    get('download-recovery').addEventListener('click',()=>run(async()=>{
      const copies=await cloud.recovery();if(!copies.length)throw Error('No cloud replacement safety copies have been needed yet.');
      const list=get('recovery-list');list.textContent='Download a backup, then restore it through Back up / restore saved data above.';
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
