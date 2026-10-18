/* Reproducible local-only production-controller speed evidence; no dependencies.
 * Snapshot overlays are read-only. Each sample receives a fresh Chrome profile. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),option=(key,fallback)=>args.find(arg=>arg.startsWith('--'+key+'='))?.slice(key.length+3) ?? fallback;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function connect(url){return new Promise((resolve,reject)=>{const ws=new WebSocket(url),jobs=new Map();let sequence=0;ws.addEventListener('error',reject);ws.addEventListener('message',event=>{const message=JSON.parse(event.data),job=jobs.get(message.id);if(!job)return;jobs.delete(message.id);clearTimeout(job.timer);message.error?job.reject(Error(JSON.stringify(message.error))):job.resolve(message.result);});ws.addEventListener('open',()=>resolve({close(){ws.close();},send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{jobs.delete(id);reject(Error('CDP timeout '+method));},90000);jobs.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}}));});}
const percentile=(values,p)=>{if(!values.length)return null;const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];};
async function main(){
 const snapshot=option('snapshot'),overlay=snapshot?path.resolve(root,snapshot):null,label=option('label',snapshot?.includes('candidate')?'candidate':overlay?'baseline':'candidate');
 const files=['scanner.js','scanner-reading.js','scanner-recognition.js','scanner-field-recognition.js','scanner-collection.js','scanner-comparison.js','scanner-frames.js','shared.js'],sourceHashes=Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(overlay||root,'ui',file))).digest('hex')]));
 if(overlay && (!overlay.startsWith(path.resolve(root,'data/temp')+path.sep)||!fs.existsSync(path.join(overlay,'ui/scanner.html'))))throw Error('Snapshot must contain ui/scanner.html inside data/temp.');
 const comparisonOption=option('compare-snapshot'),comparisonSnapshot=comparisonOption?path.resolve(root,comparisonOption):null;
 if(comparisonSnapshot && (!comparisonSnapshot.startsWith(path.resolve(root,'data/temp')+path.sep)||!fs.existsSync(path.join(comparisonSnapshot,'ui/scanner.html'))))throw Error('Comparison snapshot must contain ui/scanner.html inside data/temp.');
 const variants=[{label,snapshot:overlay},...(comparisonSnapshot?[{label:'comparison',snapshot:comparisonSnapshot}]:[])];
 const variantSources=Object.fromEntries(variants.map(variant=>[variant.label,{snapshot:variant.snapshot,hashes:Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(variant.snapshot||root,'ui',file))).digest('hex')]))}]));
 let activeOverlay=overlay;
 const report=path.resolve(root,option('report','reports/scanner-crafting-speed-'+(label)+'.json'));if(!report.startsWith(path.resolve(root,'reports')+path.sep)||path.extname(report)!=='.json')throw Error('Report must be JSON inside reports/.');
 const fixtureNames=option('fixtures','video161,video174,pic1,greenissue').split(','),logs=option('logs','10,1000').split(',').map(Number),temperatures=option('temperatures','cold,warm').split(','),repeat=Number(option('repeat','3')),owned=Number(option('owned','500')),timeoutMs=Number(option('timeout','12000'));
 if(!['steady','pixel-change','flicker'].includes(option('motion','steady')))throw Error('Invalid motion probe');
 if(!fixtureNames.every(name=>/^[a-z0-9-]+$/.test(name))||!logs.every(n=>Number.isInteger(n)&&n>=0&&n<5000)||!temperatures.every(t=>['cold','warm'].includes(t))||!Number.isInteger(repeat)||repeat<1||repeat>20)throw Error('Invalid matrix options');
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.gz':'application/octet-stream'};
 const server=http.createServer((req,res)=>{let relative;try{relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);}catch{res.writeHead(400).end();return;}let file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(activeOverlay&&relative.startsWith('ui/'))file=path.join(activeOverlay,relative);fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,runs=[];
 try{for(const logsCount of logs)for(const temperature of temperatures)for(const fixture of fixtureNames)for(let repetition=0;repetition<repeat;repetition++){
 for(const variant of repetition%2?variants.slice().reverse():variants){
  activeOverlay=variant.snapshot;
  const config={fixture,logs:logsCount,temperature,owned,timeoutMs,repetition,traceOcr:args.includes('--trace-ocr'),motion:option('motion','steady')},profile=fs.mkdtempSync(path.join(os.tmpdir(),'dn-crafting-speed-'));
  const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});let client;
  try{
   let port;for(let attempt=0;attempt<100;attempt++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await delay(100);}}if(!port)throw Error('Chrome did not start');
   const tabs=await(await fetch('http://127.0.0.1:'+port+'/json',{signal:AbortSignal.timeout(10000)})).json();client=await connect(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
   await client.send('Network.enable');await client.send('Network.setBlockedURLs',{urls:['https://*','*://static.cloudflareinsights.com/*']});await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
   const evaluate=async expression=>{const answer=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(answer.exceptionDetails)throw Error(JSON.stringify(answer.exceptionDetails));return answer.result.value;};
   const harness=fs.readFileSync(path.join(root,'tests/scanner/crafting-speed-browser.js'),'utf8');
   async function load(){await client.send('Page.navigate',{url:origin+'/ui/scanner.html'});await delay(350);await evaluate(harness);}
   await load();const seed=await evaluate('DNCraftingSpeed.seed('+JSON.stringify(config)+')');await load();const run=await evaluate('DNCraftingSpeed.run('+JSON.stringify(config)+')');runs.push({...run,variant:variant.label,repetition,seed});
   console.error(JSON.stringify({mode:variant.label,fixture,temperature,logs:logsCount,repetition,statsMs:run.firstStatsPaintedMs,scoreMs:run.firstScorePaintedMs,completeMs:run.fullCapturePaintedMs,coverage:run.coverage.percent,reads:run.reads.length}));
  }catch(error){runs.push({...config,variant:variant.label,error:String(error)});console.error(String(error));}finally{client?.close();chrome.kill();}
  write();
 }}}finally{server.close();}
 function summarize(selected,context){const stats=selected.filter(run=>Number.isFinite(run.firstStatsPaintedMs)).map(run=>run.firstStatsPaintedMs),complete=selected.filter(run=>Number.isFinite(run.fullCapturePaintedMs)).map(run=>run.fullCapturePaintedMs);return {...context,samples:selected.length,exactStats:selected.filter(run=>run.exactStats).length,fullAssessable:selected.filter(run=>run.fullArtifactAssessable).length,complete:complete.length,statsPaintedMs:{p50:percentile(stats,.5),p95:percentile(stats,.95)},scorePaintedMs:{p50:percentile(selected.map(run=>run.firstScorePaintedMs).filter(Number.isFinite),.5),p95:percentile(selected.map(run=>run.firstScorePaintedMs).filter(Number.isFinite),.95)},completeCapturePaintedMs:{p50:percentile(complete,.5),p95:percentile(complete,.95)}};}
 function write(){
  const groups=[],fixtureGroups=[];
  for(const variant of variants)for(const logsCount of logs)for(const temperature of temperatures){
   const selected=runs.filter(run=>run.variant===variant.label&&run.logs===logsCount&&run.temperature===temperature);
   const context={...(comparisonSnapshot?{variant:variant.label}:{}),logs:logsCount,temperature};
   groups.push(summarize(selected,context));
   for(const fixture of fixtureNames)fixtureGroups.push(summarize(selected.filter(run=>run.fixture===fixture),{fixture,...context}));
  }
  fs.writeFileSync(report,JSON.stringify({mode:label,snapshot:overlay,sourceHashes,...(comparisonSnapshot?{variantSources,pairedOrder:"Adjacent variants per case; order reversed on odd repetitions."}:{}),createdAt:new Date().toISOString(),config:{fixtureNames,logs,temperatures,repeat,owned,timeoutMs,motion:option('motion','steady')},groups,fixtureGroups,runs,limitations:'Static repository screenshots and original labelled video stills; production auto controller receives first readable sample then samples every 100ms. Fresh Chrome profile per sample; cold includes local worker/model startup after first sample. Warm starts with both fast and standard fallback workers initialized; each warmup is recorded outside timing, without a recognition pre-read. Exact names and signed values required. Complete latency requires labelled category, detected Hall, labelled five star states, 100% production capture meter, a rendered comparison and two requestAnimationFrame callbacks. Fixtures without category/Hall/star truth report partial stats only. Fresh-craft dice eligibility is production inference, not independently pixel labelled. Screenshot loading, seed setup, navigation, screen-share permission, game animation and persistence completion are outside timing. Log synchronous serialization/render costs remain inside timing. Small sample p95 is descriptive, not representative field performance. Compare matched fixture groups; aggregate complete latency excludes failed cases and must not compare different sets of completed fixtures.'},null,2)+'\n');
 }
 console.log(JSON.stringify({report,runs:runs.length,errors:runs.filter(run=>run.error).length,complete:runs.filter(run=>run.complete).length}));
 if(runs.some(run=>run.error))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
