/* Isolated real-page purpose selection, ownership and colour checks. */
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
let runner=fs.readFileSync(path.join(project,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
runner=runner.replace("await client.send('Network.enable');", "await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['https://*']});");
const viewport=process.argv.find(arg=>arg.startsWith('--viewport='))?.slice(11);
if(viewport){if(!/^\d{3,4}x\d{3,4}$/.test(viewport))throw Error('Invalid viewport');const [width,height]=viewport.split('x').map(Number);runner=runner.replace("const origin='http://127.0.0.1:'",'await client.send("Emulation.setDeviceMetricsOverride",'+JSON.stringify({width,height,deviceScaleFactor:1,mobile:false})+');\n    const origin=\'http://127.0.0.1:\'');}
if(process.argv.includes('--trace'))runner=runner.replace("const observedRequests=[], browserErrors=[],blockedRequests=new Set();", "const observedRequests=[], browserErrors=[],blockedRequests=new Set();client.on(message=>{if(message.method==='Runtime.consoleAPICalled')console.error(message.params.args.map(arg=>arg.value).join(' '));});");
let expression='(document.getElementById("scanner-view")?.contentWindow || window).eval('+JSON.stringify(fs.readFileSync(path.join(project,process.argv.includes('--inline-edit')?'tests/scanner/inline-edit-browser.js':process.argv.includes('--target-focus')?'tests/scanner/target-focus-browser.js':process.argv.includes('--scanner-ratings')?'tests/scanner/target-ratings-browser.js':'tests/scanner/purposes-browser.js'),'utf8'))+')';
if(process.argv.includes('--preview')) {
  runner=runner.replace("(storage?'storage-scanner.html':'scanner.html')", "'ratings.html'");
  expression=`(async()=>{for(let i=0;i<200&&!document.querySelector('[data-layer="profile"]');i++)await new Promise(r=>setTimeout(r,20));[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Reject optional sharing'))?.click();const defence=DNCraftingPurposes.saveCustom({label:'Anti-Bomber Defence',category:'defensive',selections:['counter-bomber']});const id=DNCraftingPurposes.saveCustom({label:'Standard Army',category:'attacking',selections:['attack-heavy-infantry','attack-ranged-infantry'],addOns:{defensive:{source:'target',targetId:defence},economy:{source:'profile'}}});DNCraftingPurposeEditor.edit(id);return {passed:true};})()`;
  runner=runner.replace('const value=result.result.value;', "const value=result.result.value; const preview=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(root,'data/temp/named-purpose-preview.png'),Buffer.from(preview.data,'base64'));");
}
runner=runner.replace("const evaluation=client.send('Runtime.evaluate'",'expression = '+JSON.stringify(expression)+";\n    const evaluation=client.send('Runtime.evaluate'");
eval(runner);
