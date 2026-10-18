/* Security boundaries for the explicit, one-time local test-session bridge. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createBridge}=require('./local_test_session.cjs');
(async()=>{
  const root=path.resolve('data/temp/session-bridge-tests-'+crypto.randomUUID());fs.mkdirSync(path.join(root,'ui'),{recursive:true});
  const bridge=await createBridge({root,supabaseUrl:'https://test.supabase.co'});
  try {
    const file=path.join(root,'ui',bridge.url.split('/').pop()),html=fs.readFileSync(file,'utf8');
    const endpoint=html.match(/fetch\("(http:\/\/127\.0\.0\.1:\d+\/session)"/)[1];
    const nonce=html.match(/'X-DN-Test-Nonce':"([a-f0-9]+)"/)[1];
    const jwt=expiry=>['test',Buffer.from(JSON.stringify({iss:'https://test.supabase.co/auth/v1',role:'authenticated',sub:'11111111-1111-4111-8111-111111111111',exp:expiry})).toString('base64url'),'test-signature'].join('.');
    const request=(origin,secret,token)=>fetch(endpoint,{method:'POST',headers:{Origin:origin,'X-DN-Test-Nonce':secret,'Content-Type':'application/json'},body:JSON.stringify({accessToken:token})});
    const token=jwt(Math.floor(Date.now()/1000)+3600);
    assert.equal((await request('https://foreign.example',nonce,token)).status,403);
    assert.equal((await request('http://127.0.0.1:8765','incorrect',token)).status,403);
    assert.equal((await request('http://127.0.0.1:8765',nonce,jwt(1))).status,400);
    assert.equal((await request('http://127.0.0.1:8765',nonce,token)).status,200);
    const seed=JSON.parse((await bridge.session)[0][1]);assert.equal(seed.access_token,token);assert.equal(seed.refresh_token,'non-refreshable-local-browser-test');assert.equal(seed.user.email,undefined);
    assert.equal((await request('http://127.0.0.1:8765',nonce,token)).status,409);
    await bridge.close();assert.equal(fs.existsSync(file),false);
    console.log('Local session hand-off: exact origin, nonce, expiry, one-time approval, no refresh token/email and temporary-page removal passed.');
  }finally{await bridge.close();}
})().catch(()=>{console.error('Local test-session security checks failed. No session details printed.');process.exitCode=1;});
