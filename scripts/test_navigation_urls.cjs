/* URL routing works on clean-URL hosts and explicit-HTML static previews. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('ui/navigation.js','utf8'),scannerEntry=fs.readFileSync('ui/scanner-session-entry.js','utf8');
function fixture(href,{saved,oauth=false,storageDisabled=false,embedded=false}={},script=source) {
  const redirects=[],listeners={},stored=new Map(saved?[['dn-last-page',saved]]:[]);
  const location=new URL(href);location.replace=url=>redirects.push(new URL(url));
  const window={addEventListener(){}};window.top=embedded?{}:window;window.parent=window.top;
  if(oauth){window.DNOAuthReturn={code:'in-memory-only'};window.DNServicesReady=Promise.resolve();window.DNCloud={start:async()=>{},user:()=>({id:'test'})};}
  const context={URL,location,window,document:{addEventListener:(event,fn)=>listeners[event]=fn},localStorage:{getItem:key=>{if(storageDisabled)throw Error('disabled');return stored.get(key);},setItem:(key,value)=>stored.set(key,value)}};
  vm.runInNewContext(script,context);return {redirects,listeners,stored};
}
(async()=>{
  for(const [href,expected] of [
    ['https://planner.example/','/ratings'],
    ['https://planner.example/ui/','/ui/ratings'],
    ['https://planner.example/ui/index','/ui/ratings'],
    ['https://static.example/ui/index.html','/ui/ratings.html'],
    ['http://127.0.0.1:8765/ui/','/ui/ratings.html'],
    ['http://localhost:8765/ui/','/ui/ratings.html'],
    ['http://[::1]:8765/ui/','/ui/ratings.html'],
    ['file:///C:/planner/ui/index.html','/C:/planner/ui/ratings.html'],
  ]) {
    const {redirects}=fixture(href+'?view=main#target');assert.equal(redirects.length,1);
    assert.equal(redirects[0].pathname,expected);assert.equal(redirects[0].search,'?view=main');assert.equal(redirects[0].hash,'#target');
  }
  for(const saved of ['scanner.html','storage-scanner.html']) {
    const destination=fixture('https://planner.example/ui/?view=live#capture',{saved}).redirects[0];
    assert.equal(destination.pathname,'/ui/'+saved.slice(0,-5));assert.equal(destination.searchParams.get('v'),'2');assert.equal(destination.searchParams.get('view'),'live');assert.equal(destination.hash,'#capture');
  }
  for(const options of [{saved:'https://outside.example/'},{saved:'../privacy.html'},{saved:'army.html'},{storageDisabled:true}])assert.equal(fixture('https://planner.example/ui/',options).redirects[0].pathname,'/ui/ratings');
  for(const [href,expected] of [
    ['https://planner.example/ui/config?view=accounts#account-privacy','/ui/scanner-session'],
    ['http://127.0.0.1:8765/ui/config.html?view=accounts#account-privacy','/ui/scanner-session.html'],
    ['file:///C:/planner/ui/config.html?view=accounts#account-privacy','/C:/planner/ui/scanner-session.html'],
  ]) {
    const destination=fixture(href).redirects[0];assert.equal(destination.pathname,expected);
    const original=new URL(href);assert.equal(destination.searchParams.get('page'),original.pathname+original.search+original.hash);
  }
  const callback=fixture('https://planner.example/ui/config#account-privacy',{oauth:true});
  assert.equal(callback.redirects.length,0);await callback.listeners.DOMContentLoaded();
  assert.equal(callback.redirects[0].pathname,'/ui/scanner-session');assert.equal(callback.redirects[0].searchParams.get('page'),'/ui/config#account-privacy');
  for(const [href,expected] of [
    ['https://planner.example/ui/scanner?v=2#capture','/ui/scanner-session'],
    ['http://127.0.0.1:8765/ui/storage-scanner?v=2#capture','/ui/scanner-session'],
    ['http://127.0.0.1:8765/ui/scanner.html?v=2#capture','/ui/scanner-session.html'],
  ]) {
    const destination=fixture(href,{},scannerEntry).redirects[0];assert.equal(destination.pathname,expected);
    const original=new URL(href);assert.equal(destination.searchParams.get('page'),original.pathname+original.search+original.hash);
    assert.equal(fixture(href,{embedded:true},scannerEntry).redirects.length,0);
  }
  console.log('Navigation URLs: canonical/static/file entries, remembered allowlist, scanner handoff, query/hash preservation and deferred OAuth shell passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
