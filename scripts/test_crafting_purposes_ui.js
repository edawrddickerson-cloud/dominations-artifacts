/* Isolated real-page purpose selection, ownership and colour checks. */
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
let runner=fs.readFileSync(path.join(project,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
runner=runner.replace("await client.send('Network.enable');", "await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['https://*']});");
if(process.argv.includes('--trace'))runner=runner.replace("const observedRequests=[], browserErrors=[],blockedRequests=new Set();", "const observedRequests=[], browserErrors=[],blockedRequests=new Set();client.on(message=>{if(message.method==='Runtime.consoleAPICalled')console.error(message.params.args.map(arg=>arg.value).join(' '));});");
let expression='(document.getElementById("scanner-view")?.contentWindow || window).eval('+JSON.stringify(fs.readFileSync(path.join(project,'tests/scanner/purposes-browser.js'),'utf8'))+')';
if(process.argv.includes('--preview')) {
  runner=runner.replace("(storage?'storage-scanner.html':'scanner.html')", "'ratings.html'");
  expression=`(async()=>{for(let i=0;i<200&&!document.querySelector('[data-layer="profile"]');i++)await new Promise(r=>setTimeout(r,20));[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Reject optional sharing'))?.click();const defence=DNCraftingPurposes.saveCustom({label:'Anti-Bomber Defence',category:'defensive',selections:['counter-bomber']});const id=DNCraftingPurposes.saveCustom({label:'Standard Army',category:'attacking',selections:['attack-heavy-infantry','attack-ranged-infantry'],addOns:{defensive:{source:'target',targetId:defence},economy:{source:'profile'}}});DNCraftingPurposeEditor.edit(id);return {passed:true};})()`;
  runner=runner.replace('const value=result.result.value;', "const value=result.result.value; const preview=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(root,'data/temp/named-purpose-preview.png'),Buffer.from(preview.data,'base64'));");
}
runner=runner.replace("const evaluation=client.send('Runtime.evaluate'",'expression = '+JSON.stringify(expression)+";\n    const evaluation=client.send('Runtime.evaluate'");
eval(runner);
