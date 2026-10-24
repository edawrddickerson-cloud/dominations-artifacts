/* Real pages, persisted log, shared controls and responsive table layout. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {browserRun}=require('./artwork_browser.cjs');
browserRun(async({evaluate,send})=>{
 const result=await evaluate(`(async()=>{
  const checks=[],assert=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);};
  window.DNAppShell={accepts:()=>true,navigate:()=>true};
  const frame=document.createElement('iframe');frame.id='scanner-view';frame.style='width:100%;height:1600px;border:0';document.body.style='margin:0';document.body.append(frame);
  const wait=async test=>{for(let i=0;i<800;i++){if(test())return;await new Promise(ok=>setTimeout(ok,25));}throw Error('Page readiness timeout');};
  frame.src='/ui/crafting-stats.html';await wait(()=>frame.contentWindow.DNScannerCollection&&frame.contentDocument.querySelector('#crafted-log-stats'));
  const w=frame.contentWindow,d=frame.contentDocument;await w.DNServicesReady;await wait(()=>d.querySelector('#crafting-community'));
  assert('dedicated page contains personal, community and log sections',d.querySelector('#crafted-log-stats')&&d.querySelector('#crafting-community')&&d.querySelector('#scanner-item-log'));
  assert('stats page has one active navigation link',d.querySelectorAll('.site-nav a[aria-current="page"]').length===1&&d.querySelector('.site-nav a[aria-current="page"]').getAttribute('href')==='crafting-stats.html');
  const names=['Armored Car Damage','Armored Car Hitpoints','Attack Helicopter Damage','Attack Helicopter Hitpoints','APC Hitpoints'];
  for(const n of [2,3,4,5])w.DNScannerCollection.recordItem({valid:true,hall:'main',artifact:{type:'Weapon'},rows:names.map((name,i)=>({name:i<n?names[0]:name,value:i<n?11:1,known:true,hasPercent:true,level:1}))},'stats-'+n,{continuous:true,newEncounter:true,encounterId:'stats-'+n,captureMethod:'live-capture',identityEvidence:'observed-transition'});
  await w.DNScannerCollection.flush();
  const personal=d.querySelector('#crafted-log-stats'),frequencies=personal.querySelector('[data-stat-frequency]');
  assert('per-value counts replace the range',frequencies.textContent.includes('14 @ 11% (100.0%)')&&!frequencies.textContent.includes(' to '));
  const bins=personal.querySelector('[data-distribution="eleven"]');
  assert('three 11 percent rows show exact and at least rates',bins.rows[3].cells[1].textContent==='1 / 4'&&bins.rows[3].cells[3].textContent==='3 / 4');
  const repeat=personal.querySelector('[data-distribution="duplicates"]');
  assert('five copies have a per-artifact denominator',repeat.rows[3].cells[1].textContent==='1 / 4');
  const search=personal.querySelector('input[type="search"]');search.value='Armored Car Damage';search.dispatchEvent(new w.Event('input'));
  assert('personal perk search filters rows',frequencies.rows.length===1);
  search.value='';search.dispatchEvent(new w.Event('input'));frequencies.closest('table').querySelector('th button').click();
  const sorted=[...frequencies.rows].map(row=>row.cells[0].textContent);assert('table header sorts perk names',sorted.join('|')===[...sorted].sort((a,b)=>a.localeCompare(b)).join('|'));
  const hall=personal.querySelector('[data-stat-filter="hall"]');hall.value='war';hall.dispatchEvent(new w.Event('change'));assert('personal Hall filter updates distributions',bins.rows[3].cells[1].textContent==='0 / 0');hall.value='';hall.dispatchEvent(new w.Event('change'));
  const records=w.DNScannerCollection.historyItems().map(item=>({...item,startingContextSource:'craft-result-controls-v1',freshCraft:true,identityEvidence:'observed-transition'}));
  const data=w.DNCraftingCommunity.analyze(records.map(item=>w.DNCraftingCommunity.encode(item)));data.status='ready';data.updatedAt=new Date().toISOString();
  let args;w.DNCloud.communityReport=async value=>{args=value;return data;};
  const community=d.querySelector('#crafting-community');await wait(()=>!community.querySelector('[data-community-refresh]').disabled);community.querySelector('[data-community-refresh]').click();await new Promise(ok=>setTimeout(ok,0));
  assert('community renders the same per-value counts',community.querySelector('[data-community-frequency]').textContent.includes('14 @ 11% (100.0%)'));
  assert('community renders exactly three 11 percent rows',community.querySelector('[data-distribution="eleven"]').rows[3].cells[1].textContent==='1 / 4');
  const category=community.querySelector('[data-community="category"]');category.value='weapon';category.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(ok=>setTimeout(ok,0));assert('community category filter reaches the report',args.p_category==='weapon');
  const communitySearch=community.querySelector('input[type="search"]');communitySearch.value='APC';communitySearch.dispatchEvent(new w.Event('input'));assert('community search uses the same table controls',community.querySelector('[data-community-frequency]').rows.length===1);communitySearch.value='';communitySearch.dispatchEvent(new w.Event('input'));
  window.__statsFrame=frame;
  return checks;
 })()`);
 for(const width of [1440,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  const fit=await evaluate(`(()=>{const d=__statsFrame.contentDocument;return d.documentElement.scrollWidth<=__statsFrame.clientWidth+1&&[...d.querySelectorAll('input,select')].filter(n=>n.getClientRects().length).every(n=>n.getBoundingClientRect().right<=__statsFrame.clientWidth+1);})()`);
  assert(fit,'Stats controls fit '+width);
  fs.mkdirSync('data/temp/crafting-stats-previews',{recursive:true});
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('data/temp/crafting-stats-previews/'+width+'.png',Buffer.from(shot.data,'base64'));
 }
 const scanner=await evaluate(`(async()=>{const frame=__statsFrame;frame.src='/ui/scanner.html';for(let i=0;i<800;i++){if(frame.contentDocument.querySelector('#scanner-lifetime-stats')&&frame.contentWindow.DNScannerCollection)break;await new Promise(ok=>setTimeout(ok,25));}const d=frame.contentDocument;return {headlines:d.querySelectorAll('[data-crafted-stat]').length,details:!!d.querySelector('#crafted-log-stats,#crafting-community,#scanner-item-log'),count:d.querySelector('[data-crafted-stat="logged"]').textContent,link:!!d.querySelector('a[href="crafting-stats.html"]')};})()`);
 assert.equal(scanner.headlines,7);assert.equal(scanner.details,false);assert.equal(scanner.count,'4');assert(scanner.link);
 console.log('Crafting Stats page passed: '+result.length+' browser checks, desktop/mobile fit, and persisted headline-only scanner.');
}).catch(error=>{console.error(error);process.exitCode=1;});
