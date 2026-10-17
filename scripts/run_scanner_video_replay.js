/* Authority: User-supplied local gameplay recording and scanner reliability plan.
 * Ownership: Local video indexing, evidence extraction, and scanner replay only.
 * Invariants: Original recording unchanged; bind loopback only; no npm dependencies,
 * game control, external requests, or published video/frame assets.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
const option=(name,fallback)=>args.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3) ?? fallback;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function reportPath(fallback){const file=path.resolve(root,option('report',fallback));if(!file.startsWith(path.join(root,'reports')+path.sep)||path.extname(file)!=='.json')throw new Error('Text reports must be JSON files inside reports/.');return file;}
function connect(url){return new Promise((resolve,reject)=>{
 const ws=new WebSocket(url),pending=new Map();let sequence=0;
 const opening=setTimeout(()=>{ws.close();reject(new Error('Chrome WebSocket timed out'));},15000);
 ws.addEventListener('error',()=>{clearTimeout(opening);reject(new Error('Chrome WebSocket failed'));});
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data),job=pending.get(message.id);if(!job)return;pending.delete(message.id);clearTimeout(job.timer);message.error?job.reject(new Error(JSON.stringify(message.error))):job.resolve(message.result);});
 ws.addEventListener('open',()=>{clearTimeout(opening);resolve({close(){for(const job of pending.values()){clearTimeout(job.timer);job.reject(new Error('Chrome closed'));}pending.clear();ws.close();},send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Chrome command timed out: '+method));},90000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}});});
});}
async function sha256(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function main(){
 const video=option('video');if(!video)throw new Error('Use --video=PATH to an original local recording.');
 const recording=path.resolve(video),stat=fs.statSync(recording);if(!stat.isFile())throw new Error('Recording must be a file.');
 const output=path.resolve(root,option('output','data/temp/scanner-video-2026-10-16'));
 const allowed=path.resolve(root,'data/temp')+path.sep;
 if(!output.startsWith(allowed))throw new Error('Video outputs must stay inside data/temp to keep pixels outside the published site.');
 fs.mkdirSync(output,{recursive:true});
 const testVariant=option('control','production');
 if(!['production','allow-assumed-inference'].includes(testVariant) || testVariant!=='production' && option('mode','index')!=='replay')throw new Error('The assumed-inference control is available only for replay.');
 let controlSource=null;
 if(testVariant==='allow-assumed-inference'){
  const source=fs.readFileSync(path.join(root,'ui/scanner-recognition.js'),'utf8'),guard='row.known && !row.assumed?expectedSign(row.name):null';
  if(!source.includes(guard))throw new Error('The inference control no longer matches the production source.');
  controlSource=source.replace(guard,'row.known?expectedSign(row.name):null');
 }
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.gz':'application/octet-stream'};
 let origin;
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  if(pathname==='/recording'){
   const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
   const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(stat.size-1,Number(range[2])):stat.size-1;
   if(start<0 || start> end || start>=stat.size){res.writeHead(416,{'Content-Range':'bytes */'+stat.size}).end();return;}
   res.writeHead(range?206:200,{'Content-Type':path.extname(recording).toLowerCase()==='.mp4'?'video/mp4':'video/x-matroska','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});
   if(req.method==='HEAD')res.end();else fs.createReadStream(recording,{start,end}).pipe(res);return;
  }
  if(pathname==='/replay'){
   res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><video id="recording" preload="auto" muted src="/recording"></video><script src="/ui/scanner-core.js"></script><script src="/ui/scanner-regions.js"></script><script src="/ui/scanner-recognition.js"></script><script src="/ui/storage-recognition.js"></script><script src="/tests/scanner/video-metrics.js"></script><script src="/tests/scanner/video-browser.js"></script></body></html>');return;
  }
  let file;try{file=path.resolve(root,'.'+decodeURIComponent(pathname));}catch{res.writeHead(400).end();return;}
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  // Historical inference control is served only to this isolated loopback run;
  // production source files and the user's live browser are never changed.
  if(controlSource && file===path.join(root,'ui/scanner-recognition.js')){res.setHeader('Content-Type','text/javascript');res.end(controlSource);return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');res.end(data);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 console.error('Video replay server ready');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dn-video-replay-'));
 const chrome=spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let client;
 try{
  let port;for(let attempt=0;attempt<100;attempt++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await delay(100);}}
  if(!port)throw new Error('Local Chrome did not start');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json',{signal:AbortSignal.timeout(10000)})).json();client=await connect(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  console.error('Chrome connected on '+port);
  await client.send('Network.enable');
  console.error('Chrome network ready');
  // Production pages are loaded only from this local test server. Reject all
  // other HTTP(S) resources before either scanner page is instantiated.
  await client.send('Network.setBlockedURLs',{urls:['https://*']});
  await client.send('Page.navigate',{url:origin+'/replay'});
  const evaluate=async expression=>{const response=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw new Error(JSON.stringify(response.exceptionDetails));return response.result.value;};
  await delay(300);
  const metadata=await evaluate('DNVideoReplay.ready()');
  const roi=String(option('roi','188,312,1796,1024')).split(',').map(Number);
  if(roi.length!==4 || roi.some(value=>!Number.isFinite(value)) || roi.some(value=>value<0) || roi[2]<=0 || roi[3]<=0 || roi[0]+roi[2]>metadata.width || roi[1]+roi[3]>metadata.height)throw new Error('ROI must fit the video: --roi=x,y,width,height');
  const manifest={version:1,source:{filename:path.basename(recording),bytes:stat.size,sha256:await sha256(recording),...metadata},roi:{x:roi[0],y:roi[1],width:roi[2],height:roi[3],source:'Manually selected game viewport for this recording; excludes desktop/browser chrome.'},createdAt:new Date().toISOString(),limitations:'Local development evidence. Detections/signature groups are proposals, not manually verified artifact labels.'};
  await evaluate('DNVideoReplay.configure('+JSON.stringify({roi:manifest.roi})+')');
  const mode=option('mode','index');
  if(mode==='index'){
   const step=Number(option('step','1')),start=Number(option('start','15')),end=Math.min(metadata.duration-.05,Number(option('end',String(metadata.duration-.05))));
   if(!Number.isFinite(step) || step<.1 || !Number.isFinite(start) || start<0 || !Number.isFinite(end) || end<start)throw new Error('Invalid sampling interval');
   const samples=[];let lastProgress=-Infinity;
   for(let time=start;time<=end;time+=step){const sample=await evaluate('DNVideoReplay.sample('+time.toFixed(3)+')');samples.push(sample);if(time-lastProgress>=20){console.error('Indexed '+time.toFixed(1)+' / '+metadata.duration.toFixed(1)+' s');lastProgress=time;}}
   const sheets=await evaluate('DNVideoReplay.sheets()');for(let i=0;i<sheets.length;i++)fs.writeFileSync(path.join(output,'contact-'+String(i+1).padStart(2,'0')+'.png'),Buffer.from(sheets[i],'base64'));
   manifest.sampling={start,end,step};manifest.samples=samples;fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
   console.log(JSON.stringify({duration:metadata.duration,resolution:metadata.width+'x'+metadata.height,samples:samples.length,craftingCandidates:samples.filter(s=>s.crafting).length,storageCandidates:samples.filter(s=>s.storage).length,contactSheets:sheets.length,manifest:path.join(output,'manifest.json')},null,2));
  }else if(mode==='numeric'){
   const times=String(option('times','174,204')).split(',').map(Number),runs=[];for(const time of times){if(!Number.isFinite(time)||time<0||time>=metadata.duration)throw new Error('Frame timestamp outside video');runs.push(...await evaluate('DNVideoReplay.numericProbe('+time+')'));console.error('Numeric OCR variants at '+time+' s complete');}const file=path.join(output,'numeric-probe.json');fs.writeFileSync(file,JSON.stringify(runs,null,2)+'\n');console.log(JSON.stringify({file,runs:runs.length}));
  }else if(mode==='percentages'){
   const times=String(option('times','161')).split(',').map(Number);for(const time of times){if(!Number.isFinite(time)||time<0||time>=metadata.duration)throw new Error('Frame timestamp outside video');const data=await evaluate('DNVideoReplay.percentageFrame('+time+')');const file=path.join(output,'percentages-'+time.toFixed(3).replace('.','-')+'.png');fs.writeFileSync(file,Buffer.from(data.image,'base64'));console.log(JSON.stringify({file,regions:data.regions}));}
  }else if(mode==='frames' || mode==='category'){
   const times=String(option('times','90')).split(',').map(Number);for(const time of times){if(!Number.isFinite(time)||time<0||time>=metadata.duration)throw new Error('Frame timestamp outside video');const data=await evaluate('DNVideoReplay.'+(mode==='category'?'categoryFrame':'frame')+'('+time+')');const file=path.join(output,(mode==='category'?'category-':'game-')+time.toFixed(3).replace('.','-')+'.png');fs.writeFileSync(file,Buffer.from(data,'base64'));console.log(file);}
  }else if(mode==='baseline'){
   const labels=JSON.parse(fs.readFileSync(path.join(root,option('labels','tests/scanner/video/2026-10-16.json')),'utf8'));
   if(labels.source.sha256!==manifest.source.sha256)throw new Error('Recording does not match the independently labelled original');
   if(JSON.stringify(labels.roi)!==JSON.stringify({x:roi[0],y:roi[1],width:roi[2],height:roi[3]}))throw new Error('ROI does not match the labelled viewport');
   const selected=option('times'),times=selected?selected.split(',').map(Number):null;
   const cases=labels.cases.filter(label=>!times || times.includes(label.time)),runs=[];
   for(const label of cases){const run=await evaluate('DNVideoReplay.baseline('+JSON.stringify(label)+')');runs.push(run);fs.writeFileSync(path.join(output,'baseline-progress.json'),JSON.stringify(runs,null,2)+'\n');console.error(label.mode+' '+label.time+'s '+label.title+': '+(run.accuracy.visibleExact?'visible exact':run.accuracy.statsExact?'stats exact':'review errors')+'; '+run.elapsedMs+' ms');}
   const negatives=[];for(const label of labels.negatives)negatives.push(await evaluate('DNVideoReplay.negative('+JSON.stringify(label)+')'));
   await evaluate('DNVideoReplay.close()');
   const summarize=mode=>{const items=runs.filter(run=>run.mode===mode);return {cases:items.length,detected:items.filter(r=>r.panel).length,statsExact:items.filter(r=>r.accuracy.statsExact).length,directStats:items.filter(r=>r.accuracy.directStats).length,visibleExact:items.filter(r=>r.accuracy.visibleExact).length,accepted:items.filter(r=>r.accuracy.accepted).length,acceptedWrongStats:items.filter(r=>r.accuracy.acceptedWrongStats).length,missingCatalog:[...new Set(items.flatMap(r=>r.missingCatalog))]};};
   const report={version:1,createdAt:new Date().toISOString(),source:manifest.source,roi:labels.roi,scope:'Development video, manually selected game viewport; independent single-frame labels, production reading controller and scorer, seeded default crafting field template, no colour inference, no temporal retries. First case per mode includes worker startup. Native game pixels; category preview limited to 1280 px as in capture. Isolated factory profile with empty owned inventory; personalized score/KEEP correctness not evaluated. Baseline failures are measurements, not harness test failures.',summary:{crafting:summarize('crafting'),storage:summarize('storage')},runs,negatives};
   const reportFile=reportPath('reports/scanner-video-2026-10-16-baseline.json');fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:reportFile,summary:report.summary,negatives},null,2));
  }else if(mode==='replay'){
   const labels=JSON.parse(fs.readFileSync(path.join(root,option('labels','tests/scanner/video/2026-10-16.json')),'utf8'));
   if(labels.source.sha256!==manifest.source.sha256 || ['x','y','width','height'].some(key=>labels.roi[key]!==manifest.roi[key]))throw new Error('Recording/viewport do not match the independent labels');
   const start=Number(option('start','156')),end=Number(option('end','258')),interval=Number(option('interval','350'));
   if(!Number.isFinite(start)||start<0||!Number.isFinite(end)||end<=start||end>=metadata.duration||!Number.isFinite(interval)||interval<100)throw new Error('Invalid replay interval');
   await evaluate('DNVideoReplay.replayStart()');
   const wallStart=performance.now(),ticks=[];let index=0,lastProgress=-Infinity;
   while(start+index*interval/1000<=end){const scheduled=wallStart+index*interval;await delay(Math.max(0,scheduled-performance.now()));const lagMs=Math.round(performance.now()-scheduled),time=Number((start+index*interval/1000).toFixed(3));
    const tick=await evaluate('DNVideoReplay.replayTick('+time+')');ticks.push({...tick,lagMs});if(time-lastProgress>=15){console.error('Replayed '+time.toFixed(1)+'s: '+tick.records+' completed reads; '+tick.status);lastProgress=time;}
    index=Math.max(index+1,Math.floor((performance.now()-wallStart)/interval));
   }
   const result=await evaluate('DNVideoReplay.replayFinish('+JSON.stringify(labels.cases.filter(c=>c.mode==='crafting' && c.time>=start && c.time<=end))+')');
   await evaluate('DNVideoReplay.close()');
   const encountered=labels.cases.filter(c=>c.mode==='crafting' && c.time>=start && c.time<=end).map(label=>{const records=result.records.filter(r=>r.withinTwoSeconds && r.nearestLabelTime===label.time);return {time:label.time,title:label.title,reads:records.length,statsExact:records.some(r=>r.accuracy.statsExact),visibleExact:records.some(r=>r.accuracy.visibleExact),accepted:records.some(r=>r.accuracy.accepted),acceptedWrongStats:records.some(r=>r.accuracy.acceptedWrongStats)};});
   const report={version:1,createdAt:new Date().toISOString(),source:manifest.source,roi:labels.roi,timing:{start,end,intervalMs:interval,wallMs:Math.round(performance.now()-wallStart),ticks:ticks.length,maxSchedulingLagMs:Math.max(...ticks.map(t=>t.lagMs))},scope:'Recorded source frames delivered on a wall-clock schedule to the production reading controller, local worker, comparison UI and item logger. Auto read, colour inference and item logging enabled; default seeded crafting fields. Game viewport is manually selected. Capture chooser/stream and interactive field calibration are bypassed. Nearest manually labelled timestamp within two seconds proposes encounter identity; exact names/values are checked independently. Unknown 250s artifact is not labelled. No precise first-readable boundaries: do not interpret read duration as end-to-end latency, or unmatched reads as proven stale/mixed artifacts. No held-out sessions or personalized collection/profile.',summary:{labelledEncounters:encountered.length,withCompletedRead:encountered.filter(e=>e.reads).length,withExactStats:encountered.filter(e=>e.statsExact).length,withExactLabelledFields:encountered.filter(e=>e.visibleExact).length,withAcceptedRead:encountered.filter(e=>e.accepted).length,withAcceptedWrongStats:encountered.filter(e=>e.acceptedWrongStats).length,completedReads:result.records.length,unassociatedReads:result.records.filter(r=>!r.withinTwoSeconds).length},encountered,...result,ticks};
   report.testVariant=testVariant;
   if(testVariant!=='production')report.scope+=' Isolated historical control: missing values may be inferred from assumed stat names. Production files are unchanged.';
   for(const encounter of encountered)encounter.directStats=result.records.some(r=>r.withinTwoSeconds && r.nearestLabelTime===encounter.time && r.accuracy.directStats);
   report.summary.withDirectStats=encountered.filter(e=>e.directStats).length;
   const reportFile=reportPath('reports/scanner-video-2026-10-16-replay.json');fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:reportFile,timing:report.timing,summary:report.summary},null,2));
  }else throw new Error('Unknown mode: '+mode);
 }finally{client?.close();chrome.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
