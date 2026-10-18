/* Public integration configuration. Never put privileged keys in ui/.
 * Empty project values keep all cloud/analytics connections disabled. */
window.DNServiceConfig=Object.freeze({
  build:'2026-10-18-services-v1',
  environment:'development',
  cloudEnabled:false,
  // Only the local operator's test URL can use this account switch.
  // Public cloud accounts remain disabled until their rollout checks pass.
  localCloudTesting:true,
  supabaseUrl:"https://gdzfpyrtdhzxvwcxqzdv.supabase.co",
  supabasePublishableKey:"sb_publishable_YbsuehifFCt7X9ICphAduQ_HaFzKvbd",
  posthogToken:"phc_Aj5FErPdqZLCuVzxaqV266GrjWT9cHB9gkoiaVFpWfHK",
  posthogHost:'https://eu.i.posthog.com',
  privacyContact:'ededed84@gmail.com',
  privacyReady:true,
  // Research has a separate rollout after retention and recovery checks.
  researchEnabled:false,
  diagnosticsSampleRate:0.1,
  // PostHog Free analysis windows, not guaranteed physical-erasure deadlines.
  analyticsRetentionDays:365,
  diagnosticsRetentionDays:365,
  researchRetentionDays:730,
});
