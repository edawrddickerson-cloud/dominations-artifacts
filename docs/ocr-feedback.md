# OCR improvement feedback

The existing **Crafted item log → Scanner diagnostics** remains a local diagnostic view. Remote OCR evidence uses a separate **Improve OCR matching** choice in Account & Privacy. General analytics/diagnostics consent does not enable it. The release configuration keeps `ocrFeedbackEnabled: false`; this work does not deploy the migration, enable sharing or upload the supplied export.

## Evidence contract

Text-only samples contain one unrecognized or fuzzy-matched label, the proposed canonical name and match score, an eventual user-entered correction, field position, hall/category and scanner build. Rejected title text is retained even when it could not become the item name. Missing titles without OCR text cannot produce text training evidence. Exact accepted perk matches are skipped. Obvious URLs, email addresses, data URLs and bearer text are excluded by the client. No artwork, screenshots, full logs, profile names, account names or game version enter samples. Event identification remains deferred to local data.

Samples are linked privately to the authenticated account for ownership/export/deletion. Deterministic opaque sample IDs derive from account + canonical log item + field, so retries update a sample and manual corrections revise the same evidence. Corrections are user-reported evidence, not verified ground truth; matching/catalog changes still require review. PostHog receives none of this raw text.

The sender reads compact projections of the same canonical item log, not a second crafted-history store. It creates no optional queue before OCR opt-in, rollout readiness and sign-in. A durable per-account IndexedDB queue holds at most 500 recent field samples, submits batches of up to 50, recovers offline, and cancels pending work on withdrawal. Auth changes cannot transfer an old account's pending samples to another account. Withdrawal clears the pending local queue and revokes server consent; already received samples can be deleted separately in Account & Privacy. Failed revocation retries on reconnect. Local crafted logs remain intact.

## Backend and rollout

`supabase/migrations/202610220002_ocr_feedback.sql` adds owner-restricted consent and sample tables, bounded validation, RPC-only writes, retry upserts, correction precedence, separate deletion, account-export fields and account-deletion cascades. It extends the existing daily prune function to remove active samples older than 90 days since their last actual update. There are no anonymous or public sample reads. Administrative review uses the private table; account IDs must be omitted from extracted matching datasets.

Before enabling the flag on a deployed site, apply this migration through the existing migration workflow and verify the export/deletion and daily maintenance paths against the deployed backend. The existing daily job calls the same prune function. The feedback choice stays hidden until the flag is enabled. Cropped-image sharing is not implemented or covered by the text-only consent; adding it requires a separate contract and explicit choice.

An administrative review query, without owner IDs:

```sql
select data->>'kind' as kind,
       data->>'observed_text' as observed_text,
       data->>'matched_name' as matched_name,
       data->>'match_score' as match_score,
       data->>'corrected_name' as corrected_name,
       data->>'hall' as hall,
       data->>'category' as category,
       data->>'app_build' as app_build
from public.planner_ocr_feedback_samples
order by updated_at desc;
```

## Checks

- `node scripts/test_ocr_feedback.cjs`: purpose separation, minimization, retries, corrections, offline recovery, auth changes, withdrawal and batching.
- `node scripts/test_ocr_feedback_database.cjs`: real embedded PostgreSQL migration, RLS/grants, validation, consent enforcement, export/deletion, retention and cascade behavior.
- `node scripts/run_backend_browser.js --ocr-feedback --summary`: real checkbox/save flow, automatic collection after opt-in, correction upload, withdrawal and separate deletion, using the test backend.
- Existing scanner, logging, Keep, telemetry and account browser checks cover the surrounding behavior.
