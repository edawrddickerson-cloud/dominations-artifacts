/* Consent boundaries, privacy and active-time measurement with a controlled clock. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
let clock=1_000_000,nextTimer=0;const values=new Map(),timers=new Map(),intervals=[],sent=[],events={},documentEvents={};
class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
const storage={get length(){return values.size;},key:index=>[...values.keys()][index],getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
const context={window:{DNServiceConfig:{privacyReady:true,privacyContact:'privacy@example.invalid',posthogToken:'phc_test',posthogHost:'https://eu.i.posthog.com',build:'test',environment:'test',diagnosticsSampleRate:1},addEventListener:(name,fn)=>events[name]=fn},
  document:{hidden:false,addEventListener:(name,fn)=>documentEvents[name]=fn},location:{pathname:'/ui/scanner.html',origin:'https://planner.example'},navigator:{onLine:true,userAgent:'Chrome/123'},innerWidth:1000,
  localStorage:storage,crypto,Date:Clock,TextEncoder,URL,AbortController,Error,console,
  setTimeout:(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;},clearTimeout:id=>timers.delete(id),setInterval:fn=>intervals.push(fn),
  fetch:async(url,options)=>{sent.push({url,payload:JSON.parse(options.body),options});return {};}};
vm.createContext(context);vm.runInContext(fs.readFileSync('ui/integration-core.js','utf8'),context);vm.runInContext(fs.readFileSync('ui/consent.js','utf8'),context);vm.runInContext(fs.readFileSync('ui/telemetry.js','utf8'),context);
// Consent remains functional before analytics, including after a failed download.
const isolatedValues=new Map([['dn_telemetry_id','old'],['dn_telemetry_session','old']]);
const isolated={window:{DNIntegrationCore:context.window.DNIntegrationCore,DNServiceConfig:context.window.DNServiceConfig,addEventListener(){}},
  localStorage:{getItem:key=>isolatedValues.get(key)??null,setItem:(key,value)=>isolatedValues.set(key,value),removeItem:key=>isolatedValues.delete(key)}};
vm.runInNewContext(fs.readFileSync('ui/consent.js','utf8'),isolated);isolated.window.DNConsent.set({});
assert.equal(isolatedValues.has('dn_telemetry_id'),false,'revocation clears identifiers without telemetry');
assert.equal(isolatedValues.has('dn_telemetry_session'),false,'revocation clears sessions without telemetry');
const {DNConsent:consent,DNTelemetry:telemetry}=context.window;
async function flush(){for(const [id,timer] of [...timers])if(timer.delay===0){timers.delete(id);timer.fn();}await Promise.resolve();await Promise.resolve();await Promise.resolve();}
(async()=>{
  assert.equal(telemetry.event('artifact_saved',{count:1}),false);await flush();assert.equal(sent.length,0);assert.equal(values.size,0,'no optional identifier is created before consent');
  let successfulScans=0;
  telemetry.onSuccessfulScan(()=>successfulScans++);
  telemetry.scannerResult({valid:false},{source:'crafting',encounterId:'incomplete'});
  assert.equal(successfulScans,0,'incomplete scans cannot trigger the sharing prompt');
  telemetry.scannerResult({valid:true},{source:'crafting',encounterId:'first'});
  telemetry.scannerResult({valid:true},{source:'crafting',encounterId:'second'});
  assert.equal(successfulScans,1,'the sharing prompt triggers only once');
  await flush();assert.equal(sent.length,0);assert.equal(values.size,0,'local prompt timing creates no telemetry or persistent scan data before consent');
  consent.set({analytics:true});await flush();sent.length=0;
  clock+=14000;telemetry.event('artifact_saved',{source:'crafting',action:'added',count:1,email:'private@example.invalid',image:'data:image/png;base64,YQ=='},true);await flush();
  clock+=1000;intervals[0]();await flush();
  assert.equal(sent.find(entry=>entry.payload.event==='active_time_recorded').payload.properties.seconds,1,'time before the first meaningful action is not counted');
  assert.equal(JSON.stringify(sent).includes('private@example.invalid'),false);assert.equal(JSON.stringify(sent).includes('data:image'),false);
  assert(sent.every(entry=>entry.options.credentials==='omit' && entry.options.referrerPolicy==='no-referrer'));
  context.document.hidden=true;documentEvents.visibilitychange();clock+=15000;const beforeHidden=sent.length;intervals[0]();await flush();assert.equal(sent.length,beforeHidden,'hidden time is excluded');
  context.document.hidden=false;documentEvents.visibilitychange();
  consent.set({diagnostics:true});await flush();sent.length=0;
  assert.equal(telemetry.event('artifact_saved',{count:1}),false);
  telemetry.event('capture_failed',{reason:'NotAllowedError'});await flush();assert.equal(sent.length,1);assert.equal(sent[0].payload.properties.identity_kind,'diagnostic-session');
  const error=new Error('private@example.invalid secret-token');error.stack='Error: private@example.invalid secret-token\n at fn (https://planner.example/ui/scanner.js?token=secret-token:10:2)';
  telemetry.exception(error,'scanner-read-failed');await flush();assert.equal(sent.at(-1).payload.event,'$exception');assert.equal(JSON.stringify(sent.at(-1)).includes('secret-token'),false);
  telemetry.event('capture_failed',{reason:'other'});consent.set({});await flush();assert.equal(sent.length,2,'withdrawal cancels events waiting to send');
  assert.equal(values.has('dn_telemetry_id'),false);assert.equal(values.has('dn_telemetry_session'),false);
  context.window.DNServiceConfig.researchEnabled=false;
  assert.throws(()=>consent.set({research:true}),/Research sharing is not available/);
  consent.set({analytics:true,diagnostics:true});await flush();
  values.delete('dn_telemetry_id');values.delete('dn_telemetry_session');context.window.DNServiceConfig.privacyReady=false;
  assert.equal(telemetry.analyticsId(),null,'disabled collection cannot create an optional identity');
  telemetry.scannerStage({stage:'read-start',time:1,session:'test',itemId:1,request:1,source:'crafting'});
  assert.equal(values.has('dn_telemetry_id'),false);assert.equal(values.has('dn_telemetry_session'),false,'disabled diagnostics cannot create a session');
  console.log('Telemetry: no pre-consent identifiers/requests, redaction, purpose separation, accurate active duration, hidden-time exclusion, sanitized exceptions and withdrawal cancellation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
