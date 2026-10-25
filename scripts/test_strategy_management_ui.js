/* Current target-management UI and native number controls. The retired Army
 * editor's model remains covered by test_strategies.js. */
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
let runner=fs.readFileSync(path.join(project,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
runner=runner.replace("await client.send('Network.enable');", "await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['https://*']});");
const fixture=file=>fs.readFileSync(path.join(project,file),'utf8').trim().replace(/;$/,'');
// Native pointer checks run before the target fixture changes profiles/navigation.
const scenario='(async()=>{const numbers=await '+fixture('tests/number-inputs-browser.js')+';const targets=await '+fixture('tests/scanner/purposes-browser.js')+';return {passed:targets.passed && numbers.passed,checks:[...numbers.checks,...Object.entries(targets.checks).map(([name,passed])=>({name,passed}))]};})()';
const expression='(document.getElementById("scanner-view")?.contentWindow || window).eval('+JSON.stringify(scenario)+')';
runner=runner.replace("const evaluation=client.send('Runtime.evaluate'",'expression = '+JSON.stringify(expression)+";\n    const evaluation=client.send('Runtime.evaluate'");
// Exercise the browser's actual number steppers and keyboard defaults through CDP.
runner=runner.replace("if(process.argv.includes('--regions-ui')) {",'if(true) {');
const pointerStart="await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pointer.x0+offset.x,y:pointer.y0+offset.y});";
if(!runner.includes(pointerStart))throw Error('Scanner fixture pointer hook changed; update the numeric-input wrapper.');
runner=runner.replace(pointerStart, "if(pointer.key){const code=pointer.key==='ArrowUp'?38:40;await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:pointer.key,code:pointer.key,windowsVirtualKeyCode:code});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:pointer.key,code:pointer.key,windowsVirtualKeyCode:code});}else {\n          "+pointerStart);
runner=runner.replace("await client.send('Runtime.evaluate',{expression:'(document.getElementById(\"scanner-view\")?.contentWindow || window).DNRegionPointerDone()'});", "}\n          await client.send('Runtime.evaluate',{expression:'(document.getElementById(\"scanner-view\")?.contentWindow || window).DNRegionPointerDone()'});");
eval(runner);
