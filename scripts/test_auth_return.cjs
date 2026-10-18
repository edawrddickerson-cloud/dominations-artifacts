/* Callback privacy checks; no real OAuth requests or credentials. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('ui/auth-return.js','utf8');
function callback(href) {
  const context={window:{},URL,URLSearchParams,location:{href},history:{state:null,replaceState(state,title,url){context.cleaned=url;}}};
  vm.runInNewContext(script,context);return context;
}
const valid=callback('https://planner.example/ui/config.html?code=one-time-test-code&view=accounts#account-privacy');
assert.equal(valid.window.DNOAuthReturn.code,'one-time-test-code');assert.equal(valid.window.DNOAuthReturn.error,false);
assert.equal(valid.cleaned,'/ui/config.html?view=accounts#account-privacy');
const cancelled=callback('https://planner.example/config.html?error=access_denied&error_description=private-provider-detail');
assert.equal(cancelled.window.DNOAuthReturn.error,true);assert.equal(cancelled.window.DNOAuthReturn.code,null);assert.equal(cancelled.cleaned,'/config.html#account-privacy');
assert(!JSON.stringify(cancelled.window).includes('private-provider-detail'));
const legacy=callback('https://planner.example/config.html#access_token=private-token&refresh_token=private-refresh&provider_token=private-provider');
assert.equal(legacy.window.DNOAuthReturn.error,true);assert.equal(legacy.cleaned,'/config.html#account-privacy');assert(!JSON.stringify(legacy.window).includes('private-token'));
assert.equal(callback('https://planner.example/config.html?code='+ 'x'.repeat(4097)).window.DNOAuthReturn.error,true);
assert.equal(callback('https://planner.example/config.html#account-privacy').cleaned,undefined);
const html=fs.readFileSync('ui/config.html','utf8');
assert(html.indexOf('name="referrer"')<html.indexOf('auth-return.js'));
assert(html.indexOf('auth-return.js')<html.indexOf('navigation.js'),'the callback is scrubbed before normal application scripts');
console.log('OAuth return: PKCE code capture, early URL cleanup, cancelled/invalid callback handling and implicit-token rejection passed.');
