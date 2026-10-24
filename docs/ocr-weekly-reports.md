# Weekly OCR matching reports

The backend generates private reports every Monday at **04:00 UTC** using the existing hosted `pg_cron`. No Codex session, workstation, additional capture permissions or paid model service is required. Generation never edits matching rules, canonical names, consent, telemetry or community contributions.

## Retention and privacy

Permanent records contain weekly counts, controlled dimensions, canonical target names, candidate screening results, review decisions, explicitly approved fixtures and release references. They contain no account IDs, raw sample IDs, encounter identifiers or unreviewed OCR text. Candidate UUIDs identify report entries only.

Unreviewed examples remain in `planner_ocr_feedback_samples`. Weekly review links reference those original rows instead of copying their text. The existing 90-day observation expiry, separate feedback deletion and account-deletion cascades remove those links. After expiry or deletion, a candidate can still show aggregate counts and screening results, but its unreviewed examples are unavailable. Anonymous aggregate history and already approved, safe name fixtures remain.

An administrator can deliberately retain one reviewed source/expected-name fixture by recording an approval with an independent evidence reference. Names are restricted and obvious personal/token text is rejected. An explicit approval is the boundary between an expiring observation and a permanent reviewed fixture. Merely collecting, grouping, suggesting or receiving a user correction never approves it. Existing private raw JSON exports are manual copies and need their own retention handling; the weekly export never includes unreviewed text.

## Weekly report semantics

Weeks run Monday 00:00 UTC through the following Monday. The job processes the previous closed week. A sample is included if first received or last updated in that week, using its state at report generation. A correction can therefore produce signals in a later report. Counts represent feedback samples and detected encounters, not distinct physical artifacts, representative error rates, or a complete history of every intermediate correction. Offline uploads are considered when received. Reports are immutable snapshots and repeat runs do not duplicate them.

Missed weeks are caught up from the last completed report, within the retained evidence window (12 closed weeks). The job does not invent historical text after expiration. If a gap exceeds that window, older missed periods remain unavailable rather than being reported as complete zero-error weeks. Empty weeks are retained with zero samples. Initial deployment creates the last closed week's report, which may be empty.

The report groups recurring source/target pairs privately and ranks them by occurrences and independent detected encounters. Proposals remain pending review. It screens narrow, whole-label exact-alias candidates against a checked-in snapshot of **198 canonical scanner names and 8,485 cases accepted by the real matcher**, including reviewed glyph spellings and neighboring valid names. The baseline comes from `ui/scanner-recognition.js`, `ui/scanner-name-catalog.js`, shared sign rules and the canonical factory dataset. Feedback cannot add names to that baseline.

Screening distinguishes existing matches, canonical-name collisions, competing corrections, protected-fixture regressions, unknown targets, contradictory evidence and artifact-title review. Repeated samples are a priority signal only. The result records corpus counts, potential changed canonical names, protected-case regressions, whether the existing matcher already accepts that mapping and the matcher build hash. These are exact-alias screening results, not proof of OCR accuracy or full scanner regression success. Full scanner tests remain explicitly pending until review.

A title or apparently exact valid perk misread may need capture/context work, not a global alias: mapping one valid name to another would corrupt correct reads. Such cases remain visible as collisions or title reviews.

## Export and review

Export long-term reports and approved fixtures with the existing private database credentials:

```powershell
node scripts/export_ocr_weekly_reports.cjs
node scripts/export_ocr_weekly_reports.cjs --week=2026-10-19
```

Files are written to ignored `data/temp/ocr-weekly-reports/YYYY-MM-DD.json`, with an `index.json`. The authoritative archive is `research_reporting.ocr_weekly_reports`, `ocr_weekly_candidates` and append-only `ocr_weekly_decisions` in the backend. These tables are included in the existing database backups. Only administrator/service access is allowed; no ordinary account or public endpoint can read them. No report is sent to another person or service.

Find a candidate ID in an exported report. Inspect its currently retained examples without writing another raw-text report file:

```powershell
node scripts/review_ocr_weekly_candidate.cjs --id=CANDIDATE_UUID
```

Verify a correction against independent game evidence or the reviewed catalogue. A later OCR read or a user correction alone is not verified truth. Approve, reject or request more evidence:

```powershell
node scripts/review_ocr_weekly_candidate.cjs --id=CANDIDATE_UUID --decision=approved --expected="Heavy Tank Damage" --reference="independent capture tests/scanner/example.png"
node scripts/review_ocr_weekly_candidate.cjs --id=CANDIDATE_UUID --decision=rejected --reference="conflicts with a valid neighboring name"
node scripts/review_ocr_weekly_candidate.cjs --id=CANDIDATE_UUID --decision=needs-evidence --reference="independent game capture required"
```

Approval records a permanent regression-fixture proposal; it does not activate a rule. Export again to retrieve the reviewed fixture. Add it and near-neighbor negative cases to the real recognition tests, implement a narrow normalization/matching change, and run scanner recognition, sign, reading, scoring and relevant capture fixtures. Full-image OCR failures may require separate independently supplied images. Change no canonical identities based solely on frequency.

After a separately reviewed and deployed matching change, append its Git release reference:

```powershell
node scripts/review_ocr_weekly_candidate.cjs --id=CANDIDATE_UUID --decision=released --reference=commit:FULL_40_CHARACTER_GIT_HASH
```

Release recording requires a prior approval and preserved fixture. It records the operator's reference; it does not verify the deployment or publish anything. Review history remains append-only, including later reversals. Refresh the generated baseline as part of matching changes and keep the new version tied to a reviewed migration:

```powershell
node scripts/build_ocr_weekly_names.cjs --check
```

The generator reproduces the initial migration. For later catalogue/matcher versions, create a new reviewed baseline migration rather than modifying already-deployed history.

## Deployment, checks and rollback

`202610240004_ocr_weekly_reports.sql` creates private report/review storage and functions. `202610240005_ocr_matching_names.sql` contains the reproducible baseline. `202610240006_ocr_weekly_schedule.sql` installs the named Monday cron job. The existing export, consent, feedback upload, community report and retention functions are preserved unchanged. Added sample timestamp/source-link indexes support bounded review and cascading deletion.

`node scripts/test_ocr_weekly_reports.cjs` runs the migrations in actual PostgreSQL via PGlite and verifies private access, idempotency, source minimization, collision/fixture screening, explicit approvals and release history, unchanged production rules, deletion, raw-source expiry and permanent aggregate/fixture survival. Existing OCR and community database tests cover the surrounding services.

Before production changes, inspect actual deployed functions and job/timezone metadata, take a current database backup, verify its native PostgreSQL restore, and rehearse the exact migration:

```powershell
node scripts/deploy_ocr_weekly_reports.cjs --inspect
node scripts/backup_database.cjs --verify --rehearse-ocr-weekly
node scripts/deploy_ocr_weekly_reports.cjs --apply --backup=data/temp/database-backups/BACKUP/manifest.json
node scripts/deploy_ocr_weekly_reports.cjs --test-schedule
```

Deployment requires a recent verified manifest and matching rehearsal hash. The real scheduler acceptance uses a temporary self-removing job to invoke the idempotent generator, then checks its actual run status. The regular weekly job and daily retention job remain independent. Private audit files are under `data/temp/ocr-weekly-*`.

To stop automated generation, apply ignored `data/temp/ocr-weekly-rollback.sql` (unschedules only `planner-ocr-weekly-report`). Existing reports and reviewed fixtures stay intact; the original OCR samples still expire through daily retention. Removing private report tables is a separate reviewed maintenance action after exporting their history. Do not overwrite production with an older whole-database backup as a routine rollback.
