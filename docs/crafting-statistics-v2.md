# Crafting statistics v2

Release authorized on 24 October 2026 (Malta). Both v2 migrations were applied at 2026-10-23 22:24 UTC after a fresh production backup, verified local restore and migration rehearsal against that restore. Existing account data checksums were unchanged. The live backend has all 514 rules, owner isolation, zero contribution records and zero enabled contributors. Frontend publication uses the normal `master` push and Cloudflare Workers build; The initial release left both sharing flags false; the user subsequently authorized opt-in community testing and reports from the first contributor. Research is now enabled; OCR feedback remains disabled. Real-game acceptance remains open. Deployment verification reports are kept privately under `data/temp/` and can be reproduced with `node scripts/check_crafting_v2_release.cjs --commit=RELEASE_HASH`.

The focused v1 collector/log/statistics/reading tests and isolated desktop/mobile screenshot fixtures passed before implementation. A read-only production check at 2026-10-23 20:28 UTC confirmed that deployed `scanner.html`, `scanner-collection.js`, `scanner-reading.js`, `crafted-log-stats.js` and `crafted-log-stats-ui.js` matched baseline `f2321e9`. This did not establish actual game capture behavior. The supplied baseline was on clean `master`, matching `origin/master`. No live player data was changed by the fixture tests.

## Canonical data and migration

`scanner-collection.js` still owns the only canonical encounter log. `crafting-history.js` is a pure reconciliation/serialization module; `crafting-community.js` derives a separate, consent-controlled evidence projection. Neither creates another local item store. The optional service store contains only account-bound consent operations and acknowledgements, never a second set of craft records. Old manual research sessions/confirmation controls have been removed.

Log format remains version 2 with an additive version-1 `ledger`. Visible items retain their IDs. The ledger contains an explicit legacy baseline and compact archived record facts. Clear removes detailed records/images and retains those facts, with IDs, dates, hall, Keep identity/time and three-row count. Archived IDs dominate visible records during reconciliation, so an old device cannot restore cleared detail or re-upload cleared evidence. Local diagnostic scans remain outside cloud workspaces. Full local exports/backups retain artwork and diagnostics. Reconciliation preserves local artwork and unchanged per-row diagnostic details by identity; remote artwork is never downloaded or uploaded.

Lifetime totals are the selected legacy baseline plus the union of visible and archived record IDs. Shared records count once; identical stats with different IDs count separately. Keep is sticky on reconciliation, and retries/corrections revise an ID with a logical revision and writer identity. Concurrent different content at the same revision is excluded from community metrics until an explicit correction resolves it; Keep/name/context metadata updates do not clear that uncertainty. Deterministic writer ordering selects the private record, independent of device clocks. Weekly totals count dated records since Monday 00:00 UTC, excluding undated legacy totals. Crafts since Keep use the latest recorded Keep time and subsequent encounter times. A legacy counter baseline identifies the records already covered by the saved counter, so keeping an older artifact in v1 does not require inventing a Keep timestamp or recounting later visible artifacts. Different overlapping legacy counter baselines require the existing version choice. Historical weekly breakdowns cannot be reconstructed from an undated baseline. Device clock error can affect chronological statistics, but not lifetime union counts.

An old snapshot's archived counts are preserved without inventing historical records. Exact copies of a legacy snapshot share a deterministic baseline identity derived from archived counters and retained IDs. Different nonzero baseline identities have unknown overlap: automatic reconciliation stops, and the account/browser version choice selects the authoritative baseline. It does **not** sum baselines or take the larger total. Record identities still reconcile. This conservative choice can require reviewing older backups; missing history is not recoverable from totals alone.

New encounters retain capture provenance and identity uncertainty. Initial capture is ambiguous. A later observed panel transition supplies encounter evidence, not proof of an actual craft. A nonadjacent exact revisit is marked `possible-revisit`; it remains a separate private record but is excluded from community metrics. Adjacent identical independent encounters retain separate IDs. No pixel/stat equality rule deduplicates private records. Capture can miss an instantaneous identical craft with no observable transition: live acceptance must assess this limitation.

## Private synchronization

Private structured history is an additive `craftingLog` field in the existing version-1 workspace envelope. The 16 MB workspace cap still applies. New clients read old workspaces without claiming an account lifetime total; the comparison dialog shows **Not recorded** for these versions. New backups expose their actual reconciled total. Choosing an older backup for the same account preserves local history; adopting another account does not silently carry over the previous account's history. Explicitly choosing browser data authorizes the existing account-linking flow.

For a linked account with identical planner settings/collections, history changes reconcile automatically. Planner conflicts still require the existing saved-version choice; history is reconciled when choosing either version. Durable recovery snapshots precede replacement. Revision CAS and operation IDs handle concurrent devices, reconnect and lost success responses. The new `planner_save_workspace_v2` wrapper checks the expected account against `auth.uid()` to reject an SDK session switch during a request. RLS continues to isolate private workspaces. Private uploads do not depend on analytics, diagnostics or research consent.

No deployment or migration is performed by the app. With these files installed against the old backend, the new private-save RPC is absent and backups remain pending locally until the migration is applied. Local scanning, exports and saving continue.

## Community evidence and consent

The independent research preference requires the new `2026-10-23` research consent policy. Old manual-session consent does not carry over. New explicit opt-in obtains a durable account-specific epoch and operation receipt. Uploads never re-enable consent on reconnect. Withdrawal queues while offline, removes evidence on reconnect and invalidates existing device epochs. Lost consent responses reuse the same operation ID; replaying an old enable operation after withdrawal does not re-enable sharing. A newly signed-in account never inherits another account's receipt. A revoked device must explicitly review/toggle sharing again before contributing. The `researchEnabled` flag is now true for the user-authorized opt-in real-game rollout.

An evidence record contains a stable encounter ID, logical revision/writer, observation timestamp, deletion marker, hall/category, a verified crafting-event ID or null, an exclusion reason, and ordered canonical perk/signed starting-value pairs when eligible. It excludes images, raw OCR, artifact/profile names, Discord identifiers, inventory decisions and account identity. Ownership is attached on the server from the verified session solely for secure updates, access isolation, export and deletion. Anonymous/authenticated reporting exposes aggregates only; private evidence has owner-only read access and RPC-only writes.

Contributions include unkept/discarded observations. Incomplete, inferred, upgraded, unsupported-range, conflicting and identity-uncertain records remain in the recorded count with exclusion reasons, rather than silently becoming negative rolls. Cleared records submit irreversible tombstones and leave the current community sample. Retention is 730 days from observation, not last retry. Expired or undated evidence cannot be retransmitted as new. Minimal consent operation receipts persist until account deletion to prevent replay of an old opt-in. Withdrawal deletes all evidence and preserves the private workspace. Existing account export, research deletion, account deletion cascade and retention hooks include v2. Existing historical manual research is not mixed into new reports.

## Metric definitions

All metrics are observed sample frequencies, not established game probabilities. **Crafts recorded** counts nondeleted contributed encounters, including excluded reads; it does not count all crafts by all players. Reports start with one opted-in contributing account, as requested for real-game testing. Empty filtered samples show no crafts recorded. Reports expose aggregates, never account IDs or individual histories; there is no minimum-population anonymity guarantee.

Eligibility requires live capture, observed-transition identity, independently read crafting-result controls, a fresh-craft context, five complete direct/corrected level-1 rows, no inference/conflict, and reviewed canonical signed ranges. `crafting-result-context.js` verifies both **Sell for** and **Continue** in a bounded crop below the benefits panel. Crafting mode's default level 1 is insufficient: older/mode-only records remain excluded. A separate local OCR worker runs only when signed-in research opt-in and the live feature flag are both enabled; it never blocks score publication, owns at most one active and one pending crop, rejects owner changes and retains no raw text. Speculative reads use the controls crop captured after the full settling gate. Row evidence changes invalidate prior control evidence until rechecked; explicit corrections of the same capture retain it. Local images, missing/cropped controls, unsupported languages/layouts and upgraded/current rows remain excluded. Current values are never converted backwards into starting rolls. Real-game validation must verify this control classifier on unseen crafting, inventory and upgrade screens before enabling contributions; a client assertion is still observational evidence, not an anti-cheat guarantee.

| Metric | Numerator | Denominator |
| --- | --- | --- |
| Starting rows at 11% | Eligible starting rows with signed magnitude 11 | Rows in complete eligible artifacts whose reviewed starting range contains magnitude 11 |
| At least one starting 11% | Eligible artifacts with one or more magnitude-11 rows | Eligible artifacts with at least one row capable of a starting magnitude-11 roll |
| At least two starting 11% | Eligible artifacts with two or more magnitude-11 rows | Same artifact denominator as above, including artifacts with only one eligible row |
| Repeated canonical perk | Eligible artifacts with a canonical perk in at least two positions | All complete eligible artifacts with five reviewed starting rows, including ranges without 11 |

Repeated perk positions remain separate in the row denominator. Signed -11 counts only for a perk with a reviewed negative starting range; +11 is invalid for that perk. Main ordinary percent ranges are signed magnitudes 1/6/11, War ordinary ranges 1/3/6. War does not acquire an 11% denominator. Named/Legendary/Mythical, unknown units/availability and nonstandard ranges stay excluded until independently reviewed. The versioned registry is generated from the existing reviewed stat-context dataset by `build_crafting_community_rules.cjs`; SQL validates submitted canonical names and signed values against that registry. Range overrides require a reviewed dataset change and a new reproducible rules version, never an inference from observed frequencies.

Each proportion includes the numerator, denominator, rate and 95% Wilson interval. Intervals are conditional sample summaries; row intervals assume independent rows and do not model within-artifact/account clustering, selection bias, missed crafts or OCR error. Excluding incomplete/uncertain/unsupported records may bias all denominators. Reports show excluded counts/reasons, the rules version and update status; per-row and per-artifact denominators are never interchanged.

Hall/category filters are structured. Crafting events remain Unknown unless matched to a reviewed dataset and registered server context. Game-version identification is permanently outside scope: there is no game-version filter or contribution field. The reporting endpoint accepts hall, category and event only. The old endpoint ignores its obsolete version argument for cached-client compatibility. Existing private-backup placeholders remain readable; no version identification or collection is implemented or planned.

## Configuration and rollout

1. Complete v1 acceptance on the actual deployed build: automatic logging of several crafts, retries on one craft, Keep, reopen and full export; confirm totals and IDs. Verify the deployment's actual files/commit first. Local screenshot fixtures alone do not close this gate.
2. Retain an independent full planner backup and server backup before any live migration. For this local implementation the user declined preserving the personal 363 count; all migration tests used disposable fixtures with that count instead.
3. Review and explicitly authorize applying `202610230001_crafting_statistics_v2.sql` and `202610230002_crafting_starting_rules.sql` after the existing base backend. The v2 wrappers preserve the deployed export/deletion/retention implementations; the separate OCR migration is not required and remains unapplied in production. Both v2 migrations have now been authorized and applied. No new secret or privileged browser key is required. The existing Supabase publishable client and Auth/RLS boundary remain in use.
4. Apply migrations to staging first. Verify the new private-save wrapper, real account isolation, two live devices, offline reconnect, lost responses, account switching, old backup restoration, clearing, and account export/deletion. Test old clients before rollout: they ignore the additive history field and can overwrite a workspace without it, so retire stale cached clients before enabling cross-device history. Recovery snapshots preserve prior versions; the new client must re-upload its local history after such an old-client write.
5. Publish only with explicit authorization. Verify cache-busted script versions and HTML are coherent. Repeat desktop/mobile scanner and account fixtures. Private backups are available without any optional sharing.
6. The user has authorized enabling opt-in research for real-game testing and lowering the reporting threshold to one contributor. Apply `202610240001_community_first_contributor.sql`, then publish the enabled configuration. Each account must still explicitly select the current research policy; existing manual consent remains insufficient. Real-game acceptance continues during this rollout.

Existing `planner_prune_expired_data` scheduling remains in place. The v2 migration renames the prior implementation and delegates to it, preserving existing OCR/research cleanup. Verify the cron job still invokes the public wrapper after migration. Operations receipts are intentionally not pruned while their account exists. Provider snapshots and the three workspace recovery versions follow the existing backend/backup policies; direct contribution tables are deleted on withdrawal. Local planner safety backups remain on the device until separately removed.

## Rollback

Disable `researchEnabled` first and stop new client publication. Export affected account workspaces, private log ledgers and community evidence before schema rollback. Revert client assets together; an old client can read log version 2 but ignores the additive ledger, so do not clear/re-save migrated history from an old scanner and expect archived identities to survive. Restore from the independent full backup or latest recovery copy if required. Keep the new tables and private-save wrapper during an initial client rollback; dropping them is a separate authorized maintenance step. To remove the migration, restore the prior export/delete/prune wrappers (including OCR changes), revoke new RPC access, and then drop only v2-specific objects. Do not silently delete cloud history or rewrite baselines. Image cloud sync and the shared artwork catalog remain outside this scope.

## Verification

Pure/SQL checks:

```
node scripts/test_crafting_v2.cjs
node scripts/test_crafting_v2_database.cjs
node scripts/build_crafting_community_rules.cjs --check
node scripts/test_backend_core.js
node scripts/test_backend_database.cjs
node scripts/test_local_backup.js
node scripts/test_scanner_collection.js
node scripts/test_scanner_logging.js
node scripts/test_crafted_log_stats.cjs
node scripts/test_scanner_reading.js
node scripts/test_scanner_recognition.js
node scripts/test_scanner_comparison.js
node scripts/test_strategy_scanner.js
node scripts/test_scanner_speculation.js
node scripts/test_scanner_worker_readiness.js
```

The SQL fixture executes actual migrations and RLS in disposable PGlite, using the repository's existing `data/temp/backend-tests/node_modules/@electric-sql/pglite` dependency. It never connects to production. Install that test dependency separately if absent.

Browser checks use isolated profiles and a stub account transport; aggregate calculations and access rules are tested against actual SQL separately:

```
node scripts/run_crafting_v2_browser.cjs --summary --report
node scripts/run_crafting_v2_browser.cjs --summary --report --viewport=390x844
node scripts/run_backend_browser.js --summary
node scripts/run_backend_browser.js --summary --viewport=390x844
node scripts/run_scanner_ocr_fixture.js --crafting-stats --summary --report
node scripts/run_scanner_ocr_fixture.js --crafting-stats --summary --report --viewport=390x844
node scripts/run_scanner_ocr_fixture.js --glance --viewport=1440x900 --summary
node scripts/run_scanner_ocr_fixture.js --provisional-colours --summary
```

V2 previews and JSON reports go to `data/temp/crafting-v2-previews/`. Real-game capture and actual deployed Supabase acceptance remain separate release gates.
