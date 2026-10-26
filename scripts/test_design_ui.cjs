/* Local-only visual/interaction review. Fresh browser profile; all external requests blocked. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'data/temp/design-review');
const routes = ['artifacts','collection','ratings','totals','scanner','storage-scanner','crafting-stats','council','council-collection','council-ratings','config','privacy','crafting-statistics'];
const theme=JSON.parse(fs.readFileSync(path.join(root,'docs/design/consumers.json'),'utf8')).theme;
const viewport = process.argv.find(arg=>arg.startsWith('--viewport='))?.slice(11);
if(viewport&&!/^\d{3,4}x\d{3,4}$/.test(viewport))throw Error('Invalid viewport');
const sizes = viewport ? [viewport.split('x').map(Number)] : process.argv.includes('--full') ? [[1440,900],[1024,768],[768,1024],[390,844],[320,800]] : [[1440,900],[390,844]];
const delay = ms => new Promise(r=>setTimeout(r,ms));
function connect(url) {
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(url),pending=new Map(),listeners=[]; let seq=0;
    ws.addEventListener('error',reject);
    ws.addEventListener('message',e=>{const msg=JSON.parse(e.data);if(msg.method)listeners.forEach(fn=>fn(msg));const request=pending.get(msg.id);if(request){pending.delete(msg.id);clearTimeout(request.timer);msg.error?request.reject(Error(JSON.stringify(msg.error))):request.resolve(msg.result);}});
    ws.addEventListener('open',()=>resolve({close:()=>ws.close(),on:fn=>listeners.push(fn),send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}}));
  });
}
async function main(){
  fs.mkdirSync(out,{recursive:true});
  const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dn-design-'));
  const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let client;
  const checks=[],images=[],errors=[],external=[];
  const check=(name,passed,details)=>checks.push({name,passed:!!passed,...(details?{details}: {})});
  try{
    let port;for(let n=0;n<100;n++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await delay(100);}}
    if(!port)throw Error('Chrome did not start');
    client=await connect((await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page').webSocketDebuggerUrl);
    client.on(msg=>{if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);if(msg.method==='Network.requestWillBeSent'&&/^https?:/.test(msg.params.request.url)&&!msg.params.request.url.startsWith(origin))external.push(msg.params.request.url);});
    const origin='http://127.0.0.1:'+server.address().port;
    await client.send('Network.enable');
    // Block remote HTTPS; every HTTP request made by the fixtures is localhost.
    await client.send('Network.setBlockedURLs',{urls:['https://*']});
    await client.send('Page.enable');await client.send('Runtime.enable');
    const evaluate=async expression=>{const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
    async function wait(expression){for(let n=0;n<150;n++){if(await evaluate(expression))return;await delay(100);}throw Error('Readiness timeout: '+expression);}
    async function capture(name,width){const file=name+'-'+width+'.png';fs.writeFileSync(path.join(out,file),Buffer.from((await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));images.push({name,width,file});}
    await client.send('Page.navigate',{url:origin+'/ui/scanner.html'});
    await wait("document.getElementById('scanner-view')?.contentDocument?.querySelector('#scanner-names')?.children.length>0");
    const seed=fs.readFileSync(path.join(root,'tests/design/seed-browser.js'),'utf8');
    check('Disposable sample collection/targets',!!await evaluate('(document.getElementById("scanner-view").contentWindow).eval('+JSON.stringify(seed)+')'));
    for(const [width,height]of sizes){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for(const route of routes){
        await client.send('Page.navigate',{url:origin+'/ui/'+route+'.html'});
        const embedded=true;
        await wait(embedded?`document.getElementById('scanner-view')?.contentDocument?.readyState==='complete' && document.getElementById('scanner-view').contentDocument.querySelector('main,[role="main"]') && document.getElementById('scanner-view').contentDocument.querySelector('script[src^="design-ui.js"]')`:`document.readyState==='complete'&&!!document.querySelector('main')`);
        await delay(250);
        const result=await evaluate(`(()=>{const d=${embedded?"document.getElementById('scanner-view').contentDocument":"document"},w=d.defaultView;const visible=e=>e.getClientRects().length&&w.getComputedStyle(e).visibility!=='hidden';const fields=[...d.querySelectorAll('select,input[type="search"],input[type="text"]')].filter(visible);return {main:d.querySelectorAll('main,[role="main"]').length,overflow:d.documentElement.scrollWidth>w.innerWidth+1,shellOverflow:document.documentElement.scrollWidth>innerWidth+1,fields:fields.map(e=>({id:e.id,height:e.getBoundingClientRect().height,bg:w.getComputedStyle(e).backgroundColor,radius:w.getComputedStyle(e).borderRadius,font:w.getComputedStyle(e).fontFamily})),tokens:w.getComputedStyle(d.documentElement).getPropertyValue('--control-height')};})()`);
        check(route+' '+width+' main landmark',result.main===1,result);
        check(route+' '+width+' page navigation stays in side menu',await evaluate(`(()=>{const d=document.getElementById('scanner-view').contentDocument;return ![...d.querySelectorAll('a[href]')].some(a=>!a.closest('.site-nav')&&a.origin===location.origin&&a.pathname.endsWith('.html'));})()`));
        check(route+' '+width+' local overflow',!result.overflow&&!result.shellOverflow,result);
        check(route+' '+width+' shared tokens',result.tokens.trim()==='2.25rem');
        const palette=await evaluate(`(()=>{const d=${embedded?"document.getElementById('scanner-view').contentDocument":"document"},styles=d.defaultView.getComputedStyle(d.documentElement),shell=getComputedStyle(document.documentElement),names=${JSON.stringify(Object.keys(theme.tokens))};return {content:Object.fromEntries(names.map(name=>[name,styles.getPropertyValue('--'+name).trim()])),shell:Object.fromEntries(names.map(name=>[name,shell.getPropertyValue('--'+name).trim()]))};})()`);
        check(route+' '+width+' Slate theme in shell/content',Object.entries(theme.tokens).every(([name,value])=>palette.content[name]===value&&palette.shell[name]===value),palette);
        check(route+' '+width+' shared field radius',result.fields.every(f=>f.radius==='4px'),result.fields);
        await capture(route,width);
        if(route==='ratings'){
          const rareView=await evaluate(`(()=>{const d=document.getElementById('scanner-view').contentDocument,w=d.defaultView;d.querySelector('[data-crafting-tab="rare"]').click();d.querySelector('[data-rare-count="rare-invading-bomber"][data-value="4"]').click();return {counts:[...d.querySelectorAll('[data-rare-count="rare-invading-bomber"]')].map(b=>b.textContent).join('|'),modes:[...d.querySelectorAll('[data-rare-mode="rare-invading-bomber"]')].map(b=>b.textContent).join('|'),focus:d.activeElement.dataset.rareCount,overflow:d.documentElement.scrollWidth>w.innerWidth+1};})()`);
          const rareTextFits=await evaluate(`(()=>{const d=document.getElementById('scanner-view').contentDocument,w=d.defaultView;return [...d.querySelectorAll('.purpose-rare-row button')].every(button=>{const range=d.createRange();range.selectNodeContents(button);const box=button.getBoundingClientRect();return w.getComputedStyle(button).textOverflow!=='ellipsis'&&button.scrollWidth<=button.clientWidth+1&&button.scrollHeight<=button.clientHeight+1&&[...range.getClientRects()].every(text=>text.left>=box.left&&text.right<=box.right+1&&text.top>=box.top&&text.bottom<=box.bottom+1);});})()`);
          check('ratings '+width+' rare toggle choices, focus, full text and overflow',rareView.counts==='3× and 4×|4× only|Off'&&rareView.modes==='Damage & HP|Damage|Hitpoints'&&rareView.focus==='rare-invading-bomber'&&!rareView.overflow&&rareTextFits,rareView);
          const rareScaledFits=await evaluate(`(async()=>{const d=document.getElementById('scanner-view').contentDocument,w=d.defaultView,previous=d.documentElement.style.fontSize;d.documentElement.style.fontSize='200%';await new Promise(resolve=>w.requestAnimationFrame(resolve));const fits=[...d.querySelectorAll('.purpose-rare-row button')].every(button=>{const range=d.createRange();range.selectNodeContents(button);const box=button.getBoundingClientRect();return button.scrollWidth<=button.clientWidth+1&&button.scrollHeight<=button.clientHeight+1&&[...range.getClientRects()].every(text=>text.left>=box.left&&text.right<=box.right+1&&text.top>=box.top&&text.bottom<=box.bottom+1);});d.documentElement.style.fontSize=previous;return fits&&d.documentElement.scrollWidth<=w.innerWidth+1;})()`);
          check('ratings '+width+' full toggle text at 200% text size',rareScaledFits);
          await capture('ratings-rare-cards',width);
          const defaultsView=await evaluate(`(()=>{const d=document.getElementById('scanner-view').contentDocument,w=d.defaultView;d.querySelector('[data-crafting-tab="ratings"]').click();return {visible:!d.getElementById('rating-defaults-panel').hidden,targetsHidden:d.getElementById('purpose-section-panel').hidden,controls:!!d.querySelector('#rating-defaults-panel #ratings-grid'),overflow:d.documentElement.scrollWidth>w.innerWidth+1,textFits:[...d.querySelectorAll('[data-crafting-tab]')].every(button=>button.scrollWidth<=button.clientWidth+1&&button.scrollHeight<=button.clientHeight+1)};})()`);
          check('ratings '+width+' Rating Defaults panel and full tab labels',defaultsView.visible&&defaultsView.targetsHidden&&defaultsView.controls&&!defaultsView.overflow&&defaultsView.textFits,defaultsView);
          check('ratings '+width+' Rating Defaults action bounds',await evaluate(`(()=>{const d=document.getElementById('scanner-view').contentDocument,toolbar=d.querySelector('.ratings-page-controls').getBoundingClientRect();return [...d.querySelectorAll('.ratings-page-controls button')].filter(button=>button.getClientRects().length).every(button=>{const box=button.getBoundingClientRect();return box.left>=toolbar.left&&box.right<=toolbar.right+1&&button.scrollWidth<=button.clientWidth+1;});})()`));
          await capture('rating-defaults',width);
          await evaluate(`document.getElementById('scanner-view').contentDocument.querySelector('[data-crafting-tab="attacking"]').click()`);
        }
        // Exercise real custom picker consumers without changing their selections.
        const pickerScenario=fs.readFileSync(path.join(root,'tests/design/pickers-browser.js'),'utf8');
        const popupResults=await evaluate('('+(embedded?'document.getElementById("scanner-view").contentWindow':'window')+').eval('+JSON.stringify(pickerScenario)+')');
        for(const popup of popupResults)check(route+' '+width+' '+popup.name+' picker placement/Escape/focus/selection/search',popup.inside&&popup.closed&&popup.focus&&popup.retained&&popup.searchRetention,popup);
        if(route==='scanner'){
          const sample=fs.readFileSync(path.join(root,'tests/design/scanner-preview-browser.js'),'utf8');
          const populated=await evaluate('(document.getElementById("scanner-view").contentWindow).eval('+JSON.stringify(sample)+')');
          check('scanner '+width+' populated five rows',populated.rows===5);
          const geometry=await evaluate(`(()=>{const d=document.getElementById('scanner-view').contentDocument,w=d.defaultView,row=d.querySelector('.scanner-stat-title');return {nameWidth:row.getBoundingClientRect().width,overflow:d.documentElement.scrollWidth>w.innerWidth+1};})()`);
          check('scanner '+width+' readable stat column/local overflow',geometry.nameWidth>=100&&!geometry.overflow,geometry);
          await capture('scanner-populated',width);
        }
      }
      await client.send('Page.navigate',{url:origin+'/tests/design/gallery.html'});await wait("document.readyState==='complete'&&!!document.querySelector('#normal-field')");
      await capture('components',width);
      check('gallery '+width+' local overflow',await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      // Real keyboard navigation, rather than programmatic focus alone.
      await evaluate("document.getElementById('normal-field').focus()");await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',windowsVirtualKeyCode:9});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',windowsVirtualKeyCode:9});
      check('gallery '+width+' keyboard focus',await evaluate("document.activeElement.matches('.ui-compact')&&getComputedStyle(document.activeElement).outlineStyle==='solid'"));
      await evaluate("document.getElementById('show-dialog').focus();document.getElementById('show-dialog').click()");
      check('gallery '+width+' dialog focus',await evaluate("document.querySelector('dialog').matches(':modal')&&document.activeElement.value==='cancel'"));
      await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',windowsVirtualKeyCode:27});
      await delay(50);
      check('gallery '+width+' dialog Escape returns focus',await evaluate("!document.querySelector('dialog').open&&document.activeElement.id==='show-dialog'"));
    }
    check('No browser errors',errors.length===0,errors);
    const report={passed:checks.every(c=>c.passed),checks,browserErrors:errors,externalRequestsBlocked:external,fixtures:'Disposable sample targets and collection; synthetic scanner reading; no user account data'};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design review</title><style>body{font:16px Segoe UI;background:#1a1d21;color:#e8eaed;margin:2rem}a{color:#d4b46c}.pages{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:1rem}img{width:100%;border:1px solid #77818f}figure{margin:0}h2{font-size:1rem}nav{display:flex;flex-wrap:wrap;gap:1rem;margin-block:1rem}select{background:#24282e;color:#e8eaed;padding:.5rem;border:1px solid #77818f;border-radius:4px}figure[hidden]{display:none}</style><h1>Design review</h1><nav><a href="../../../ui/ratings.html">Live app</a><a href="../../../tests/design/gallery.html">Components</a><a href="report.json">Checks</a></nav><label>Viewport <select id="size"><option value="all">All sizes</option>'+sizes.map(([width])=>'<option value="'+width+'">'+width+' px</option>').join('')+'</select></label><p>'+checks.length+' checks · '+images.length+' screenshots · Sample data</p><div class="pages">'+images.map(i=>'<figure data-width="'+i.width+'"><h2>'+i.name+' · '+i.width+'</h2><a href="'+i.file+'"><img loading="lazy" src="'+i.file+'" alt="'+i.name+' at '+i.width+' pixels"></a></figure>').join('')+'</div><script>const size=document.getElementById("size");function filter(){document.querySelectorAll("figure").forEach(f=>f.hidden=size.value!=="all"&&f.dataset.width!==size.value)}size.value="'+sizes[0][0]+'";size.addEventListener("change",filter);filter();</script>');
    console.log(JSON.stringify({passed:report.passed,checks:checks.length,failed:checks.filter(c=>!c.passed),screenshots:images.length,review:path.join(out,'index.html')},null,2));
    if(!report.passed)process.exitCode=1;
  }finally{client?.close();chrome.kill();server.close();}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
