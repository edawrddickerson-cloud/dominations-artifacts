/* Reuses the existing isolated Chrome harness. Test providers never use live keys. */
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(project,'tests/backend-sdk-fixture.js'),'utf8');
const configuration='window.DNServiceConfig='+JSON.stringify({build:'backend-browser-test',environment:'test',cloudEnabled:true,supabaseUrl:'https://test-project.supabase.co',supabasePublishableKey:'sb_publishable_test',posthogToken:'phc_test',posthogHost:'https://eu.i.posthog.com',privacyReady:true,researchEnabled:true,privacyContact:'privacy@example.invalid',analyticsRetentionDays:365,diagnosticsRetentionDays:365,researchRetentionDays:730,diagnosticsSampleRate:1})+';';
let runner=fs.readFileSync(path.join(project,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
runner=runner.replace('fs.readFile(file, (error, data) => {',"if(file===path.join(root,'ui/service-config.js')){res.setHeader('Content-Type','text/javascript');res.end("+JSON.stringify(configuration)+");return;}\n    fs.readFile(file, (error, data) => {");
runner=runner.replace("await client.send('Network.enable');","await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['*://static.cloudflareinsights.com/*','*://static.wikia.nocookie.net/*','*://cdn.jsdelivr.net/*','*://*.supabase.co/*','*://eu.i.posthog.com/*']});");
const viewport=process.argv.find(arg=>arg.startsWith('--viewport='))?.slice(11) || '1440x900';
if(!/^\d{3,4}x\d{3,4}$/.test(viewport))throw Error('Invalid viewport');
const [width,height]=viewport.split('x').map(Number);
runner=runner.replace("await client.send('Page.enable');","await client.send('Page.enable');await client.send('Page.addScriptToEvaluateOnNewDocument',{source:"+JSON.stringify(fixture)+"});await client.send('Emulation.setDeviceMetricsOverride',"+JSON.stringify({width,height,deviceScaleFactor:1,mobile:false})+");");
runner=runner.replace("const evaluation=client.send('Runtime.evaluate'",'expression = '+JSON.stringify(fs.readFileSync(path.join(project,'tests/backend-browser.js'),'utf8'))+";\n    const evaluation=client.send('Runtime.evaluate'");
if(process.argv.includes('--screenshots'))runner=runner.replace('const result=await evaluation;',"const result=await evaluation;const shot=await client.send('Page.captureScreenshot',{format:'png'});fs.mkdirSync(path.join(root,'data/temp/backend-previews'),{recursive:true});fs.writeFileSync(path.join(root,'data/temp/backend-previews/account-"+viewport+".png'),Buffer.from(shot.data,'base64'));");
if(process.argv.includes('--report'))runner=runner.replace('const summary={passed:value.passed',"fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports/backend-browser-"+viewport+".json'),JSON.stringify({passed:value.passed,ui:value.ui,limitations:value.limitations,network:{external:value.network.externalRequests.length,errors:value.network.browserErrors}},null,2));const summary={passed:value.passed");
eval(runner);
