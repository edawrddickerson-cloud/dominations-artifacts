/* Public integration configuration. Never put privileged keys in ui/.
 * Empty project values keep all cloud/analytics connections disabled. */
window.DNServiceConfig=Object.freeze({
  build:'2026-10-30-workspace-delta',
  workspaceDeltaSaves:true,
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
  // User-authorized opt-in rollout for real-game community acceptance.
  researchEnabled:true,
  // Separate account-bound opt-in; no account is enrolled by this flag.
  ocrFeedbackEnabled:true,
  artworkMatchingEnabled:true,
  diagnosticsSampleRate:0.1,
  // PostHog Free analysis windows, not guaranteed physical-erasure deadlines.
  analyticsRetentionDays:365,
  diagnosticsRetentionDays:365,
  researchRetentionDays:730,
});
