/* Exercise deployed bytes with a real HTTP cache, optional loader, shell routes
 * and local Tesseract. No accounts, capture permissions or external writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process'),{buildSite}=require('./build_site.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'data/temp/site-build-browser');
const manifest=buildSite({output:out}),hits=[],errors=[],missing=[],pending=new Map();let chrome,ws,sequence=0,delayedTelemetry=false;
const cleanURLs=process.argv.includes('--clean-urls');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');let pathname=url.pathname==='/'?'/index.html':url.pathname;
  if(cleanURLs&&url.pathname.endsWith('.html')){res.writeHead(307,{Location:url.pathname.replace(/\.html$/,'')+url.search}).end();return;}
  if(!path.extname(pathname))pathname+='.html';
  const file=path.resolve(out,'.'+decodeURIComponent(pathname));hits.push(pathname);
  if(!file.startsWith(out+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(error,bytes)=>{
    if(error){missing.push(pathname);res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.csv':'text/csv','.jpg':'image/jpeg','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control',pathname.startsWith('/static/')?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate');
    if(!delayedTelemetry&&pathname.endsWith('/telemetry.js')){delayedTelemetry=true;setTimeout(()=>res.end(bytes),5000);}else res.end(bytes);
  });
});
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
async function wait(expression){for(let n=0;n<200;n++){if(await evaluate(expression))return;await delay(100);}throw Error('Readiness timeout: '+expression);}
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const profile=fs.mkdtempSync(path.join(root,'data/temp/site-browser-profile-'));
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  try{
    let port;for(let n=0;n<100;n++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await delay(100);}}
    if(!port)throw Error('Chrome did not start');
    const target=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(item=>item.type==='page');
    ws=new WebSocket(target.webSocketDebuggerUrl);
    ws.addEventListener('message',event=>{const message=JSON.parse(event.data),request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*']});await send('Page.enable');await send('Runtime.enable');
    await send('Page.navigate',{url:origin+'/ratings.html'});
    const ready="!!document.getElementById('scanner-view')?.contentWindow?.DNServicesReady";
    await wait(ready);await evaluate("document.getElementById('scanner-view').contentWindow.DNServicesReady");
    assert.equal(await evaluate("!!document.getElementById('scanner-view').contentWindow.DNCloud"),true,'optional account modules boot from versioned loader');
    assert.equal(await evaluate("!!document.getElementById('scanner-view').contentWindow.DNConsent"),true,'small consent core boots with account modules');
    assert.equal(await evaluate("!!document.getElementById('scanner-view').contentWindow.DNTelemetry"),false,'delayed telemetry does not gate account readiness');
    await evaluate("(()=>{const w=document.getElementById('scanner-view').contentWindow;w.DNSuccessfulScan=true;w.dispatchEvent(new w.Event('dn-successful-scan'));})()");
    await wait("!!document.getElementById('scanner-view').contentDocument.querySelector('dialog[open] [data-reject-consent]')");
    assert.equal(await evaluate("!!document.getElementById('scanner-view').contentWindow.DNTelemetry"),false,'local successful-scan prompt appears before delayed analytics');
    await evaluate("document.getElementById('scanner-view').contentDocument.querySelector('dialog[open] [data-reject-consent]').click()");
    assert.equal(await evaluate("document.getElementById('scanner-view').contentWindow.DNConsent.get().decided"),true,'privacy controls persist with analytics absent');
    await evaluate("document.getElementById('scanner-view').contentWindow.DNTelemetryReady");
    const first=hits.length;
    for(const route of ['artifacts','ratings']){
      await evaluate('window.DNAppShell.navigate('+JSON.stringify(origin+'/'+route+'.html')+')');
      await wait("document.getElementById('scanner-view')?.contentWindow?.location.pathname==="+JSON.stringify('/'+route+(cleanURLs?'':'.html'))+" && "+ready);
      await evaluate("document.getElementById('scanner-view').contentWindow.DNServicesReady");
    }
    const warm=hits.slice(first);
    assert.ok(!warm.some(url=>url.startsWith(manifest.prefix)&&(/\/(?:shared|services|ratings)\.js$/.test(url)||url.endsWith('/data/perk_rating_defaults.json'))),'warm navigation serves repeated scripts and datasets from browser cache');
    for(const route of ['collection','totals','council','council-collection','council-ratings','config','crafting-stats','privacy','crafting-statistics','storage-scanner']){
      await evaluate('window.DNAppShell.navigate('+JSON.stringify(origin+'/'+route+'.html')+')');
      const optional=!['privacy','crafting-statistics'].includes(route);
      await wait("document.getElementById('scanner-view')?.contentWindow?.location.pathname==="+JSON.stringify('/'+route+(cleanURLs?'':'.html'))+" && "+(optional?ready:"document.getElementById('scanner-view').contentDocument.readyState==='complete'"));
      if(optional)await evaluate("document.getElementById('scanner-view').contentWindow.DNServicesReady");
      if(route==='collection'){
        assert.equal(await evaluate("(async()=>{const w=document.getElementById('scanner-view').contentWindow;await w.DNArtwork.load();const image=new w.Image();image.src=w.DNArtwork.asset(w.DNArtworkIds[0]);await image.decode();return image.naturalWidth>0;})()"),true,'dynamic artwork catalogue and approved image load');
      }
    }
    await evaluate('window.DNAppShell.navigate('+JSON.stringify(origin+'/scanner.html')+')');
    await wait("!!document.getElementById('scanner-view')?.contentWindow?.Tesseract");
    const ocr=await evaluate(`(async()=>{const w=document.getElementById('scanner-view').contentWindow,base=new URL(${JSON.stringify(manifest.prefix+'vendor/tesseract/')},location.href).href;const worker=await w.Tesseract.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base+'core/',langPath:base+'lang-fast/',workerBlobURL:false,logger:()=>{}});await worker.terminate();return true;})()`);
    assert.equal(ocr,true,'real worker, WASM and language model initialize');
    assert.ok(hits.some(url=>url===manifest.prefix+'vendor/tesseract/worker.min.js'));
    assert.ok(hits.some(url=>url.startsWith(manifest.prefix+'vendor/tesseract/core/')));
    assert.ok(hits.some(url=>url===manifest.prefix+'vendor/tesseract/lang-fast/eng.traineddata.gz'));
    const unversioned=hits.filter(url=>!url.startsWith(manifest.prefix)&&!url.endsWith('.html')&&!['/favicon.ico','/service-config.js'].includes(url));
    assert.deepEqual(unversioned,[],'static requests use the content-addressed tree');
    assert.deepEqual(missing.filter(url=>url!=='/favicon.ico'),[],'every requested built asset exists');
    assert.deepEqual(errors,[],'no runtime errors in built shell/pages/loader/OCR');
    console.log('PASS: all built page routes, account/consent startup before delayed telemetry, warm browser-cache reuse, dynamic dataset/artwork loading and real Tesseract worker/core/language startup.');
    console.log(JSON.stringify({release:manifest.release,cleanURLs,firstRequests:first,warmNetworkRequests:warm.length,staticWarmRequests:warm.filter(url=>url.startsWith(manifest.prefix)).length}));
  }catch(error){console.error(JSON.stringify({errors,hits,state:await evaluate("({url:location.href,frame:document.getElementById('scanner-view')?.contentWindow?.location.href,html:document.documentElement.outerHTML.slice(0,1000)})").catch(()=>null)}));throw error;}
  finally{for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Browser closed'));}pending.clear();ws?.close();chrome?.kill();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
