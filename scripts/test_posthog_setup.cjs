/* Administrative boundaries: no cross-project requests or accidental changes
 * to unrelated dashboards; invalid queries must stop all provisioning writes. */
const assert=require('node:assert/strict');
const {client}=require('./posthog_api.cjs');
const {provision,verifyProject,audit,tag}=require('./setup_posthog.cjs');
const {dashboards,meaningful}=require('./posthog_dashboards.cjs');
function fixture(){
  const rows={dashboards:[{id:900,name:'Unrelated dashboard',tags:[]}],insights:[{id:901,name:'Unrelated insight',tags:[],dashboards:[900]}]};
  const writes=[];let next=1,invalidQuery=false;
  const api={base:'/api/projects/123/',host:'https://eu.posthog.com',project:'123',async list(resource){return structuredClone(rows[resource]);},async request(route,options={}){
    if(route.endsWith('/query/')){if(invalidQuery)throw Error('Invalid test query');return {results:[]};}
    if(route===api.base)return {api_token:'phc_test',...options.body};
    const [,resource,id]=route.slice(api.base.length).match(/^(dashboards|insights)\/(\d+)?/);
    assert(['POST','PATCH'].includes(options.method));writes.push({resource,id,body:options.body});
    let row=id?rows[resource].find(row=>row.id===Number(id)):null;
    if(!row){row={id:next++};rows[resource].push(row);}
    Object.assign(row,structuredClone(options.body));return structuredClone(row);
  }};
  return {api,rows,writes,failQuery(){invalidQuery=true;}};
}
(async()=>{
  assert.equal(meaningful.includes('$pageview'),false);assert.equal(meaningful.includes('active_time_recorded'),false);assert.equal(meaningful.includes('scanner_attempt_finished'),false);
  for(const dashboard of dashboards)for(const insight of dashboard.insights){
    const query=insight.query.source;
    if(query.kind==='HogQLQuery'){assert(query.query.includes("properties.environment = 'production'"));assert(query.query.includes('{filters}'));}
    else assert(query.properties.some(p=>p.key==='environment' && p.value.includes('production')));
  }
  const test=fixture();
  await verifyProject(test.api,{posthogToken:'phc_test'});
  await assert.rejects(verifyProject(test.api,{posthogToken:'phc_other'}),/does not match/);
  const project={anonymize_ips:true,autocapture_opt_out:true};
  await provision(test.api,{project,apply:true});
  assert.equal(test.rows.dashboards.length,5);assert.equal(test.rows.insights.length,21);
  const managedInsight=test.rows.insights.find(row=>row.tags.includes(tag('insight','daily-active')));managedInsight.dashboards.push(900);
  await provision(test.api,{project,apply:true});
  assert.equal(test.rows.dashboards.length,5,'repeat setup must not duplicate dashboards');assert.equal(test.rows.insights.length,21,'repeat setup must not duplicate insights');
  assert(managedInsight.dashboards.includes(900),'existing links are preserved');
  assert.equal(test.rows.dashboards[0].name,'Unrelated dashboard');assert.equal(test.rows.insights[0].name,'Unrelated insight');
  assert.equal((await audit(test.api)).insights,20);
  const linked=managedInsight.dashboards;managedInsight.dashboards=[900];await assert.rejects(audit(test.api),/audit failed/);managedInsight.dashboards=linked;
  const filters=managedInsight.query.source.properties;managedInsight.query.source.properties=[];await assert.rejects(audit(test.api),/audit failed/);managedInsight.query.source.properties=filters;
  const invalid=fixture();invalid.failQuery();await assert.rejects(provision(invalid.api,{project,apply:true}),/could not validate/);assert.equal(invalid.writes.length,0);
  const duplicate=fixture();duplicate.rows.dashboards.push({id:902,tags:[tag('dashboard','adoption')]},{id:903,tags:[tag('dashboard','adoption')]});await assert.rejects(provision(duplicate.api,{project,apply:true}),/Duplicate/);assert.equal(duplicate.writes.length,0);
  let requests=0;
  const transport=client({host:'https://eu.posthog.com',project:'123',key:'phx_private'},async()=>{requests++;return new Response(JSON.stringify({detail:'phx_private must never be printed'}),{status:403});});
  await assert.rejects(transport.request('https://foreign.example/api/projects/123/'),/escaped/);
  await assert.rejects(transport.request('/api/projects/456/'),/escaped/);assert.equal(requests,0);
  await assert.rejects(transport.request('/api/projects/123/'),error=>error.message.includes('HTTP 403') && !error.message.includes('phx_private'));
  const scoped=client({host:'https://eu.posthog.com',project:'123',key:'phx_private'},async()=>Response.json({detail:'Missing required scope project:read; phx_private must never be printed'},{status:403}));
  await assert.rejects(scoped.request('/api/projects/123/'),error=>error.message.includes('project:read') && !error.message.includes('phx_private'));
  console.log('PostHog setup: production filters, meaningful-user definition, token/project binding, query validation before writes, repeat-safe resources, unrelated-data preservation and credential-safe transport passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
