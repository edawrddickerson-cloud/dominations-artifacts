# OCR matching feedback

The 24 October release adds separately opted-in text evidence for Crafting Scanner and Storage Scanner. This has no dependency on analytics, scanner diagnostics, community research or private workspace backup. No account is automatically opted in.

## Opt in and test

1. Open Settings -> Account & Privacy and sign in with Discord.
2. Select **Improve OCR matching** and **Save preferences** while connected. Other sharing choices can stay off.
3. Scan fresh artifacts in either scanner. Crafting: use **Edit** in the stat table for names. Storage: edit the artifact-name field or a perk-name field. Valid inline corrections apply immediately.
4. Leave the tab open for at least a few seconds after a correction. Account & Privacy shows pending feedback/errors when needed. Upload retries on reconnect and every 30 seconds.
5. Use **Export account data** to inspect your private submitted samples. **Delete OCR feedback** removes submitted samples independently of other services and leaves the local log intact.

The checkbox is unavailable while signed out. A new account on the same browser cannot upload another account's queue or reuse its consent receipt. Each account needs an explicit server grant. After a remote consent change, save preferences again to opt in on the current device. Enabling initially requires a connection.

## Evidence model

`scanner-collection.js` remains the only canonical encounter log. Each encounter can retain six distinct observations per field, at most 42 compact entries (title plus six perk fields). This bounded journal is collected only with active local OCR consent and an account receipt. The original observed text, proposal, method, score, initial acceptance decision, field position, pass, source scanner, capture method, build, read ordinal and observation time remain independent of final canonical values. The correction controller preserves `row.raw` and records manual name provenance in both scanners. Storage artifact-title edits update the same canonical encounter.

A useful feedback projection includes unrecognized text, fuzzy suggestions and automatic matches, rejected titles, title corrections, and exact matches later corrected or replaced. Uncorrected exact matches and accepted titles are held locally as bounded candidates but not uploaded. An unchanged read deduplicates within the encounter; retries with different evidence retain their own stable observation ordinal. A later successful read attaches a `later-ocr` resolution; an explicit edit attaches `user-correction`. Neither is verified truth. A later accepted read can resolve the same earlier fuzzy proposal. Different detected encounters have distinct sample/encounter keys even when their stats and OCR are identical.

Item and writer identifiers are account-salted SHA-256 projections; raw session, item, profile and account identifiers are not included in sample JSON. A local-only owner binding prevents an account switch from projecting another account's observations; it is never included in uploaded sample JSON. Server ownership exists only in the private owner column. Images, full logs, screenshots, Discord names and authentication data are never part of the projection. URLs, email addresses, data URLs and bearer tokens are filtered. The server repeats obvious-personal-text filtering and enforces a strict field allowlist and text/type limits.

Local journals stay within the existing 5,000-item log cap; expired observations are omitted from feedback and discarded when that encounter is read again. Clear the local log to remove its retained journal. Journals and raw OCR remain excluded from private cloud history and community evidence. Local planner/log exports can contain the local diagnostic data, as before.

## Consent, retry and ownership

`ocr-feedback.js` stores only a bounded per-account upload queue and consent receipts in the optional service store. The projection considers the latest 100 touched canonical encounters per pass, so old unchanged history does not delay scanning; editing an older encounter brings it back into that bounded projection. The queue holds at most 500 samples, drains in batches of 50, removes expired entries and replaces acknowledged entries first. When 500 unsent samples are already queued, further new samples are omitted until space is available. At most six distinct observations per field are retained, so exhaustive OCR capture is not promised.

Consent changes are explicit operations, with durable operation IDs, server epochs and compare-and-set for enabling. Upload never enables consent. Lost grant responses retry the same operation. Replaying an earlier enable after withdrawal returns an obsolete receipt; it cannot restore sharing. Account-row locks serialize consent/withdrawal, and sample locks serialize concurrent revisions. User corrections cannot be erased by an older read. Concurrent different corrections at one revision remain marked conflicted/unresolved until a newer revision resolves them. Web Locks serialize same-account queue access across supported browser tabs; each operation reloads current durable state.

Withdrawal stops local collection and clears the pending queue. A durable revocation retries on reconnect, including after reload, even while local sharing is off. Until an offline withdrawal reaches the server, another already-authorized online device can still upload. Once received, withdrawal invalidates all earlier upload epochs. Received samples remain private until expiry or **Delete OCR feedback**; deletion also revokes consent. Re-enabling starts a new observation cutoff so old samples do not reappear after deletion. Minimal operation/revocation receipts persist until account deletion to defeat old request replay.

Server samples expire **90 days after observation**, independently of updates. Daily retention calls the existing crafting v2 retention wrapper, preserving 30-day workspace history and 730-day research retention. Account export contains OCR consent, operation receipts and samples alongside existing v2 fields. Foreign keys cascade all OCR data on account deletion. RLS restricts reads to the owner; all client writes use authenticated RPCs. There is no public OCR report or raw-text endpoint.

## Weekly reports

The backend now generates private weekly candidate reports each Monday at 04:00 UTC. Aggregate trends, screened proposals, reviewer decisions, approved fixtures and release references are retained long term; unreviewed text remains in the original 90-day sample store. Reports never change production matching automatically. See [Weekly OCR matching reports](ocr-weekly-reports.md) for export/review commands, screening limits and operational checks.

## Administrator review

Use the existing private database credentials and PostgreSQL tools:

```powershell
node scripts/export_ocr_feedback_review.cjs
```

This read-only administrator utility writes ignored `data/temp/ocr-feedback-review.json`. It omits account, sample, encounter and writer identifiers, groups recurring text/proposals/resolutions, and includes occurrence/encounter counts plus compact build/pass/position provenance. Raw text can still be sensitive: keep the export private. The privileged database can also inspect `public.planner_ocr_feedback_samples`; never expose that table through a public dashboard. The user-facing account export is limited to the signed-in owner's samples.

Treat every exported group as **unreviewed observations**. Keep reviewer decisions in a separate reviewed dataset; never edit raw observations to claim verification. Review repeated evidence, ambiguity and Hall/category context, and compare independent game captures or a trusted catalogue before approving a canonical correction. User and later-OCR resolutions alone are insufficient ground truth. Feedback has no images, so additional independently supplied game captures may be necessary.

For an approved error: add the original OCR string, independently verified expected canonical name, Hall/sign constraints and near-neighbor negative examples to `scripts/test_scanner_recognition.js` or a focused fixture. Make a narrow normalization/substitution or fuzzy-threshold change in `ui/scanner-recognition.js`, demonstrate that it fixes the fixture without mapping nearby valid names to the wrong perk, and run recognition, reading, scoring and relevant real-image fixtures. Catalogue-name changes require their own reviewed source. No automated training, canonical changes, or rule promotion is included.

## Deployment and rollback

`202610220002_ocr_feedback.sql` is the superseded, never-deployed preparation and must not be applied to the deployed v2 database. The compatible migration is `202610240002_ocr_matching_feedback.sql`, applied after crafting v2 and the first-contributor report migration. It renames and wraps the exact deployed export and prune functions rather than recreating their earlier definitions.

`node scripts/deploy_ocr_feedback_database.cjs --inspect` reads and checks deployed definitions before writes. `node scripts/backup_database.cjs --verify --rehearse-ocr-feedback` takes a read-only production export, checksums it, restores it into a fresh native PostgreSQL cluster and rehearses the migration against that isolated restore. `--apply --backup=.../manifest.json` requires that recent verified backup and matching rehearsal hash, saves exact export/prune rollback definitions and verifies existing planner rows are unchanged.

Disable `ocrFeedbackEnabled` and publish a matching frontend first to stop new feedback. Keep the OCR tables and consent/retention functions during a normal frontend rollback so existing samples continue to expire; preserve v2 functions. For a database rollback, export account/OCR evidence privately, restore `data/temp/ocr-feedback-rollback.sql` to reinstate the saved export/prune functions, then explicitly review the new OCR objects before removal. Do not drop tables or restore the whole production database over later account updates as part of an ordinary rollback. The verified backup is the disaster-recovery path and has the existing provider/auth-service limitations.

## Verification

- `node scripts/test_ocr_feedback.cjs`: both scanner sources, original text, exact-match corrections, retry resolution/dedup, independent encounters, bounds, purpose gating, offline reload, lost responses, account switching, stale consent and durable withdrawal.
- `node scripts/test_ocr_feedback_database.cjs`: actual PostgreSQL via PGlite, the real migrations after v2, RLS, RPC-only writes, validation, epochs, replay, conflicts, exports, deletion, retention and cascades.
- `node scripts/run_backend_browser.js --ocr-feedback --summary` at desktop and mobile widths: real opt-in, correction, withdrawal and deletion controls with isolated account transport.
- `node scripts/run_backend_browser.js --ocr-feedback-scanners --summary` at desktop/mobile widths: both real scanner controllers and inline title/perk correction paths, original exact-match evidence, independent encounter keys and independent sharing choices.
- Existing scanner capture/recognition/reading/collection, scoring/comparison, inline-edit/Keep, telemetry and backend browser regressions remain required.
- Native PostgreSQL production-backup restore and compatible-migration rehearsal supplements the disposable database tests.

Provider transport in browser tests is simulated. Live release checks cover deployed assets, anonymous API denial, database privileges, retention integration and the feature flag. No real user's consent or samples are created by release checks. Real-game testing with the user's own opt-in/login remains necessary for actual capture quality, missed panel transitions and recognition-specific edge cases. Device clock error can affect the observation cutoff/retention window; severely skewed timestamps are not accepted. Feedback cannot determine whether an uncorrected accepted match was correct.
