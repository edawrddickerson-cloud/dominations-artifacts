/* Explicit dashboards for the planner's real event contract. No custom UI.
 * Every insight excludes test/development traffic. Account adoption stays
 * separate from local-browser activity; diagnostic sessions are never users. */
const meaningful=['feature_used','artifact_saved','artifact_updated','artifact_deleted','museum_configuration_saved','strategy_saved','strategy_used','scan_encounter_recorded'];
const eventProperty=(key,value)=>({type:'event',key,operator:'exact',value:Array.isArray(value)?value:[value]});
const production=[eventProperty('environment','production')];
const account=[...production,eventProperty('identity_kind','account')];
const activeFilter={type:'hogql',key:'event IN ('+meaningful.map(event=>"'"+event+"'").join(',')+')'};
const activity=()=>({kind:'EventsNode',event:null,name:'Meaningful planner activity',math:'dau',properties:[activeFilter]});
const series=(event,math='total',extra={})=>({kind:'EventsNode',event,math,...extra});
const viz=source=>({kind:'InsightVizNode',source});
function trends(series,extra={},properties=account){return viz({kind:'TrendsQuery',dateRange:{date_from:'-30d'},interval:'day',properties,series,trendsFilter:{display:'ActionsLineGraph',showLegend:true},...extra});}
function sql(query){return {kind:'DataVisualizationNode',display:'ActionsTable',source:{kind:'HogQLQuery',query,filters:{dateRange:{date_from:'-30d'}}}};}
const where="properties.environment = 'production' AND properties.identity_kind = 'account' AND {filters}";
function insight(key,name,query,description=''){return {key,name,query,description};}
const dashboards=[
  {key:'adoption',name:'DomiNations Adoption and retention',description:'Consented production account activity. A meaningful action defines active use; page views, active-time heartbeats and diagnostics are excluded. Local browsers are shown separately.',insights:[
    insight('daily-active','Daily active accounts',trends([activity()]),'Distinct account IDs with at least one meaningful action each calendar day.'),
    insight('weekly-active','Weekly active accounts',trends([activity()],{interval:'week',dateRange:{date_from:'-12w'}}),'Distinct active account IDs per calendar week, not a sum of daily users.'),
    insight('monthly-active','Monthly active accounts',trends([activity()],{interval:'month',dateRange:{date_from:'-6m'}}),'Distinct active account IDs per calendar month.'),
    insight('lifecycle','New and returning active accounts',viz({kind:'LifecycleQuery',dateRange:{date_from:'-8w'},interval:'week',properties:account,series:[activity()],lifecycleFilter:{showLegend:true}}),'New, returning, resurrecting and dormant meaningful activity. First observed use is relative to available consented event history.'),
    insight('retention','Account retention after first meaningful use',viz({kind:'RetentionQuery',dateRange:{date_from:'-60d'},properties:account,retentionFilter:{retentionType:'retention_first_time',period:'Day',totalIntervals:31,targetEntity:{id:null,type:'events',properties:[activeFilter]},returningEntity:{id:null,type:'events',properties:[activeFilter]}}}),'First meaningful action to another meaningful action. Inspect D1, D7 and D30; recent cohorts have incomplete windows.'),
    insight('local-active','Daily active local browser IDs',trends([activity()],{},[...production,eventProperty('identity_kind','local-browser')]),'Separate browser population. These IDs cannot be deduplicated across devices and must not be added to account users as unique people.'),
  ]},
  {key:'engagement',name:'DomiNations Engagement',description:'Production account activity with 30-minute product sessions. Active seconds reflect visible use following a meaningful action; offline and blocked telemetry is incomplete.',insights:[
    insight('sessions','Product sessions per active account',sql(`SELECT toStartOfDay(timestamp) AS day, uniq(properties.$session_id) AS sessions, uniq(distinct_id) AS active_accounts, uniq(properties.$session_id) / nullIf(uniq(distinct_id), 0) AS sessions_per_active_account FROM events WHERE ${where} AND event IN (${meaningful.map(x=>"'"+x+"'").join(',')}) GROUP BY day ORDER BY day`)),
    insight('active-time','Meaningful active seconds',trends([series('active_time_recorded','sum',{math_property:'seconds'})])),
    insight('features','Feature navigation',trends([series('feature_used')],{breakdownFilter:{breakdowns:[{property:'feature',type:'event'}]}})),
    insight('scan-volume','Unique artifact encounters per scanner session',sql(`SELECT properties.source AS source, uniq(properties.$session_id) AS sessions, count() AS encounters, count() / nullIf(uniq(properties.$session_id), 0) AS encounters_per_session FROM events WHERE ${where} AND event = 'scan_encounter_recorded' GROUP BY source ORDER BY encounters DESC`),'Each encounter is emitted once. Retries are excluded; encounters are not verified newly crafted outcomes.'),
    insight('activity-mix','Crafting versus storage and collection actions',trends([series('scan_encounter_recorded','total',{name:'Crafting encounters',properties:[eventProperty('source','crafting')]}),series('scan_encounter_recorded','total',{name:'Storage encounters',properties:[eventProperty('source','storage')]}),series('artifact_updated','total',{name:'Collection edits'})])),
    insight('strategies','Strategy selection and saved configuration',trends([series('strategy_used'),series('strategy_saved'),series('museum_configuration_saved')])),
  ]},
  {key:'activation',name:'DomiNations Activation',description:'First observed real actions, not a tutorial. Product consent is required. Steps may legitimately occur in a different order, so the funnel complements individual step counts.',insights:[
    insight('activation-funnel','Capture to saved artifact to strategy use',viz({kind:'FunnelsQuery',dateRange:{date_from:'-60d'},properties:account,series:['first-capture-connected','first-artifact-saved','first-strategy-used'].map(step=>series('onboarding_step_completed','total',{name:step,properties:[eventProperty('step',step)]})),funnelsFilter:{funnelWindowInterval:30,funnelWindowIntervalUnit:'day',funnelOrderType:'ordered'}})),
    insight('activation-steps','First action milestones',trends([series('onboarding_step_completed','dau')],{breakdownFilter:{breakdowns:[{property:'step',type:'event'}]}})),
  ]},
  {key:'scanner-health',name:'DomiNations Scanner health',description:'Consented diagnostics from production, including diagnostics-only sessions. Attempt metrics are sampled by session; cancelled, partial, complete and failed outcomes remain separate. The sample denominator and sample rate are visible.',insights:[
    insight('attempts','Sampled scanner outcomes',trends([series('scanner_attempt_finished')],{breakdownFilter:{breakdowns:[{property:'outcome',type:'event'}]}},production)),
    insight('latency','OCR and total latency by source and build',sql("SELECT properties.source AS source, properties.app_build AS build, properties.browser_family AS browser, count() AS sampled_attempts, avg(toFloat(properties.sample_rate)) AS sample_rate, quantile(0.5)(toFloat(properties.ocr_ms)) AS ocr_p50_ms, quantile(0.95)(toFloat(properties.ocr_ms)) AS ocr_p95_ms, quantile(0.5)(toFloat(properties.duration_ms)) AS total_p50_ms, quantile(0.95)(toFloat(properties.duration_ms)) AS total_p95_ms FROM events WHERE properties.environment = 'production' AND {filters} AND event = 'scanner_attempt_finished' GROUP BY source, build, browser ORDER BY sampled_attempts DESC")),
    insight('inference','Inferred fields in sampled attempts',trends([series('scanner_attempt_finished','avg',{math_property:'inferred_count'})],{},production)),
    insight('corrections','Accepted field corrections',trends([series('scanner_fields_corrected','sum',{math_property:'count'})],{breakdownFilter:{breakdowns:[{property:'source',type:'event'}]}},production)),
    insight('failures','Capture and sync failures',trends([series('capture_failed'),series('cloud_sync_failed')],{breakdownFilter:{breakdowns:[{property:'reason',type:'event'}]}},production)),
    insight('exceptions','Sanitized client exceptions',trends([series('$exception')],{breakdownFilter:{breakdowns:[{property:'error_tag',type:'event'}]}},production)),
  ]},
];
module.exports={dashboards,meaningful};
