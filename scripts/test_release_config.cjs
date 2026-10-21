/* Executes the real release config and telemetry at production/local/preview
 * origins. All storage and transport are disposable; no external requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
async function checkOrigin(origin,environment,accounts){
  const values=new Map(),sent=[];
  const storage={get length(){return values.size;},key:index=>[...values.keys()][index],getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const context={window:{addEventListener(){}},location:new URL('/config.html',origin),localStorage:storage,document:{hidden:false,addEventListener(){}},navigator:{onLine:true,userAgent:'Chrome/123'},innerWidth:1440,crypto,URL,AbortController,TextEncoder,Date,setTimeout,clearTimeout,setInterval:()=>0,fetch:async(_url,options)=>{sent.push(JSON.parse(options.body));return {};}};
  vm.createContext(context);
  for(const name of ['service-config','integration-core','telemetry'])vm.runInContext(fs.readFileSync('ui/'+name+'.js','utf8'),context);
  const {DNServiceConfig:config,DNIntegrationCore:core,DNConsent:consent,DNTelemetry:telemetry}=context.window;
  assert.equal(config.environment,environment);
  assert.equal(core.cloudReady(config,origin),accounts);
  assert.equal(config.researchEnabled,false);
  assert.equal(consent.get().analytics,false);
  assert.equal(consent.get().diagnostics,false);
  assert.equal(telemetry.event('feature_used',{feature:'collection'},true),false);
  assert.equal(sent.length,0);
  assert.equal(values.has('dn_telemetry_id'),false);
  consent.set({analytics:true});
  telemetry.event('feature_used',{feature:'collection'},true);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(sent.length,2);
  assert(sent.every(event=>event.properties.environment===environment && event.properties.app_build===config.build));
  assert.throws(()=>consent.set({research:true}),/not available/);
  consent.set({});
  const before=sent.length;assert.equal(telemetry.event('feature_used',{feature:'collection'},true),false);
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(sent.length,before);
}
(async()=>{
  await checkOrigin('https://dominations-artifacts.pages.dev','production',true);
  await checkOrigin('http://127.0.0.1:8765','development',true);
  await checkOrigin('http://localhost:8765','development',false);
  await checkOrigin('https://preview.dominations-artifacts.pages.dev','development',false);
  const config=fs.readFileSync('ui/service-config.js','utf8');assert(!/sb_secret_|phx_/.test(config));
  console.log('Release config passed: production accounts/events, local/preview separation, default-off sharing, withdrawal and disabled research.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
