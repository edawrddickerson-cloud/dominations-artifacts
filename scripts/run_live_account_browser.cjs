/* Live, read-only account recovery through an isolated Chrome context.
 * The operator approves an existing session in their normal browser, or signs
 * in once in the test browser. User data writes and account deletion are blocked
 * at the network boundary. No personal browser files or credentials are read;
 * the short-lived token is never logged or saved by the harness.
 * Uses Chrome DevTools Protocol, the same browser control as existing fixtures. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {spawn}=require('node:child_process');
const {createBridge}=require('./local_test_session.cjs');
const root=path.resolve(__dirname,'..'),origin='http://127.0.0.1:8765';
const reportFile=path.join(root,process.argv.includes('--control-smoke-test')?'data/temp/backend-control-browser.json':'data/temp/backend-live-browser.json');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const checks={},contexts=[],connections=[];
const borrowedSession=process.argv.includes('--use-existing-session');
const controlSmoke=process.argv.includes('--control-smoke-test');
const headless=borrowedSession || process.argv.includes('--headless');
let browser,chrome,bridge,activePage,step='startup',blockedWrites=0,telemetryRequests=0,diagnostics,remoteSessionRevocationTested=false;
const dialogs=[];
const testTelemetry=[],testTelemetryResponses=[];
function save(status){fs.writeFileSync(reportFile,JSON.stringify({status,checks,blockedUserDataWrites:blockedWrites,liveSupabase:!controlSmoke,accountDataWritesAllowed:false,usesExistingSession:borrowedSession,remoteSessionRevocationTested,...(diagnostics?{diagnostics}:{}),checkedAt:new Date().toISOString()},null,2));}
function check(name,value){step=name;checks[name]=!!value;save(value?'running':'failed');if(!value)throw Error(name);console.log('PASS: '+name);}
function cdp(url){return new Promise((resolve,reject)=>{
  const socket=new WebSocket(url),pending=new Map(),listeners=[];let id=0;
  socket.addEventListener('close',()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Browser connection closed'));}pending.clear();});
  socket.addEventListener('error',()=>reject(Error('Browser connection failed')));
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.method)for(const fn of listeners)fn(msg);const request=pending.get(msg.id);if(!request)return;pending.delete(msg.id);clearTimeout(request.timer);msg.error?request.reject(Error('Browser command failed')):request.resolve(msg.result);});
  socket.addEventListener('open',()=>resolve({on(fn){listeners.push(fn);},close(){socket.close();},send(method,params={}){return new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('Browser command timed out: '+method));},25000);pending.set(key,{resolve,reject,timer});socket.send(JSON.stringify({id:key,method,params}));});}}));
});}
async function evaluate(page,expression){const result=await page.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails){const known=/Error: (Control unavailable|Control covered)/.exec(result.exceptionDetails.exception?.description || '');throw Error(known?.[1] || 'Page action failed');}return result.result?.value;}
async function waitFor(page,expression,timeout=45000){const until=Date.now()+timeout;while(Date.now()<until){try{if(await evaluate(page,expression))return;}catch{}await delay(300);}throw Error('Timed out waiting for '+step);}
async function click(page,selector){step='click '+selector;await evaluate(page,`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node || node.disabled || node.offsetParent===null)throw Error('Control unavailable');node.scrollIntoView({block:'center',behavior:'instant'});})()`);await delay(100);const point=await evaluate(page,`(()=>{const node=document.querySelector(${JSON.stringify(selector)});for(const r of node.getClientRects()){const x=r.x+r.width/2,y=r.y+r.height/2;if(r.width && r.height && node.contains(document.elementFromPoint(x,y)))return {x,y};}throw Error('Control covered');})()`);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...point,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});}
async function reloadPrivacy(page){
  await evaluate(page,'window.__consentReloadMarker=true');await page.send('Page.reload',{ignoreCache:false});
  await waitFor(page,"!window.__consentReloadMarker && !!window.DNConsent && !!document.querySelector('#account-privacy [data-save-consent]') && document.readyState==='complete'");
}
async function pageInContext(seed,dismissConsent=true){
  const {browserContextId}=await browser.send('Target.createBrowserContext',{disposeOnDetach:true});contexts.push(browserContextId);
  await browser.send('Browser.setDownloadBehavior',{behavior:'deny',browserContextId});
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId,newWindow:true,width:1440,height:1000});
  const targets=await (await fetch(browser.endpoint+'/json')).json();
  const target=targets.find(target=>target.id===targetId);if(!target)throw Error('Test tab unavailable');
  const page=await cdp(target.webSocketDebuggerUrl);connections.push(page);
  page.on(message=>{
    if(message.method==='Network.requestWillBeSent' && /^https:\/\/(eu|us)\.i\.posthog\.com\//.test(message.params.request.url)){
      telemetryRequests++;
      try{const data=JSON.parse(message.params.request.postData);testTelemetry.push({event:data.event,localBrowser:data.properties.distinct_id.startsWith('a:'),personProfile:data.properties.$process_person_profile});}catch{}
    }
    if(message.method==='Network.responseReceived' && /^https:\/\/(eu|us)\.i\.posthog\.com\//.test(message.params.response.url))testTelemetryResponses.push(message.params.response.status);
    if(message.method==='Page.javascriptDialogOpening'){dialogs.push(message.params.type);page.send('Page.handleJavaScriptDialog',{accept:message.params.type==='confirm'}).catch(()=>{});}
    if(message.method==='Fetch.requestPaused'){
      const {requestId,request}=message.params;const url=new URL(request.url);
      if(borrowedSession && (url.pathname==='/auth/v1/logout' || url.pathname==='/auth/v1/token')){
        const logout=url.pathname.endsWith('/logout');
        page.send('Fetch.fulfillRequest',{requestId,responseCode:logout?204:401,responseHeaders:[{name:'Access-Control-Allow-Origin',value:origin},{name:'Content-Type',value:'application/json'}],...(logout?{}:{body:Buffer.from('{"error":"Read-only test session cannot refresh"}').toString('base64')})}).catch(()=>{});return;
      }
      const permitted=request.method==='OPTIONS' || request.method==='GET' || /^\/rest\/v1\/rpc\/planner_(read_workspace|export_account)$/.test(url.pathname);
      const blocked=!permitted && (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/functions/v1/'));
      if(blocked){blockedWrites++;page.send('Fetch.fulfillRequest',{requestId,responseCode:403,responseHeaders:[{name:'Access-Control-Allow-Origin',value:origin},{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({code:'42501',message:'Read-only automation guard'})).toString('base64')}).catch(()=>{});}
      else page.send('Fetch.continueRequest',{requestId}).catch(()=>{});
    }
  });
  await page.send('Page.enable');await page.send('Runtime.enable');await page.send('Network.enable');await page.send('Fetch.enable',{patterns:[{urlPattern:'*://*.supabase.co/*',requestStage:'Request'}]});
  let seedId;
  if(seed)({identifier:seedId}=await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.origin===${JSON.stringify(origin)})for(const [key,value] of ${JSON.stringify(seed)})localStorage.setItem(key,value);`}));
  await page.send('Page.navigate',{url:origin+'/config.html#account-privacy'});
  await waitFor(page,"!!window.DNCloud && !!document.querySelector('[data-signin]')");
  await evaluate(page,"document.title='DomiNations account test';document.querySelector('[data-signin]').scrollIntoView({block:'center'});");
  try{const {windowId}=await browser.send('Browser.getWindowForTarget',{targetId});await browser.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});}catch{}
  await browser.send('Target.activateTarget',{targetId});await page.send('Page.bringToFront');
  if(seedId)await page.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:seedId});
  activePage=page;
  if(dismissConsent && await evaluate(page,"!!document.querySelector('.service-consent-banner [data-reject-consent]')")){
    await click(page,'.service-consent-banner [data-reject-consent]');
    await waitFor(page,"!document.querySelector('.service-consent-banner')");
  }
  return page;
}
async function recover(page){
  await waitFor(page,"!!DNCloud.user()");
  await evaluate(page,'DNCloud.sync()');
  // setOwner publishes 'unlinked' before the first cloud read has completed.
  // A concurrent inspect returns that provisional state rather than waiting.
  await waitFor(page,"DNCloud.state().status==='synced' || ['unlinked','remote','conflict'].includes(DNCloud.state().status) && DNCloud.state().revision>0 && !document.querySelector('[data-use-cloud]').disabled || DNCloud.state().status==='offline'");
  if(await evaluate(page,"DNCloud.state().status==='synced'"))return;
  check('fresh test browser needs an explicit cloud adoption',await evaluate(page,"DNCloud.state().status==='unlinked' && !document.querySelector('[data-cloud-choice]').hidden"));
  await click(page,'[data-use-cloud]');
  await waitFor(page,"!!window.DNCloud && DNCloud.state().status==='synced'");
}
async function main(){
  fs.mkdirSync(path.dirname(reportFile),{recursive:true});save('starting');
  let seed;
  if(borrowedSession){
    const configContext={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'),configContext);
    bridge=await createBridge({root,supabaseUrl:configContext.window.DNServiceConfig.supabaseUrl,origin});
    step='approval in the normal browser';save('waiting-for-local-session-approval');
    console.log('LOCAL HAND-OFF READY: '+bridge.url);
    spawn('powershell.exe',['-NoProfile','-Command',"Start-Process -FilePath '"+bridge.url.replace(/'/g,"''")+"'"],{windowsHide:true,stdio:'ignore'});
    seed=await bridge.session;await bridge.close();bridge=null;
  }
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dn-live-account-check-'));
  chrome=spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[...(headless?['--headless=new','--disable-gpu']:[]),'--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{windowsHide:headless,stdio:'ignore'});
  let port;for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await delay(100);}}
  if(!port)throw Error('Isolated Chrome did not start');
  const endpoint='http://127.0.0.1:'+port,version=await (await fetch(endpoint+'/json/version')).json();
  browser=await cdp(version.webSocketDebuggerUrl);browser.endpoint=endpoint;
  const first=await pageInContext(seed);if(seed)seed.length=0;
  if(controlSmoke){
    check('the actual privacy controls default to no optional sharing',await evaluate(first,"DNConsent.get().decided && !DNConsent.get().analytics && !DNConsent.get().diagnostics && !DNConsent.get().research"));
    check('analytics choices are available while research remains disabled',await evaluate(first,"!document.querySelector('[data-consent=analytics]').disabled && !document.querySelector('[data-consent=diagnostics]').disabled && document.querySelector('[data-consent=research]').disabled && document.querySelector('[data-consent=research]').closest('label').hidden"));
    check('rejecting optional sharing sends no PostHog requests',telemetryRequests===0);
    await evaluate(first,"(()=>{const b=document.createElement('button');b.dataset.controlTest='';b.textContent='Test confirmation';b.onclick=()=>{if(confirm('Read-only automation control test'))document.body.dataset.controlPassed='yes';};document.body.appendChild(b);})()");
    await click(first,'[data-control-test]');await waitFor(first,"document.body.dataset.controlPassed==='yes'",5000);
    check('browser pointer input and confirmation remain responsive',true);
    if(process.argv.includes('--analytics-roundtrip')){
      check('analytics check has no real account identity',await evaluate(first,'!DNCloud.user()'));
      await click(first,'[data-consent=analytics]');
      check('changing a checkbox shows an unsaved draft without enabling collection',await evaluate(first,"!DNConsent.get().analytics && document.querySelector('[data-privacy-status]').dataset.state==='unsaved' && !document.querySelector('[data-save-consent]').disabled"));
      await click(first,'[data-save-consent]');
      check('Save preferences visibly confirms the actual saved choices',await evaluate(first,"document.querySelector('[data-save-consent]').textContent==='Saved' && document.querySelector('[data-save-consent]').disabled && document.querySelector('[data-privacy-status]').textContent.includes('Preferences saved.') && JSON.parse(localStorage.getItem('dn_service_consent')).analytics"));
      await evaluate(first,"DNTelemetry.event('feature_used',{feature:'config'},true)");
      const until=Date.now()+15000;while(testTelemetryResponses.length<2 && Date.now()<until)await delay(200);
      check('real browser opt-in delivers consented events to PostHog',testTelemetryResponses.length>=2 && testTelemetryResponses.every(status=>status>=200 && status<300) && testTelemetry.length>=2 && testTelemetry.every(event=>event.localBrowser && !event.personProfile));
      await reloadPrivacy(first);
      check('a real reload retains the saved choice and confirmation',await evaluate(first,"DNConsent.get().analytics && !DNConsent.get().diagnostics && document.querySelector('[data-consent=analytics]').checked && !document.querySelector('[data-consent=diagnostics]').checked && document.querySelector('[data-save-consent]').textContent==='Saved' && !document.querySelector('.service-consent-banner')"));
      await click(first,'[data-reject-consent]');const before=telemetryRequests;
      check('withdrawal blocks subsequent browser capture',await evaluate(first,"!DNConsent.get().analytics && DNTelemetry.event('feature_used',{feature:'config'},true)===false"));
      await delay(300);check('withdrawal sends no further PostHog requests',telemetryRequests===before);
      await reloadPrivacy(first);
      check('withdrawal remains saved after reload with visible off confirmation',await evaluate(first,"!DNConsent.get().analytics && !DNConsent.get().diagnostics && !document.querySelector('[data-consent=analytics]').checked && document.querySelector('[data-privacy-status]').textContent.includes('Preferences saved.')"));
    }
    const bannerPage=await pageInContext(null,false);
    await evaluate(bannerPage,"DNTelemetry.scannerResult({valid:true},{source:'crafting',encounterId:'sharing-prompt'})");
    await waitFor(bannerPage,"document.querySelector('.service-consent-banner')?.open");
    await click(bannerPage,'.service-consent-banner [data-consent=diagnostics]');
    await click(bannerPage,'.service-consent-banner [data-save-consent]');
    check('saving from the first-visit banner leaves visible confirmation in Account and privacy',await evaluate(bannerPage,"!document.querySelector('.service-consent-banner') && document.querySelector('#account-privacy [data-privacy-status]').textContent.includes('saved') && DNConsent.get().diagnostics"));
    await reloadPrivacy(bannerPage);
    check('a banner choice survives reload without enabling the other purpose',await evaluate(bannerPage,"DNConsent.get().diagnostics && !DNConsent.get().analytics && document.querySelector('[data-consent=diagnostics]').checked && document.querySelector('[data-save-consent]').textContent==='Saved'"));
    const featurePage=await pageInContext(null,false);
    await featurePage.send('Page.navigate',{url:origin+'/army.html'});
    await waitFor(featurePage,"!!window.DNTelemetry && !document.getElementById('account-privacy')");
    await evaluate(featurePage,"DNTelemetry.scannerResult({valid:true},{source:'crafting',encounterId:'sharing-prompt'})");
    await waitFor(featurePage,"document.querySelector('.service-consent-banner')?.open");
    await click(featurePage,'.service-consent-banner [data-consent=diagnostics]');
    await click(featurePage,'.service-consent-banner [data-save-consent]');
    check('saving a banner on a feature page leaves a visible confirmation and preferences link',await evaluate(featurePage,"!document.querySelector('.service-consent-banner') && document.querySelector('.service-consent-notice').textContent.includes('Thank you for helping make the tool better for everyone.') && document.querySelector('.service-consent-notice a').getAttribute('href')==='config.html#account-privacy' && document.querySelector('.service-consent-notice').getBoundingClientRect().bottom<=innerHeight"));
    await click(featurePage,'.service-consent-notice a');
    await waitFor(featurePage,"!!window.DNConsent && !!document.querySelector('#account-privacy [data-save-consent]')");
    check('the confirmation link opens the persisted choices in Account and privacy',await evaluate(featurePage,"DNConsent.get().diagnostics && !DNConsent.get().analytics && document.querySelector('[data-consent=diagnostics]').checked && document.querySelector('[data-save-consent]').textContent==='Saved'"));
    save('control-smoke-passed');return;
  }
  step='Discord sign-in';save(borrowedSession?'running':'waiting-for-discord-sign-in');
  console.log(borrowedSession?'RUNNING: Existing login connected; no additional Discord login is needed.':'TEST WINDOW READY: Sign in with Discord once in the isolated Chrome window. The remaining checks run automatically.');
  await waitFor(first,"location.origin==='http://127.0.0.1:8765' && !!window.DNCloud?.user()",30*60*1000);
  check(borrowedSession?'existing login initializes the isolated read-only browser':'Discord sign-in completes in the isolated browser',true);
  check('fresh browser has no existing local collection',await evaluate(first,"DNCloud.capture().then(data=>data.records.every(record=>record.items.length===0))"));
  const baseline=await evaluate(first,"(async()=>{const row=await DNCloud.rpc('planner_read_workspace');if(!row)return null;return {hash:await DNIntegrationCore.fingerprint(row.data),revision:row.revision};})()");
  check('live Supabase contains the saved workspace',!!baseline);
  await recover(first);
  check('existing cloud workspace restores into an empty browser',await evaluate(first,`DNCloud.capture().then(async data=>(await DNIntegrationCore.fingerprint(data))===${JSON.stringify(baseline.hash)})`));
  check('choice buttons disappear once synced',await evaluate(first,"document.querySelector('[data-cloud-choice]').hidden"));
  check('an importable safety backup exists',await evaluate(first,"DNCloud.recovery().then(copies=>copies.length>0 && copies[0].local.kind==='dominations-planner-backup')"));
  await first.send('Page.reload',{ignoreCache:true});step='reload after recovery';await waitFor(first,"!!window.DNCloud && DNCloud.state().status==='synced'");
  check('saved state survives a real page reload',await evaluate(first,`DNCloud.capture().then(async data=>(await DNIntegrationCore.fingerprint(data))===${JSON.stringify(baseline.hash)})`));
  // Keep the new test session in memory only to seed another isolated browser.
  const auth=await evaluate(first,"Object.entries(localStorage).filter(([key])=>/^sb-.*-auth-token$/.test(key))");
  check('the controlled test session is available for a second isolated browser',auth.length===1);
  const second=await pageInContext(auth);auth.length=0;
  check('second isolated browser starts without the first browser collection',await evaluate(second,"DNCloud.capture().then(data=>data.records.every(record=>record.items.length===0))"));
  await recover(second);
  check('second isolated browser recovers the same cloud workspace',await evaluate(second,`DNCloud.capture().then(async data=>(await DNIntegrationCore.fingerprint(data))===${JSON.stringify(baseline.hash)})`));
  // Observe the actual downloaded Blob in memory; downloads are denied above.
  await evaluate(second,"window.__exportChecks={};const original=URL.createObjectURL.bind(URL);URL.createObjectURL=function(blob){blob.text().then(text=>{try{const data=JSON.parse(text);window.__exportChecks[data.kind]={valid:true,hasWorkspace:!!data.data?.workspace};}catch{}});return original(blob);};");
  await click(second,'[data-export-account]');step='account export';await waitFor(second,"!!window.__exportChecks['dominations-account-export']");
  check('account export works through the real UI and Supabase RPC',await evaluate(second,"window.__exportChecks['dominations-account-export'].hasWorkspace"));
  await evaluate(second,"document.querySelector('[data-local-backup]').open=true");await click(second,'[data-backup-export]');step='local backup export';await waitFor(second,"!!window.__exportChecks['dominations-planner-backup']");
  check('local JSON backup works through the real UI',true);
  check('live workspace data and revision remain unchanged',await evaluate(second,`DNCloud.rpc('planner_read_workspace').then(async row=>row.revision===${JSON.stringify(baseline.revision)} && (await DNIntegrationCore.fingerprint(row.data))===${JSON.stringify(baseline.hash)})`));
  await click(second,'[data-signout]');step='sign out';await waitFor(second,"!DNCloud.user() && DNCloud.state().status==='signed-out'");
  remoteSessionRevocationTested=!borrowedSession;
  check('sign-out keeps the recovered local data',await evaluate(second,`DNCloud.capture().then(async data=>(await DNIntegrationCore.fingerprint(data))===${JSON.stringify(baseline.hash)})`));
  check('optional sharing stays disabled throughout',telemetryRequests===0 && await evaluate(second,"!DNConsent.get().analytics && !DNConsent.get().diagnostics && !DNConsent.get().research"));
  save('passed');console.log('Live browser checks passed. No collection/settings writes or account deletion were allowed.');
}
main().catch(async(error)=>{try{diagnostics=await evaluate(activePage,"({cloudStatus:window.DNCloud?.state().status,actionStatus:document.querySelector('[data-account-action-status]')?.textContent?.slice(0,200),cloudError:window.DNCloud?.state().error,ready:document.readyState})");}catch{diagnostics={pageUnavailable:true};}diagnostics.dialogs=dialogs;diagnostics.failure=error.message;save('failed');console.error('Live browser check failed at: '+step+'. '+JSON.stringify(diagnostics)+'. No credentials or response bodies were printed.');process.exitCode=1;}).finally(async()=>{
  await bridge?.close();
  for(const id of contexts)try{await browser?.send('Target.disposeBrowserContext',{browserContextId:id});}catch{}
  for(const page of connections)page.close();try{await browser?.send('Browser.close');}catch{}browser?.close();chrome?.kill();
});
