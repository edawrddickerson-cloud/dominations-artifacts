/* Reuse the isolated local browser runner without modifying the OCR harness. */
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
let runner=fs.readFileSync(path.join(project,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
runner=runner.replace("await client.send('Network.enable');","await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['https://*']});");
const checks=fs.readFileSync(path.join(project,'tests/scanner/capture-recovery-browser.js'),'utf8');
runner=runner.replace("const evaluation=client.send('Runtime.evaluate'",'expression = \'(document.getElementById("scanner-view")?.contentWindow || window).eval(\'+JSON.stringify('+JSON.stringify(checks)+')+\')\';\n    const evaluation=client.send(\'Runtime.evaluate\'');
eval(runner);
