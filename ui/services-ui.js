/* Optional account/privacy controls. Existing game workflows remain independent.
 * Destructive replacements require an explicit choice after durable recovery. */
(() => {
  'use strict';
  const config=window.DNServiceConfig,cloud=window.DNCloud,consent=window.DNConsent;
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='services.css?v=20261025-slate';document.head.appendChild(sheet);
  const text={disabled:'Cloud sync unavailable.',
    'signed-out':'Not signed in.',unlinked:'Choose which data to use.',
    synced:'Saved to your account.',upload:'Waiting to sync.',remote:'Newer account data available.',
    conflict:'Conflicting changes. Choose which data to use.',
    pending:'Saved locally. Backup pending.',offline:'Saved locally. Backup pending.',error:'Saved locally. Cloud sync needs attention.'};
  function download(value,prefix) {
    const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    link.href=url;link.download=prefix+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const versions=document.createElement('dialog');
  versions.className='profile-delete-dialog service-panel service-version-dialog';versions.hidden=true;
  versions.dataset.cloudChoice='';versions.setAttribute('aria-labelledby','cloud-choice-title');
  versions.innerHTML='<h2 id="cloud-choice-title">Choose your saved data</h2><div data-version-table></div>'+
    '<p>Includes all planner settings. Both versions are saved before replacement. Stop scanning and close other planner tabs first.</p>'+
    '<div class="service-actions"><button type="button" class="btn" data-use-cloud>Use account data</button><button type="button" class="btn" data-use-local>Use browser data</button><button type="button" class="btn" data-cancel-choice>Cancel</button></div><p role="status" data-choice-progress></p><p role="alert" data-choice-error></p>';
  document.body.appendChild(versions);
  const versionField=name=>versions.querySelector('[data-'+name+']');
  let displayed=null,dismissed=null,choiceBusy=false,choiceTimer=null;
  const versionKey=value=>value?[value.owner,value.revision,value.localHash,value.remoteHash].join(':'):'';
  const needsChoice=state=>!!cloud.user() && !!state.comparison && ['unlinked','remote','conflict','error'].includes(state.status);
  function closeVersions(){if(versions.open)versions.close();versions.hidden=true;}
  function fillVersions(value) {
    displayed=value;
    const date=value=>value && Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'Not recorded';
    const esc=window.DN.esc;
    const count=value=>value==null?'Not recorded':value.toLocaleString();
    const rows=[['Artifacts','artifacts'],['Collection targets','targets'],['Profiles','profiles'],['Lifetime crafts logged','lifetimeCraftsLogged']].map(([label,key])=>
      '<tr><th scope="row">'+label+'</th><td>'+count(value.cloud[key])+'</td><td>'+count(value.local[key])+'</td></tr>').join('');
    versionField('version-table').innerHTML='<table><thead><tr><th></th><th scope="col">Account</th><th scope="col">This browser</th></tr></thead><tbody>'+rows+
      '<tr><th scope="row">Last synced</th><td>'+esc(date(value.cloud.updatedAt))+'</td><td>'+esc(date(value.local.updatedAt))+'</td></tr></tbody></table>';
    versionField('use-cloud').disabled=!value.revision;
  }
  function showVersions(force=false) {
    clearTimeout(choiceTimer);
    const state=cloud.state();
    if(!needsChoice(state) || choiceBusy)return;
    if(!force && dismissed===versionKey(state.comparison))return;
    if(versions.open){if(versionKey(displayed)!==versionKey(state.comparison))fillVersions(state.comparison);return;}
    if(document.hidden || document.querySelector('dialog[open]')){choiceTimer=setTimeout(()=>showVersions(force),500);return;}
    fillVersions(state.comparison);versionField('choice-error').textContent='';versions.hidden=false;versions.showModal();
  }
  function cancelVersions(){if(choiceBusy)return;dismissed=versionKey(cloud.state().comparison);closeVersions();}
  versions.addEventListener('cancel',event=>{event.preventDefault();cancelVersions();});
  versionField('cancel-choice').addEventListener('click',cancelVersions);
  for(const [name,choice] of [['use-local','local'],['use-cloud','cloud']])versionField(name).addEventListener('click',async()=>{
    if(choiceBusy)return;
    const expected=displayed;choiceBusy=true;versionField('choice-error').textContent='';
    versionField('choice-progress').textContent=choice==='cloud'?'Loading account data…':'Saving browser data…';
    for(const button of versions.querySelectorAll('button'))button.disabled=true;
    try{const result=await cloud.choose(choice,expected);dismissed=null;closeVersions();if(result.reload)location.reload();}
    catch(error){versionField('choice-error').textContent=error.message || 'Could not save. Both versions are unchanged.';if(cloud.state().comparison)fillVersions(cloud.state().comparison);}
    finally{choiceBusy=false;versionField('choice-progress').textContent='';for(const button of versions.querySelectorAll('button'))button.disabled=false;versionField('use-cloud').disabled=!displayed?.revision;}
  });
  cloud.subscribe(state=>{if(!needsChoice(state)){clearTimeout(choiceTimer);if(!choiceBusy)closeVersions();}else showVersions();});
  showVersions();
  function privacyMarkup(prefix) {
    const prompt=prefix==='banner';
    return '<fieldset class="service-preferences"><legend>Optional data sharing</legend>'+
      '<label><input type="checkbox" data-consent="analytics" id="'+prefix+'-analytics"><span><strong>Improve features</strong><small>Share which features you use.</small></span></label>'+
      '<label><input type="checkbox" data-consent="diagnostics" id="'+prefix+'-diagnostics"><span><strong>Improve scanner reliability</strong><small>Share errors and scan performance.</small></span></label>'+
      '<label><input type="checkbox" data-consent="ocrFeedback" id="'+prefix+'-ocr-feedback"><span><strong>Improve OCR matching</strong><small>OCR names and corrections ? Sign-in required</small></span></label>'+
      '<label><input type="checkbox" data-consent="research" id="'+prefix+'-research"><span><strong>Contribute crafting research</strong><small>Structured craft records. No images.</small></span></label>'+
      '</fieldset><p class="service-sharing-facts">No screenshots or full scan text.'+(prompt?' Sharing is optional.':'')+' <a href="privacy.html">Privacy details</a></p>'+
      (prompt?'<p class="service-sharing-settings">Change anytime in <a href="config.html#account-privacy">Profiles → Account & Privacy</a>.</p>':'')+
      '<div class="service-actions"><button type="button" class="btn'+(prompt?' profile-delete-confirm':'')+'" data-save-consent>'+(prompt?'Share selected data':'Save preferences')+'</button><button type="button" class="btn" data-reject-consent>'+(prompt?'No thanks':'Turn off sharing')+'</button></div><p class="service-privacy-status" role="status" aria-live="polite" aria-atomic="true" data-privacy-status></p><p data-ocr-status role="status" aria-live="polite"></p>';
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
    const drafts=new Map();
    function refresh(){
      const ready=window.DNIntegrationCore.privacyReady(config),researchReady=window.DNIntegrationCore.researchReady(config),value=consent.get();
      for(const input of inputs){
        const research=input.dataset.consent==='research';input.disabled=!ready || research && !researchReady;input.checked=!input.disabled && value[input.dataset.consent];
        if(research){input.closest('label').hidden=!researchReady;input.disabled=!researchReady || !cloud.user();}
        if(input.dataset.consent==='ocrFeedback'){const available=window.DNIntegrationCore.ocrFeedbackReady(config);input.disabled=!available || !cloud.user();input.checked=available && value.ocrFeedback;input.closest('label').hidden=!available;}
        if(drafts.has(input.dataset.consent))input.checked=drafts.get(input.dataset.consent);
      }
      const dirty=inputs.some(input=>!input.disabled && input.checked!==value[input.dataset.consent]);
      save.disabled=!ready || value.decided && !dirty;save.textContent=ready && value.decided && !dirty?'Saved':saveLabel;
      status.dataset.state=!ready?'unavailable':dirty?'unsaved':'saved';
      status.textContent=!ready?'Sharing is unavailable.':dirty?(prompt?'':'Unsaved changes.'):value.decided?privacySummary(value):'';
    }
    refresh();const unsubscribe=consent.subscribe(refresh);cloud.subscribe(refresh);
    const ocrStatus=root.querySelector('[data-ocr-status]');
    const renderOCR=()=>{if(ocrStatus){const value=window.DNOCRFeedback?.status();ocrStatus.textContent=value?.error || (value?.pending?'OCR feedback: '+value.pending+' pending.':'');if(value?.error && consent.get().ocrFeedback){save.disabled=false;save.textContent=saveLabel;}}};
    window.addEventListener('dn-ocr-feedback-status',renderOCR);
    for(const input of inputs)input.addEventListener('change',()=>{
      drafts.set(input.dataset.consent,input.checked);
      refresh();
    });
    async function persist(values) {
      try{
        const previous=consent.get();
        if(values.ocrFeedback && (!previous.ocrFeedback || !window.DNOCRFeedback.allowed())){if(!await window.DNOCRFeedback.setSharing(true))throw Error('Connect and save OCR preferences again.');}
        consent.set({...values,researchPolicy:'2026-10-23'});drafts.clear();refresh();if(values.research && !previous.research)window.DNResearch.setSharing(true).catch(error=>{status.textContent=error.message;});
        if(['analytics','diagnostics','research','ocrFeedback'].some(key=>values[key] && !previous[key]))showPrivacyNotice('Thank you for helping make the tool better for everyone.');
        else if(prompt && !document.getElementById('account-privacy'))showPrivacyNotice('Sharing preferences saved.');
      }
      catch{status.dataset.state='error';status.textContent='Preferences could not be saved. Your previously saved choices still apply. Reconnect and retry.';}
    }
    save.addEventListener('click',()=>persist(Object.fromEntries(inputs.map(input=>[input.dataset.consent,!input.disabled && input.checked]))));
    root.querySelector('[data-reject-consent]').addEventListener('click',()=>persist({}));
    return unsubscribe;
  }
  let banner;
  if(window.DNIntegrationCore.privacyReady(config) && config.posthogToken && !consent.get().decided) {
    banner=document.createElement('dialog');banner.className='profile-delete-dialog service-panel service-consent-banner';banner.setAttribute('aria-labelledby','sharing-title');banner.setAttribute('aria-describedby','sharing-request');
    banner.innerHTML='<h2 id="sharing-title">Optional sharing</h2><p id="sharing-request">Choose what to share. Change preferences in Profiles.</p>'+privacyMarkup('banner');
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
      '<div class="service-actions" data-cloud-review hidden><button type="button" class="btn" data-review-versions>Choose saved data</button></div>'+
      '<div class="service-actions"><button type="button" class="btn" data-download-recovery>Show safety backups</button></div><div data-recovery-list></div><p role="status" data-account-action-status></p>'+
      privacyMarkup('settings')+'<details data-privacy-details><summary>Data & privacy details</summary><p data-privacy-contact></p><p data-retention></p><p data-analytics-id></p></details>'+
      '<details data-delete-options hidden><summary>Delete data or account</summary><p>Deletes cloud collections, settings, research and OCR feedback. Analytics deletion is requested separately. Local data stays on this device. Export a backup first.</p><div class="service-actions"><button type="button" class="btn" data-delete-research>Delete contributed research</button><button type="button" class="btn" data-delete-ocr hidden>Delete OCR feedback</button><button type="button" class="btn" data-delete-account>Delete account</button></div></details>';
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
      get('delete-ocr').hidden=!window.DNIntegrationCore.ocrFeedbackReady(config);
      get('cloud-review').hidden=!needsChoice(state);
      for(const button of root.querySelectorAll('button:not([data-save-consent]):not([data-reject-consent])'))button.disabled=busy;
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
    get('review-versions').addEventListener('click',()=>showVersions(true));
    get('delete-research').addEventListener('click',()=>run(async()=>{if(!confirm('Delete this account’s contributed research? Collection data will remain.'))return;consent.set({...consent.get(),research:false});await window.DNResearch.clear();await cloud.deleteResearch();get('account-action-status').textContent='Contributed research deleted.';}));
    get('delete-account').addEventListener('click',()=>run(async()=>{if(!confirm('Permanently delete this cloud account and its contributed research? Export your data first. Local planner data will remain.'))return;const response=await cloud.deleteAccount();get('account-action-status').textContent=response.analyticsDeletionRequested?'Account deleted. Analytics deletion has been requested.':'Account deleted. Your local planner data remains available.';}));
    get('delete-ocr').addEventListener('click',()=>run(async()=>{
      if(!confirm('Delete this account’s OCR feedback?'))return;
      consent.set({...consent.get(),ocrFeedback:false});await window.DNOCRFeedback.remove();get('account-action-status').textContent='OCR feedback deleted.';
    }));
    cloud.subscribe(refresh);consent.subscribe(refresh);refresh();
    if(location.hash==='#account-privacy')root.scrollIntoView({block:'start'});
  }
})();
