const {browserRun}=require('./artwork_browser.cjs');
browserRun(async({evaluate})=>{
 const result=await evaluate(`(async()=>{
  const check=(name,ok)=>{if(!ok)throw Error(name);};
  window.DN={esc:String};window.DNServiceConfig={};window.DNIntegrationCore={privacyReady:()=>false};window.DNConsent={get:()=>({}),subscribe:()=>{}};
  const summary=n=>({artifacts:0,profiles:1,targets:0,lifetimeCraftsLogged:n,updatedAt:null});
  const subscribers=[];let comparison={owner:'test',revision:1,localHash:'local',remoteHash:'old',local:summary(525),cloud:summary(1000)},state={status:'remote',comparison},applied=null,finish;
  window.DNCloud={user:()=>({id:'test'}),state:()=>state,subscribe:fn=>subscribers.push(fn),async choose(choice,expected){check('account choice uses refreshed comparison',choice==='cloud'&&expected.revision===2&&expected.remoteHash==='new');await new Promise(resolve=>finish=resolve);applied=2020;state={status:'synced'};for(const fn of subscribers)fn(state);return {reload:false};}};
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/ui/services-ui.js';script.onload=resolve;script.onerror=reject;document.head.append(script);});
  const dialog=document.querySelector('[data-cloud-choice]');check('comparison opens',dialog.open);
  comparison={...comparison,revision:2,remoteHash:'new',cloud:summary(2020)};state={status:'remote',comparison};for(const fn of subscribers)fn(state);
  const lifetime=[...dialog.querySelectorAll('tbody tr')].find(row=>row.cells[0].textContent==='Lifetime crafts logged');check('open comparison updates the account total',lifetime.cells[1].textContent==='2,020');
  dialog.querySelector('[data-use-cloud]').click();check('choice shows loading progress',dialog.querySelector('[data-choice-progress]').textContent.includes('Loading account data'));
  finish();for(let i=0;i<20&&dialog.open;i++)await new Promise(resolve=>setTimeout(resolve,10));
  check('successful account choice closes the popup',!dialog.open&&dialog.hidden&&applied===2020);check('choice has no stale-version error',!dialog.querySelector('[data-choice-error]').textContent);
  return 'Open dialog refreshes to 2,020, submits the refreshed comparison, shows progress and closes after successful application.';
 })()`);console.log(result);
}).catch(error=>{console.error(error);process.exitCode=1;});
