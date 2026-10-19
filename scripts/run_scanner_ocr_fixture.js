/*
 * Authority: User-approved scanner Phase 3, real screenshot recognition evidence.
 * Ownership: Local-only browser benchmark; never deploy this harness or fixtures.
 * Invariants: No external npm dependencies, game interaction, or image uploads.
 * Constraints: One manually labelled screenshot cannot establish general accuracy.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const snapshotOption=process.argv.find(arg=>arg.startsWith('--snapshot='))?.slice(11);
const snapshot=snapshotOption?path.resolve(root,snapshotOption):null;
if(snapshot && (!snapshot.startsWith(path.join(root,'data/temp')+path.sep) || !fs.existsSync(path.join(snapshot,'ui/scanner.html'))))throw Error('Snapshot must contain ui/scanner.html inside data/temp.');
const longBenchmark=process.argv.includes('--regions-benchmark') || process.argv.includes('--crafting-audit');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function cdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), requests = new Map(), handlers=[]; let id = 0;
    ws.addEventListener('error', reject);
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data), pending = requests.get(msg.id);
      if(msg.method)handlers.forEach(handler=>handler(msg));
      if (!pending) return;
      requests.delete(msg.id);
      msg.error ? pending.reject(new Error(JSON.stringify(msg.error))) : pending.resolve(msg.result);
    });
    ws.addEventListener('open', () => resolve({ close: () => ws.close(), on:handler=>handlers.push(handler), send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => { const next = ++id; const timeout=setTimeout(()=>{requests.delete(next);reject(new Error('CDP command timed out: '+method));},longBenchmark?600000:90000); requests.set(next, {resolve:value=>{clearTimeout(timeout);resolve(value);}, reject:error=>{clearTimeout(timeout);reject(error);}}); ws.send(JSON.stringify({id:next, method, params,...(sessionId?{sessionId}:{})})); });
    }}));
  });
}
async function main() {
  const deadline = setTimeout(() => {console.error('Fixture timed out'); process.exit(1);},longBenchmark?650000:120000);
  const mime = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.gz':'application/octet-stream'};
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
    if(snapshot && file.startsWith(path.join(root,'ui')+path.sep))file=path.join(snapshot,path.relative(root,file));
    fs.readFile(file, (error, data) => {if(error){res.writeHead(404).end(); return;} res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(data);});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-ocr-fixture-'));
  const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--user-data-dir='+profile, 'about:blank'], {windowsHide:true, stdio:'ignore'});
  let client;
  try {
    let port;
    for (let i=0;i<100;i++) {try {port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]); break;} catch {await delay(100);}}
    if(!port) throw new Error('Chrome remote debugging did not start');
    console.error('Chrome CDP ready on '+port);
    const tabs = await (await fetch('http://127.0.0.1:'+port+'/json')).json();
    client = await cdp(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
    console.error('CDP connected');
    const observedRequests=[], browserErrors=[],blockedRequests=new Set();
    client.on(message=>{
      if(message.method==='Network.requestWillBeSent')observedRequests.push({requestId:message.params.requestId,url:message.params.request.url,method:message.params.request.method,hasPostData:!!message.params.request.hasPostData});
      if(message.method==='Network.loadingFailed' && message.params.blockedReason==='inspector')blockedRequests.add(message.params.requestId);
      if(message.method==='Runtime.exceptionThrown')browserErrors.push(message.params.exceptionDetails.text);
      if(message.method==='Target.attachedToTarget')client.send('Network.enable',{},message.params.sessionId).catch(error=>browserErrors.push(error.message));
    });
    await client.send('Network.enable');
    // Cross-page checks visit pages with existing analytics. Block those scripts
    // in this local-only harness.
    if(process.argv.includes('--primary-filters') || process.argv.includes('--crafting-keep') || process.argv.includes('--collection-comparison') || process.argv.includes('--storage-catalog') || process.argv.includes('--linked-artifacts'))await client.send('Network.setBlockedURLs',{urls:['*://static.cloudflareinsights.com/*',...(process.argv.includes('--collection-comparison') || process.argv.includes('--storage-catalog') || process.argv.includes('--linked-artifacts')?['*://static.wikia.nocookie.net/*']:[])]});
    await client.send('Runtime.enable');
    await client.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
    await client.send('Page.enable');
    const origin='http://127.0.0.1:'+server.address().port;
    const collectionComparison=process.argv.includes('--collection-comparison');
    const inventory=process.argv.includes('--inventory') || process.argv.includes('--inventory-tiers') || collectionComparison;
    const storageLayout=process.argv.includes('--storage-layout');
    const storagePassive=process.argv.includes('--storage-passive');
    const glance=process.argv.includes('--glance');
    const viewport=process.argv.find(arg=>arg.startsWith('--viewport='))?.slice(11) || '1440x900';
    if(glance || process.argv.includes('--identification') || process.argv.includes('--crafting-keep') || process.argv.includes('--regions-ui')){if(!/^\d{3,4}x\d{3,4}$/.test(viewport))throw new Error('Invalid viewport');const [width,height]=viewport.split('x').map(Number);await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});}
    if(inventory)await client.send('Emulation.setDeviceMetricsOverride',{width:1800,height:1100,deviceScaleFactor:1,mobile:false});
    if(storageLayout)await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    const storage=process.argv.includes('--storage') || inventory || storageLayout || storagePassive || process.argv.includes('--storage-fields') || process.argv.includes('--storage-catalog') || process.argv.includes('--linked-artifacts');
    await client.send('Page.navigate',{url:origin+'/ui/'+(storage?'storage-scanner.html':'scanner.html')});
    await delay(500);
    // The scanner document lives inside its capture host. Await its scripts,
    // rather than capturing undefined controller references during startup.
    // This also makes independent parallel browser checks deterministic.
    const readiness=await client.send('Runtime.evaluate',{expression:'(async()=>{for(let i=0;i<400;i++){const app=document.getElementById("scanner-view")?.contentWindow || window;if(app.document.readyState==="complete" && app.DN && (!app.document.getElementById("scanner-read") || app.DNStoredArtifacts && app.DNScannerReading)){if(app.DNServicesReady)await app.DNServicesReady;return true;}await new Promise(resolve=>setTimeout(resolve,25));}throw Error("Application document did not finish loading");})()',awaitPromise:true,returnByValue:true});
    if(readiness.exceptionDetails)throw Error('Application document did not finish loading.');
    const uiSmoke=process.argv.includes('--ui');
    const percent=process.argv.includes('--storage-percent');
    const coverage=process.argv.includes('--storage-coverage') || percent;
    let expression = fs.readFileSync(path.join(root,collectionComparison?'tests/scanner/collection-comparison-browser.js':process.argv.includes('--primary-filters')?'tests/scanner/filters-browser.js':glance?'tests/scanner/glance-browser.js':storageLayout?'tests/scanner/storage-layout-browser.js':process.argv.includes('--navigation')?'tests/scanner/navigation-browser.js':inventory?'tests/scanner/inventory-browser.js':coverage?'tests/scanner/storage-coverage-browser.js':storage?'tests/scanner/storage-browser.js':uiSmoke?'tests/scanner/ui-browser.js':'tests/scanner/fixture-browser.js'),'utf8');
    if(process.argv.includes('--headers'))expression=fs.readFileSync(path.join(root,'tests/scanner/headers-browser.js'),'utf8');
    if(process.argv.includes('--profile-delete'))expression=fs.readFileSync(path.join(root,'tests/scanner/profile-delete-browser.js'),'utf8');
    if(process.argv.includes('--inventory-tiers'))expression='window.DNInventoryTierOnly=true;\n'+expression;
    if(storagePassive)expression=fs.readFileSync(path.join(root,'tests/scanner/storage-passive-browser.js'),'utf8');
    if(process.argv.includes('--storage-catalog'))expression=fs.readFileSync(path.join(root,'tests/scanner/storage-catalog-browser.js'),'utf8');
    if(process.argv.includes('--linked-artifacts'))expression=fs.readFileSync(path.join(root,'tests/scanner/linked-artifacts-browser.js'),'utf8');
    if(process.argv.includes('--regions-benchmark'))expression='window.DNRegionsBaseline='+process.argv.includes('--baseline')+'; window.DNRegionsTight='+process.argv.includes('--regions-tight')+';\n'+fs.readFileSync(path.join(root,'tests/scanner/regions-benchmark-browser.js'),'utf8');
    if(process.argv.includes('--crafting-audit')) {
      const fixtures=fs.readdirSync(path.join(root,'tests/scanner')).filter(file=>file.endsWith('.labels.json') && !file.startsWith('storage')).map(file=>file.replace('.labels.json','')).sort();
      expression='window.DNRegionsFixtures='+JSON.stringify(fixtures)+';window.DNRegionsScales=[1,.75,1.5];\n'+fs.readFileSync(path.join(root,'tests/scanner/regions-benchmark-browser.js'),'utf8');
    }
    if(process.argv.includes('--regions-ui'))expression=fs.readFileSync(path.join(root,'tests/scanner/regions-ui-browser.js'),'utf8');
    if(process.argv.includes('--storage-fields'))expression=fs.readFileSync(path.join(root,'tests/scanner/storage-fields-browser.js'),'utf8');
    if(process.argv.includes('--crafting-metadata'))expression=fs.readFileSync(path.join(root,'tests/scanner/crafting-metadata-browser.js'),'utf8');
    if(process.argv.includes('--crafting-edits'))expression=fs.readFileSync(path.join(root,'tests/scanner/crafting-edits-browser.js'),'utf8');
    if(process.argv.includes('--identification'))expression=fs.readFileSync(path.join(root,'tests/scanner/identification-browser.js'),'utf8');
    if(process.argv.includes('--provisional-colours'))expression=fs.readFileSync(path.join(root,'tests/scanner/provisional-colours-browser.js'),'utf8');
    if(process.argv.includes('--stat-context'))expression=fs.readFileSync(path.join(root,'tests/scanner/stat-context-browser.js'),'utf8');
    if(process.argv.includes('--crafting-latency'))expression=fs.readFileSync(path.join(root,'tests/scanner/crafting-latency-browser.js'),'utf8');
    if(process.argv.includes('--field-reuse'))expression=fs.readFileSync(path.join(root,'tests/scanner/crafting-field-reuse-browser.js'),'utf8');
    if(process.argv.includes('--worker-experiment'))expression=fs.readFileSync(path.join(root,'tests/scanner/crafting-worker-experiment-browser.js'),'utf8');
    if(process.argv.includes('--crafting-keep'))expression=fs.readFileSync(path.join(root,'tests/scanner/crafting-keep-browser.js'),'utf8');
    if(process.argv.includes('--reroll-ui'))expression=fs.readFileSync(path.join(root,'tests/scanner/reroll-browser.js'),'utf8');
    if(process.argv.includes('--reroll-pools'))expression=fs.readFileSync(path.join(root,'tests/scanner/reroll-pools-browser.js'),'utf8');
    if(percent)expression="window.DNStorageFixtureVariants=['native','video','muted'];\n"+expression.replace('storage-coverage.labels.json','storage-percent.labels.json');
    const green=process.argv.includes('--green');
    const fixture=process.argv.find(arg=>arg.startsWith('--fixture='))?.slice(10);
    if(fixture && !/^[a-z0-9-]+$/.test(fixture))throw new Error('Invalid fixture name');
    if(green && uiSmoke)throw new Error('--green currently exercises the OCR fixture, not the UI smoke test.');
    if(green)expression=expression.replaceAll('pic1','greenissue').replace('{x:570,y:270,width:532,height:213}','{x:80,y:90,width:529,height:218}');
    if(fixture)expression=expression.replaceAll('pic1',fixture);
    // The scanner now lives in a persistent capture host. Run existing scenarios
    // in the scanner document; session tests intentionally exercise the host.
    if(process.argv.includes('--session')) expression=fs.readFileSync(path.join(root,'tests/scanner/session-browser.js'),'utf8');
    else expression='(document.getElementById("scanner-view")?.contentWindow || window).eval('+JSON.stringify(expression)+')';
    const evaluation=client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(process.argv.includes('--regions-ui')) {
      let finished=false;evaluation.finally(()=>{finished=true;}).catch(()=>{});
      while(!finished) {
        const response=await client.send('Runtime.evaluate',{expression:'(document.getElementById("scanner-view")?.contentWindow || window).DNRegionPointerRequest || null',returnByValue:true});
        const pointer=response.result?.value;
        if(pointer) {
          await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pointer.x0,y:pointer.y0});
          await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:pointer.x0,y:pointer.y0,button:'left',clickCount:1});
          await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pointer.x1,y:pointer.y1,button:'left',buttons:1});
          await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pointer.x1,y:pointer.y1,button:'left',clickCount:1});
          await client.send('Runtime.evaluate',{expression:'(document.getElementById("scanner-view")?.contentWindow || window).DNRegionPointerDone()'});
        }else await delay(30);
      }
    }
    const result=await evaluation;
    if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    const value=result.result.value;
    if(process.argv.includes('--regions-ui') && process.argv.includes('--report')){const screenshot=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'tests/scanner/regions-ui-'+viewport+'.png'),Buffer.from(screenshot.data,'base64'));}
    if(glance && process.argv.includes('--report')){const screenshot=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'tests/scanner/glance-'+viewport+'.png'),Buffer.from(screenshot.data,'base64'));}
    value.network={requests:observedRequests,blockedRequests:observedRequests.filter(request=>blockedRequests.has(request.requestId)),externalRequests:observedRequests.filter(request=>!blockedRequests.has(request.requestId)&&!request.url.startsWith(origin+'/')&&!request.url.startsWith('data:')&&!request.url.startsWith('blob:')),nonGetRequests:observedRequests.filter(request=>request.method!=='GET'&&!blockedRequests.has(request.requestId)),browserErrors};
    value.passed &&= value.network.externalRequests.length===0 && value.network.nonGetRequests.length===0 && browserErrors.length===0;
    if(process.argv.includes('--crafting-audit') && process.argv.includes('--report')) {
      const runs=value.runs.map(({fixture,scale,elapsedMs,accuracy,first,starsCorrect,categoryCorrect,complete,confidentlyIncorrect,ocrCalls,recognitionPath,valid,warnings,rows})=>({fixture,scale,elapsedMs,accuracy,first,starsCorrect,categoryCorrect,complete,confidentlyIncorrect,ocrCalls,recognitionPath,valid,...(!valid?{warnings}: {}),...(!complete?{rows}: {})}));
      const baselineFile=path.join(root,'data/temp/crafting-scanner-before.json');
      const baseline=!snapshot && !process.argv.some(arg=>arg.startsWith('--audit-report=')) && fs.existsSync(baselineFile)?JSON.parse(fs.readFileSync(baselineFile,'utf8')).runs:[];
      const matched=baseline.map(before=>({before,after:runs.find(after=>after.fixture===before.fixture && after.scale===1)})).filter(pair=>pair.after);
      const sum=(items,value)=>items.reduce((total,item)=>total+value(item),0);
      const performance=matched.length?{fixtures:matched.length,beforeMs:sum(matched,p=>p.before.elapsedMs),afterMs:sum(matched,p=>p.after.elapsedMs),beforeCalls:sum(matched,p=>p.before.ocrCalls),afterCalls:sum(matched,p=>p.after.ocrCalls)}:null;
      if(performance)performance.speedup=performance.beforeMs/performance.afterMs;
      const before=matched.map(({before})=>({fixture:before.fixture,elapsedMs:before.elapsedMs,ocrCalls:before.ocrCalls,accuracy:before.accuracy,first:before.first,valid:before.valid}));
      const auditOption=process.argv.find(arg=>arg.startsWith('--audit-report='))?.slice(15),auditReport=path.resolve(root,auditOption || 'reports/scanner-crafting-performance.json');
      if(!auditReport.startsWith(path.join(root,'reports')+path.sep) || path.extname(auditReport)!=='.json')throw Error('Audit report must be JSON inside reports.');
      fs.writeFileSync(auditReport,JSON.stringify({passed:value.passed,snapshot,performance,before,runs,limitations:value.limitations,network:{external:value.network.externalRequests.length,errors:browserErrors}},null,2)+'\n');
    }
    if(process.argv.includes('--report') && !process.argv.includes('--crafting-audit')) fs.writeFileSync(path.join(root,process.argv.includes('--crafting-metadata')?'tests/scanner/crafting-metadata-result.json':process.argv.includes('--regions-benchmark')?'tests/scanner/regions-'+(process.argv.includes('--baseline')?'baseline':process.argv.includes('--regions-tight')?'tight':'calibrated')+'.json':process.argv.includes('--regions-ui')?'tests/scanner/regions-ui-'+viewport+'.json':glance?'tests/scanner/glance-'+viewport+'.json':percent?'tests/scanner/storage-percent.ocr-result.json':coverage?'tests/scanner/storage-coverage.ocr-result.json':storage?'tests/scanner/storage.ocr-result.json':fixture?'tests/scanner/'+fixture+'.ocr-result.json':green?'tests/scanner/greenissue.ocr-result.json':uiSmoke?'tests/scanner/pic1.ui-result.json':'tests/scanner/pic1.ocr-result.json'),JSON.stringify(value,null,2)+'\n');
    const summary={passed:value.passed,ui:value.ui,network:{external:value.network.externalRequests.length,errors:value.network.browserErrors}};
    if(process.argv.includes('--crafting-audit'))summary.audit={cases:value.runs.length,complete:value.runs.filter(r=>r.complete).length,direct:value.runs.filter(r=>r.complete && r.accuracy.directPercentages===5).length,confirmed:value.runs.filter(r=>r.valid).length,confidentlyIncorrect:value.runs.filter(r=>r.confidentlyIncorrect).length,review:value.runs.filter(r=>!r.valid).map(r=>({fixture:r.fixture,scale:r.scale,directPercentages:r.accuracy.directPercentages}))};
    else summary.runs=value.runs?.map(r=>({fixture:r.fixture,scale:r.scale,kind:r.kind,stamp:r.stamp,variant:r.variant,elapsedMs:r.elapsedMs,passed:r.passed ?? r.complete,exact:r.exact,...(!(r.passed ?? r.complete)?{warnings:r.warnings}: {})}));
    console.log(JSON.stringify(process.argv.includes('--summary')?summary:value,null,2));
    if(!value?.passed) process.exitCode=1;
  } finally {
    clearTimeout(deadline);
    if(client) client.close(); chrome.kill(); server.close();
    // Chrome profile is left in the OS temporary directory to avoid racing Windows locks.
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
