/* Local Chrome integration for strategy editing, migration and rating controls. */
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
let runner=fs.readFileSync(path.join(project,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
runner=runner.replace("await client.send('Network.enable');", "await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['https://*']});");
runner=runner.replace("(storage?'storage-scanner.html':'scanner.html')", "'army.html'");
const fixture=file=>fs.readFileSync(path.join(project,file),'utf8').trim().replace(/;$/,'');
const expression='(async()=>{const strategies=await '+fixture('tests/strategies-management-browser.js')+';const numbers=await '+fixture('tests/number-inputs-browser.js')+';return {passed:strategies.passed && numbers.passed,checks:[...strategies.checks,...numbers.checks]};})()';
runner=runner.replace("const evaluation=client.send('Runtime.evaluate'",'expression = '+JSON.stringify(expression)+";\n    const evaluation=client.send('Runtime.evaluate'");
// Exercise the browser's actual number steppers and keyboard defaults through CDP.
runner=runner.replace("if(process.argv.includes('--regions-ui')) {",'if(true) {');
runner=runner.replace("await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pointer.x0,y:pointer.y0});", "if(pointer.key){const code=pointer.key==='ArrowUp'?38:40;await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:pointer.key,code:pointer.key,windowsVirtualKeyCode:code});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:pointer.key,code:pointer.key,windowsVirtualKeyCode:code});}else {\n          await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pointer.x0,y:pointer.y0});");
runner=runner.replace("await client.send('Runtime.evaluate',{expression:'(document.getElementById(\"scanner-view\")?.contentWindow || window).DNRegionPointerDone()'});", "}\n          await client.send('Runtime.evaluate',{expression:'(document.getElementById(\"scanner-view\")?.contentWindow || window).DNRegionPointerDone()'});");
eval(runner);
