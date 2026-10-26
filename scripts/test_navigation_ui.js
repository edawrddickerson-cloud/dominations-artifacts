/* Real application-shell checks with external services and analytics blocked. */
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
let runner=fs.readFileSync(path.join(project,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
runner=runner.replace("await client.send('Network.enable');","await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['https://*']});");
const cleanURLs=process.argv.includes('--clean-urls'),session=process.argv.includes('--session');
const initial=session?'scanner':'council';
runner=runner.replace("(storage?'storage-scanner.html':'scanner.html')",JSON.stringify(initial+(cleanURLs?'':'.html')));
if(cleanURLs) {
  // Emulate Workers' HTML handling: .html redirects, clean paths serve HTML.
  runner=runner.replace("let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));", `const requested=new URL(req.url,'http://localhost');
    if(requested.pathname.endsWith('.html')){res.writeHead(307,{Location:requested.pathname.slice(0,-5)+requested.search}).end();return;}
    let pathname=decodeURIComponent(requested.pathname);
    if(!path.extname(pathname))pathname+='.html';
    let file=path.resolve(root,'.'+pathname);`);
}
let browserChecks=fs.readFileSync(path.join(project,session?'tests/scanner/session-browser.js':'tests/navigation-browser.js'),'utf8');
if(cleanURLs)browserChecks=browserChecks.replaceAll('.html','');
runner=runner.replace("const origin='http://127.0.0.1:'","{const [width,height]=(process.argv.find(a=>a.startsWith('--viewport='))?.slice(11)||'1440x900').split('x').map(Number);await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});}\n    const origin='http://127.0.0.1:'");
runner=runner.replace("const evaluation=client.send('Runtime.evaluate'",'expression = '+JSON.stringify(browserChecks)+";\n    const evaluation=client.send('Runtime.evaluate'");
if(process.argv.includes('--screenshot'))runner=runner.replace('if(result.exceptionDetails)',"fs.writeFileSync(path.join(root,'data/temp/navigation-'+(process.argv.find(a=>a.startsWith('--viewport='))?.slice(11)||'1440x900')+'.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));\n    if(result.exceptionDetails)");
if(cleanURLs)runner=runner.replace('browserErrors.push(message.params.exceptionDetails.text)', 'browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)');
if(cleanURLs)runner=runner.replace('if(result.exceptionDetails)', `if(observedRequests.some(request=>new URL(request.url).pathname.endsWith('.html')))throw Error('Canonical navigation requested an HTML redirect: '+JSON.stringify(observedRequests.filter(request=>new URL(request.url).pathname.endsWith('.html'))));
    if(result.exceptionDetails)`);
eval(runner);
