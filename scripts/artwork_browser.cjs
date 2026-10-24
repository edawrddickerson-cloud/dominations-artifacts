// Local-only browser harness. Source captures are served from memory on loopback.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function browserRun(run,routes={}) {
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  if(Object.hasOwn(routes,name)){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(routes[name]));return;}
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local artwork checks</title>');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const trace=message=>{if(process.env.ARTWORK_TRACE)console.error(message);};trace('Server '+origin);
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dn-artwork-'));
 const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let ws;const pending=new Map();let id=0;
 try{
  let port;for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await delay(100);}}
  if(!port)throw Error('Chrome did not expose its local debugging port.');
  trace('Chrome port '+port);
  const tabs=await (await fetch('http://127.0.0.1:'+port+'/json',{signal:AbortSignal.timeout(10000)})).json();trace('Tabs received');
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  trace('WebSocket ready');
  const events=[];
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method)events.push(m);const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(Error('Browser timeout: '+method));},120000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['https://*']});
  await send('Page.navigate',{url:origin+'/'});
  trace('Page navigated');
  for(let i=0;i<100;i++){if(await evaluate("location.pathname==='/' && document.readyState==='complete'"))break;await delay(50);}
  trace('Run started');return await run({origin,send,evaluate,events});
 }finally{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Browser closed'));}ws?.close();chrome.kill();await new Promise(resolve=>server.close(resolve));}
}
module.exports={browserRun};
