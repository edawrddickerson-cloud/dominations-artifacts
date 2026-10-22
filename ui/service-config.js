/* Public integration configuration. Never put privileged keys in ui/.
 * Empty project values keep all cloud/analytics connections disabled. */
window.DNServiceConfig=Object.freeze({
  build:'2026-10-22-public-accounts-v2',
  // Local work and preview hosts stay out of production usage dashboards.
  environment:typeof location!=='undefined' && location.origin!=='https://dominations-planner.ededed84.workers.dev'?'development':'production',
  cloudEnabled:typeof location==='undefined' || location.origin==='https://dominations-planner.ededed84.workers.dev',
  // Local account testing remains restricted to the existing loopback URL.
  localCloudTesting:true,
  supabaseUrl:"https://gdzfpyrtdhzxvwcxqzdv.supabase.co",
  supabasePublishableKey:"sb_publishable_YbsuehifFCt7X9ICphAduQ_HaFzKvbd",
  posthogToken:"phc_Aj5FErPdqZLCuVzxaqV266GrjWT9cHB9gkoiaVFpWfHK",
  posthogHost:'https://eu.i.posthog.com',
  privacyContact:'ededed84@gmail.com',
  privacyReady:true,
  // Research has a separate rollout after retention and recovery checks.
  researchEnabled:false,
  // Requires the separate OCR feedback migration and consent rollout.
  ocrFeedbackEnabled:false,
  diagnosticsSampleRate:0.1,
  // PostHog Free analysis windows, not guaranteed physical-erasure deadlines.
  analyticsRetentionDays:365,
  diagnosticsRetentionDays:365,
  researchRetentionDays:730,
});
