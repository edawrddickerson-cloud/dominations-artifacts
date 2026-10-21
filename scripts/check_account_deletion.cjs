/* Non-destructive deployment checks. No real bearer token is used, so no user
 * can be authenticated or deleted. Configuration and response bodies stay out
 * of output. Checks CORS, gateway configuration and runtime-key availability. */
const fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('ui/service-config.js','utf8'),context);
const config=context.window.DNServiceConfig,origin=process.argv.includes('--public')?'https://dominations-artifacts.pages.dev':'http://127.0.0.1:8765';
(async()=>{
  if(!config.supabaseUrl || !config.supabasePublishableKey)throw Error('missing-configuration');
  const url=config.supabaseUrl+'/functions/v1/delete-account';
  const request=options=>fetch(url,{...options,headers:{apikey:config.supabasePublishableKey,Origin:origin,...options.headers},signal:AbortSignal.timeout(10000)});
  const [preflight,anonymous,invalidToken,foreign]=await Promise.all([
    request({method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type'}}),
    request({method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),
    request({method:'POST',headers:{Authorization:'Bearer invalid-deployment-probe','Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE'})}),
    request({method:'GET',headers:{Origin:'https://untrusted.example.invalid'}})
  ]);
  const result={deployed:preflight.status!==404,originAllowed:preflight.status===204 && preflight.headers.get('Access-Control-Allow-Origin')===origin,
    anonymousDeletionDenied:anonymous.status===401,invalidTokenDenied:invalidToken.status===401,runtimeConfigurationAvailable:invalidToken.status!==503,foreignOriginDenied:foreign.status===403};
  console.log(JSON.stringify(result));if(!Object.values(result).every(value=>value===true))process.exitCode=1;
})().catch(()=>{console.error('The non-destructive deletion deployment check failed. No credentials or response bodies were printed.');process.exitCode=1;});
