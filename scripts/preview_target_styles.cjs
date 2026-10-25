/* Local visual studies from the actual target editor. No production routes are changed. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'data/temp/target-styles');
const studies=[['current','Current','Current design baseline'],['bronze','Bronze','Warm charcoal, bronze edges and framed panels'],['slate','Slate','Cool graphite, softer gold and flat panels'],['workbench','Workbench','Compact spacing, wider workspace and more visible ratings']];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function connect(url){return new Promise((resolve,reject)=>{
  const socket=new WebSocket(url),pending=new Map(),listeners=[];let id=0;
  socket.addEventListener('error',reject);
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method)listeners.forEach(fn=>fn(message));const request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);}});
  socket.addEventListener('open',()=>resolve({close:()=>socket.close(),on:fn=>listeners.push(fn),send(method,params={}){return new Promise((resolve,reject)=>{const next=++id,timer=setTimeout(()=>{pending.delete(next);reject(Error('CDP timeout: '+method));},30000);pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));});}}));
});}
async function main(){
  fs.mkdirSync(out,{recursive:true});
  const server=http.createServer((request,response)=>{
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>{if(error){response.writeHead(404).end();return;}response.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');response.end(data);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,profile=fs.mkdtempSync(path.join(os.tmpdir(),'dn-target-styles-'));
  const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let client;const errors=[],checks=[];
  function check(name,passed,details){checks.push({name,passed:!!passed,...(details?{details}: {})});}
  try{
    let port;for(let n=0;n<100;n++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await delay(100);}}
    if(!port)throw Error('Chrome did not start');
    client=await connect((await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(tab=>tab.type==='page').webSocketDebuggerUrl);
    client.on(message=>{if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);});
    await client.send('Network.enable');await client.send('Network.setBlockedURLs',{urls:['https://*']});await client.send('Runtime.enable');await client.send('Page.enable');
    const evaluate=async expression=>{const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
    async function wait(expression){for(let n=0;n<150;n++){if(await evaluate(expression))return;await delay(100);}throw Error('Readiness timeout: '+expression);}
    const child=code=>'(document.getElementById("scanner-view").contentWindow).eval('+JSON.stringify(code)+')';
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await client.send('Page.navigate',{url:origin+'/ui/scanner.html'});
    await wait("document.getElementById('scanner-view')?.contentDocument?.getElementById('scanner-names')?.children.length>0");
    await evaluate(child(fs.readFileSync(path.join(root,'tests/design/seed-browser.js'),'utf8')));
    await evaluate(child("DNCraftingPurposes.saveCustom({label:'Air and tanks',category:'attacking',perks:['Heavy Tank Damage','Fighter Damage']});DNCraftingPurposes.saveCustom({label:'Tower defence',category:'defensive',perks:['Tower Damage','Tower Hitpoints']});DNCraftingPurposes.saveCustom({label:'Resource gathering',category:'economy',perks:['All Resources Looted']});"));
    await client.send('Page.navigate',{url:origin+'/ui/ratings.html'});
    await wait("!!document.getElementById('scanner-view')?.contentDocument?.querySelector('[data-purpose-name]')");
    await delay(200);
    for(const category of ['attacking','defensive','economy']){
      await evaluate(child(`(()=>{const target=DNCraftingPurposes.settings().customPurposes.find(target=>target.category===${JSON.stringify(category)});DNCraftingPurposeEditor.edit(target.id);scrollTo(0,0);})()`));
      await delay(80);
      const snapshot=await evaluate(`(()=>{
        function snapshot(doc){
          const copy=doc.cloneNode(true);
          copy.querySelectorAll('script').forEach(node=>node.remove());
          const sourceInputs=[...doc.querySelectorAll('input')];
          [...copy.querySelectorAll('input')].forEach((input,index)=>{const source=sourceInputs[index];input.setAttribute('value',source.value);source.checked?input.setAttribute('checked',''):input.removeAttribute('checked');});
          const sourceSelects=[...doc.querySelectorAll('select')];
          [...copy.querySelectorAll('select')].forEach((select,index)=>[...select.options].forEach(option=>{option.value===sourceSelects[index].value?option.setAttribute('selected',''):option.removeAttribute('selected');}));
          const base=copy.createElement('base');base.href='/ui/';copy.head.prepend(base);
          const style=copy.createElement('link');style.rel='stylesheet';style.href='/tests/design/target-styles/variants.css';copy.head.append(style);
          const policy=copy.createElement('meta');policy.httpEquiv='Content-Security-Policy';policy.content="default-src 'self' data:; script-src 'none'; connect-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'none'";copy.head.prepend(policy);
          return copy;
        }
        const content=document.getElementById('scanner-view').contentDocument;
        const shellCopy=snapshot(document),contentCopy=snapshot(content);
        shellCopy.getElementById('scanner-view').setAttribute('src','/data/temp/target-styles/content-${category}.html');
        return {shell:'<!doctype html>'+shellCopy.documentElement.outerHTML,content:'<!doctype html>'+contentCopy.documentElement.outerHTML,signature:[...content.querySelectorAll('[data-purpose-stat]')].map(node=>node.dataset.purposeStat),target:content.querySelector('[data-purpose-name]').value};
      })()`);
      fs.writeFileSync(path.join(out,'shell-'+category+'.html'),snapshot.shell);
      fs.writeFileSync(path.join(out,'content-'+category+'.html'),snapshot.content);
      check(category+' snapshot has named sample target',!!snapshot.target,snapshot.target);
      check(category+' snapshot excludes application scripts',!snapshot.content.includes('<script')&&!snapshot.shell.includes('<script'));
    }
    fs.copyFileSync(path.join(root,'tests/design/target-styles/viewer.html'),path.join(out,'index.html'));
    for(const [width,height]of [[1440,1000],[390,844]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await client.send('Page.navigate',{url:origin+'/data/temp/target-styles/shell-attacking.html'});
      await wait("document.getElementById('scanner-view')?.contentDocument?.readyState==='complete'&&!!document.getElementById('scanner-view').contentDocument.querySelector('[data-purpose-name]')");
      let original;
      for(const [style]of studies){
        const details=await evaluate(`(async()=>{
          const doc=document.getElementById('scanner-view').contentDocument;
          document.documentElement.dataset.targetStyle=${JSON.stringify(style)};doc.documentElement.dataset.targetStyle=${JSON.stringify(style)};
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const controls=[...doc.querySelectorAll('input')].map(input=>[input.type,input.value,input.checked]);
          const current=document.querySelector('.site-nav [aria-current="page"]');if(innerWidth<900)current?.scrollIntoView({block:'nearest',inline:'nearest'});
          const styles=doc.defaultView.getComputedStyle(doc.documentElement);
          return {overflow:doc.documentElement.scrollWidth>doc.defaultView.innerWidth+1||document.documentElement.scrollWidth>innerWidth+1,controls,main:doc.querySelectorAll('main,[role="main"]').length,tokens:Object.fromEntries(['bg','panel','text','muted','accent','control-edge'].map(name=>[name,styles.getPropertyValue('--'+name).trim()])),frame:document.getElementById('scanner-view').getBoundingClientRect().toJSON()};
        })()`);
        original??=JSON.stringify(details.controls);
        check(style+' '+width+' preserves fields and selections',original===JSON.stringify(details.controls));
        check(style+' '+width+' reflows without document overflow',!details.overflow);
        check(style+' '+width+' main landmark',details.main===1);
        const lum=hex=>{const channels=hex.slice(1).match(/../g).map(channel=>parseInt(channel,16)/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
        for(const [fg,bg,minimum]of [['text','panel',4.5],['muted','panel',4.5],['accent','bg',4.5],['control-edge','panel',3]]){const a=lum(details.tokens[fg]),b=lum(details.tokens[bg]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);check(style+' '+width+' '+fg+'/'+bg+' contrast',ratio>=minimum,ratio.toFixed(2));}
        fs.writeFileSync(path.join(out,style+'-'+width+'.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
        if(width===1440){const clip=details.frame;fs.writeFileSync(path.join(out,style+'-detail.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png',clip:{x:clip.x,y:clip.y,width:clip.width,height:clip.height,scale:1}})).data,'base64'));}
      }
    }
    fs.writeFileSync(path.join(out,'compare.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Compare target styles</title><link rel="stylesheet" href="/ui/styles.css"><link rel="stylesheet" href="/tests/design/target-styles/viewer.css"></head><body><main class="compare-page"><div class="compare-heading"><h1>Collection Targets · Style studies</h1><a href="index.html">Open preview</a><span>Sample data</span></div><div class="compare-grid">'+studies.map(([id,name,description])=>'<figure><h2><a href="index.html?style='+id+'">'+name+'</a></h2><p>'+description+'</p><a href="index.html?style='+id+'"><img src="'+id+'-detail.png" alt="'+name+' Collection Targets"></a><p><a href="'+id+'-1440.png">Desktop</a> · <a href="'+id+'-390.png">Phone</a></p></figure>').join('')+'</div></main></body></html>');
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
    await client.send('Page.navigate',{url:origin+'/data/temp/target-styles/index.html'});
    await wait("document.getElementById('preview')?.contentDocument?.getElementById('scanner-view')?.contentDocument?.documentElement.dataset.targetStyle==='bronze'");
    check('Viewer changes style',await evaluate("document.querySelector('[data-style=slate]').click();document.getElementById('preview').contentDocument.getElementById('scanner-view').contentDocument.documentElement.dataset.targetStyle==='slate'"));
    await evaluate("document.getElementById('category').value='economy';document.getElementById('category').dispatchEvent(new Event('change'));");
    await wait("document.getElementById('preview')?.contentDocument?.getElementById('scanner-view')?.contentDocument?.querySelector('[data-purpose-name]')?.value==='Resource gathering'");
    check('Viewer changes category without application scripts',true);
    await evaluate("document.getElementById('viewport').value='390';document.getElementById('viewport').dispatchEvent(new Event('change'));");
    check('Viewer offers real phone viewport',await evaluate("document.getElementById('preview').contentWindow.innerWidth===390"));
    check('No browser errors',errors.length===0,errors);
    const report={passed:checks.every(check=>check.passed),checks,screenshots:8,contentPreviews:4,source:'Rendered production editor with disposable sample data; application scripts removed from preview snapshots'};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({passed:report.passed,checks:checks.length,failed:checks.filter(check=>!check.passed),review:path.join(out,'index.html')},null,2));
    if(!report.passed)process.exitCode=1;
  }finally{client?.close();chrome.kill();server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
