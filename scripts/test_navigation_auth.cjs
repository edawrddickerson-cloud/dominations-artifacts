/* OAuth must leave the application frame; callback secrets remain in memory. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('ui/cloud.js','utf8');
const method=source.slice(source.indexOf('    async signInWithDiscord(){'),source.indexOf('    async signOut()'));
async function fixture(embedded,result={data:{url:'https://accounts.example/authorize'},error:null}) {
  const requests=[],redirects=[],window={};
  window.parent=embedded?{DNAppShell:{},location:{assign:url=>redirects.push(url)}}:window;
  const context={window,URL,location:{href:'https://planner.example/ui/config.html#account-privacy'},
    start:async()=>{},configured:()=>true,client:{auth:{signInWithOAuth:async request=>{requests.push(request);return result;}}},
    authenticationError:'',announce:()=>{},message:{}};
  const api=vm.runInNewContext('({'+method+'})',context);
  await api.signInWithDiscord();return {requests,redirects};
}
(async()=>{
  const shell=await fixture(true);
  assert.equal(shell.requests[0].provider,'discord');
  assert.equal(shell.requests[0].options.skipBrowserRedirect,true);
  assert.equal(shell.requests[0].options.redirectTo,'https://planner.example/ui/config.html');
  assert.deepEqual(shell.redirects,['https://accounts.example/authorize']);
  const standalone=await fixture(false);
  assert.equal(standalone.requests[0].options.skipBrowserRedirect,undefined);
  assert.equal(standalone.redirects.length,0);
  await assert.rejects(()=>fixture(true,{data:null,error:null}),/could not be started/);
  await assert.rejects(()=>fixture(true,{data:null,error:{message:'private-provider-error'}}),/could not be started/);
  console.log('Navigation OAuth: top-level Discord redirect, unchanged standalone flow, canonical callback, and failed-start handling passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
