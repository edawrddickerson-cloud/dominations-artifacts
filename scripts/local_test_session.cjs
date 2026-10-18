/* Explicit, single-use loopback hand-off for read-only browser tests.
 * Reads no personal browser files. The operator approves the transfer in the
 * already authenticated app origin. Only its short-lived access token is used;
 * refresh/provider tokens, credentials and original session revocation are not
 * part of this hand-off. The caller must enforce read-only network guards. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function createBridge({root,supabaseUrl,origin='http://127.0.0.1:8765'}) {
  if(origin!=='http://127.0.0.1:8765')throw Error('Unsupported test origin');
  const nonce=crypto.randomBytes(24).toString('hex'),storageKey='sb-'+new URL(supabaseUrl).hostname.split('.')[0]+'-auth-token';
  const filename='.__dn-browser-check-'+crypto.randomBytes(12).toString('hex')+'.html';
  const file=path.join(root,'ui',filename);let claimed=false,resolveSession;
  const session=new Promise(resolve=>{resolveSession=resolve;});
  const server=http.createServer(async(request,response)=>{
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    const send=(status,body)=>response.writeHead(status,headers).end(JSON.stringify(body));
    if(request.headers.host!=='127.0.0.1:'+server.address().port || request.headers.origin!==origin)return send(403,{error:'Origin denied'});
    Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type, x-dn-test-nonce'});
    if(request.url!=='/session')return send(404,{error:'Not found'});
    if(request.method==='OPTIONS')return response.writeHead(204,headers).end();
    if(request.method!=='POST')return send(405,{error:'Method denied'});
    if(claimed)return send(409,{error:'Already connected'});
    if(request.headers['x-dn-test-nonce']!==nonce)return send(403,{error:'Connection denied'});
    try {
      const chunks=[];let bytes=0;
      for await(const chunk of request){bytes+=chunk.length;if(bytes>16384)throw Error('Request too large');chunks.push(chunk);}
      const payload=JSON.parse(Buffer.concat(chunks).toString('utf8')),token=payload.accessToken;
      if(typeof token!=='string' || token.length>15000)throw Error('Invalid session');
      const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
      if(claims.iss!==supabaseUrl.replace(/\/$/,'')+'/auth/v1' || claims.role!=='authenticated' || !/^[0-9a-f-]{36}$/i.test(claims.sub) || !Number.isFinite(claims.exp) || claims.exp*1000<Date.now()+180000)throw Error('Invalid or expiring session');
      if(claimed)return send(409,{error:'Already connected'});claimed=true;
      const value={access_token:token,refresh_token:'non-refreshable-local-browser-test',token_type:'bearer',expires_at:claims.exp,expires_in:Math.floor(claims.exp-Date.now()/1000),user:{id:claims.sub,user_metadata:{preferred_username:'Read-only browser test'}}};
      send(200,{connected:true});resolveSession([[storageKey,JSON.stringify(value)]]);
    }catch{send(400,{error:'The planner session is unavailable or near expiry. Reload the planner in this browser, then try again.'});}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const endpoint='http://127.0.0.1:'+server.address().port+'/session';
  const html=`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Connect read-only browser test</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:17px system-ui;background:#1a1d21;color:#eee;max-width:42rem;margin:8vh auto;padding:1.5rem;line-height:1.5}button{font:inherit;padding:.8rem 1.1rem;cursor:pointer}#status{white-space:pre-wrap}</style>
<h1>Connect read-only browser test</h1><p>Use the planner login already active in this browser to check cloud recovery in a separate test window.</p>
<p>The check reads your saved planner data. Collection/settings writes and account deletion are blocked. Your normal browser stays signed in. This uses a short-lived access token on this computer.</p>
<button id="connect">Connect read-only test</button><p id="status" role="status"></p>
<script>const button=document.getElementById('connect'),status=document.getElementById('status');
if(location.origin!==${JSON.stringify(origin)}){button.disabled=true;status.textContent='This page only works on the local planner.';}
button.onclick=async()=>{button.disabled=true;status.textContent='Connecting…';try{const saved=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})||'null');if(!saved?.access_token)throw Error('Open the planner in this same browser and sign in normally first, then return to this page.');
const result=await fetch(${JSON.stringify(endpoint)},{method:'POST',headers:{'Content-Type':'application/json','X-DN-Test-Nonce':${JSON.stringify(nonce)}},body:JSON.stringify({accessToken:saved.access_token}),credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});const value=await result.json();if(!result.ok)throw Error(value.error||'Connection failed.');status.textContent='Connected. The checks are running automatically. You can close this tab.';}catch(error){status.textContent=error.message;button.disabled=false;}};</script>`;
  fs.writeFileSync(file,html);
  return {url:origin+'/'+filename,session,async close(){server.close();server.closeAllConnections?.();try{fs.unlinkSync(file);}catch{}}};
}
module.exports={createBridge};
