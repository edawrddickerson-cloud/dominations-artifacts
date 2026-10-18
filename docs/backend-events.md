# Product events and crafting observations

Product events measure use of the application. Research outcomes measure explicitly confirmed crafts. They have separate consent, identifiers, schemas and storage. A PostHog scan event must never become a community crafting-frequency record.

## Event contract

The event schema is version 1. Common fields are application build, environment, page allowlist, browser family, broad device type, viewport band, opaque distinct ID, session ID and insertion ID. URLs, query strings, email, custom names, screenshots and full OCR text are excluded. Requests omit cookies and referrers. Project IP-capture settings must also be disabled before rollout.

| Event | Purpose | Properties |
| --- | --- | --- |
| `$pageview` | Consented page view; not a meaningful active-user action by itself. | Common fields. |
| `feature_used` | Navigation to a known application feature. | `feature` |
| `onboarding_step_completed` | First capture connection, saved artifact or strategy use. | `step` |
| `artifact_saved` | Successful Keep or storage save. | `source`, `action`, `count` |
| `artifact_updated` | Committed collection edit. | `source` |
| `museum_configuration_saved` | Saved strategy museum layout. | Common fields. |
| `strategy_saved` | Saved strategy or rating state. | Common fields. |
| `strategy_used` | Strategy selected in the shared selector. | `unit_count` |
| `scanner_session_started` | Screen capture connected. | `source` |
| `scan_encounter_recorded` | First result for an encounter, not each OCR attempt. | `source`, `complete`, `row_count`, `inferred_count`, `corrected` |
| `active_time_recorded` | Visible active time after a meaningful action or new encounter. | `seconds` |
| `scanner_attempt_finished` | Sampled attempt outcome and latency. | `source`, `outcome`, `duration_ms`, `ocr_ms`, `worker_calls`, `inferred_count`, `sample_rate` |
| `scanner_fields_corrected` | Accepted field changes; diagnostic purpose. | `source`, `count` |
| `capture_failed` | Permission or read-setup failure; diagnostic purpose. | `reason` |
| `cloud_sync_failed` | Workspace request failure; diagnostic purpose. | `reason` (`conflict`, `permission` or `request`) |
| `$exception` | Sanitized error type, tag and same-origin source locations. | Exception schema; no original error message. |

`artifact_saved` uses `count: 1` for individual successful saves. Direct diagnostic inventory changes or historical import operations are not necessarily equivalent to newly scanned artifacts. Keep the dashboard's action definition explicit.

`scan_encounter_recorded` is emitted once per encounter in that page session; its completeness describes the first recorded result. Use attempt metrics and research revisions for final recognition quality rather than interpreting this initial-result field as final completeness.

Routine attempt detail samples 10% of diagnostic sessions by default. Report attempt outcomes within that sample, with its denominator and source mix. Complete, partial, cancelled and failed are distinct. Rejected early speculative work remains cancelled; it does not become a failed settled read. Error reporting is rate-limited, and repeated capture failures are suppressed per reason for one minute.

Optional events are not durably retried offline. This reduces retained diagnostic data and ensures service failures cannot block the planner. Dashboards therefore measure received consented events, not a complete census of use or failures.

## Identity and active time

`identity_kind` separates `account`, `local-browser` and `diagnostic-session`. Signed-in users use an opaque account ID consistently across devices. Local-browser visitors have separate pseudonymous references and cannot be deduplicated across devices. Diagnostic-only sessions do not acquire a product identity. Do not add these populations together and label the result unique people.

Sessions expire after 30 minutes without product events, or after 24 hours. Diagnostic events and privacy-panel refreshes do not keep a product session alive. Active time accumulates only while visible and within 60 seconds of meaningful activity; time before the first action, hidden time and frozen-browser gaps are excluded. Repeated reads of an unchanged artifact do not count as new activity.

## PostHog dashboards

These dashboards are provisioned in the EU project with 20 saved insights. Every insight excludes development/test events. Account-based metrics filter `identity_kind=account`, and local-browser activity has a separate insight. The setup command and safe live report are documented in [backend setup](backend-setup.md).

| Dashboard | Insights |
| --- | --- |
| Adoption and retention | Daily/weekly/monthly unique active IDs using meaningful actions; new/returning lifecycle; first meaningful action to returning meaningful action at 1, 7 and 30 days. |
| Engagement | Sessions per active ID, summed `active_time_recorded.seconds`, feature actions, strategy use and crafting versus storage/collection activity. |
| Activation | First capture connection → first artifact saved → first strategy used, with conversion and drop-off at each step. This measures actual first actions, not a nonexistent tutorial. |
| Scanner health | Sampled complete/partial/failed/cancelled rates by source/build/browser, p50/p95 OCR and total duration, inferred-field counts, correction activity, capture failures and grouped exceptions. |

Live dashboards: [Adoption and retention](https://eu.posthog.com/project/310642/dashboard/1034554), [Engagement](https://eu.posthog.com/project/310642/dashboard/1034555), [Activation](https://eu.posthog.com/project/310642/dashboard/1034556), and [Scanner health](https://eu.posthog.com/project/310642/dashboard/1034557). They require project access. Weekly and monthly active counts use calendar buckets; they are distinct user counts within each bucket, not sums of daily counts.

Meaningful actions include feature navigation, unique scan encounters, committed artifact changes, strategy selection/saves and museum configuration saves. Exclude page views, active-time heartbeats and diagnostics from the active-user definition itself. Track unique encounter events per session for scan volume, rather than raw OCR calls. Do not estimate all-user adoption from consented telemetry without showing its coverage limitation.

## Research contract

Research uses separate IndexedDB records and Supabase tables. It requires research consent, an account and an explicitly started session. Every detected encounter begins unconfirmed. The user confirms that it is a newly generated craft; no collection signature, Keep action, pixel change or `freshCraft` recognition hint substitutes for this confirmation.

Retries update an encounter. Confirming twice remains one outcome. Separate confirmed encounters with identical perk values remain separate outcomes. Storage scans never enter the crafting queue. Reconnects and revisits are not automatically promoted to crafts. Raw inventory imports and legacy logs are not retrospectively counted.

Sessions retain build, user-reported or unknown game/event context, planned craft count, separately reported actual attempted count, encounter count and timestamps. A planned count is not an observed denominator. Outcomes preserve ordered duplicate perk rows, first structured evidence, bounded revision history, field sources, confidence, hall source, capture method, completeness and explicit retained/rejected/unknown decisions. Matching OCR cannot silently relabel a corrected field as directly read.

Only confirmed crafts are submitted. Server ingestion validates current consent, ownership, schema, original evidence, row positions and revisions. The same outcome ID/revision is idempotent; conflicting same-revision edits fail. Nested images, raw OCR and auth fields are rejected. A user cannot attach an outcome to another account's session.

Administrator-only `research_reporting` views separate qualifying complete outcomes and perk slots. Missing percentage evidence, inferred values and conflicting fields are excluded from those qualifying rows; raw incomplete outcomes remain available for coverage analysis. Sources distinguish direct readings, user corrections, inference and unknown evidence. Scanner method tags remain alongside them, so a fresh-craft level default and a range derived from colour are distinguishable from OCR observations. Keep manually corrected evidence, capture methods and selected-hall fallbacks available as separate strata. No advanced community interface or claim of representative game-wide probabilities is included.
