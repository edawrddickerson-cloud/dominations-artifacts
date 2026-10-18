/* Run before navigation and optional services on the OAuth return page.
 * Keep the one-time PKCE code in memory only; remove auth parameters before
 * any telemetry or other application scripts can observe the return URL. */
(() => {
  'use strict';
  const url=new URL(location.href),fragment=new URLSearchParams(url.hash.slice(1));
  const keys=['code','error','error_code','error_description','state','access_token','refresh_token','provider_token','provider_refresh_token','token_type','expires_in','expires_at'];
  const found=keys.some(key=>url.searchParams.has(key) || fragment.has(key));
  if(!found)return;
  const code=url.searchParams.get('code');
  const failed=['error','error_code','error_description','access_token','refresh_token'].some(key=>url.searchParams.has(key) || fragment.has(key));
  window.DNOAuthReturn={code:!failed && code && code.length<=4096?code:null,error:failed || !code || code.length>4096};
  for(const key of keys)url.searchParams.delete(key);
  url.hash='account-privacy';
  history.replaceState(history.state,'',url.pathname+url.search+url.hash);
})();
