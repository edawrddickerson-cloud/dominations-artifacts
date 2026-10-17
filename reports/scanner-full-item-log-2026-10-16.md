# Full item-log review

Reviewed `artifact-perk-observations-2026-10-16.json` from Downloads, exported at `2026-10-16T19:13:11.367Z`. Original size: 8,937,131 bytes; SHA-256: `63c0110dd8b867d49b9f4f889c9d8f2299417d6c2edbd864fad647f6af3f32c6`. The original file is unchanged and remains outside the repository. The [derived JSON report](scanner-full-item-log-2026-10-16.json) contains item/row references, counts and stat distributions, without copying the original session/item IDs or images.

The export contains 176 logged encounters, 489 reads, 880 final item rows and 566 label summaries across 13 scanner sessions. All recorded items are Main Hall and all have five rows. The reads range from October 14 at 22:30 to October 15 at 22:06 UTC, before the October 16 video-driven improvements. No per-row stat-context assessments or newer field-read traces are present. These are historical observations, not a test of the current scanner.

## What the complete items show

| Recorded evidence | Count |
| --- | ---: |
| Items with all five names recognised without assumptions | 114/176 |
| Items with every name/value present, including inference | 114/176 |
| Items with all names/values recorded as direct | 38/176 |
| Direct complete sets without stored conflict/range flags | 37/176 |
| Items marked valid by the historical reader | 6/176 |
| Items missing category | 79/176 |
| Items missing a recognised star count | 21/176 |
| Recognised names without assumptions | 755/880 rows |
| Missing or unclear names | 125/880 rows |
| Numeric values recorded as direct | 599/880 rows |
| Numeric values marked inferred | 205/880 rows |
| Missing numeric values | 76/880 rows |
| Inferred values whose names were also assumed | 31/880 rows |

These are completeness and provenance counts, not independently verified accuracy. The export has no screenshots, verified labels or manual corrections. A direct number can still be wrong, and an inferred number can be correct. The 250 low-confidence rows and 215 rows without a confidence field help explain review burden; missing confidence must not be treated as high confidence.

Of the 76 missing values, 75 also lack a confident stat name. The remaining row with a known name lacks enough recorded colour/context for a unique expectation. Adding more numeric rules alone cannot recover the majority of these holes; the reader must capture or retain the correct physical row name first.

## Concrete retry failure and local fix

Export item 49 records `Invading Fighter Damage` on Main green. Its earlier presented result at `20:38:56.296Z` is `-6%` with an automatic canonical name match and OCR confidence 77. At `20:39:03.076Z`, the selected result is `-5%` with a tier conflict, and the final logged item retains that conflicting number. Both are review results.

The collector's preference treated any finite known number as equally useful, including one already marked contradictory. A regression reproduces the displacement. The local fix removes that numeric-quality credit from rows with a conflict, tier conflict or out-of-range flag. In the reproduced same-encounter case, the better earlier `-6%` stays in the item; the `-5%` read stays in raw evidence, and the item remains unconfirmed. A genuinely separate encounter still receives its own entry. This is a focused retention fix, not a general identity solution or a rewrite of the user's historical log.

## Context is useful, but its inputs also need evidence

The known starting-tier rules flag six recorded row disagreements. One is the `-5%` example, which is outside the saved Main fresh-starting set `1/6/11` regardless of colour. The other five contain legal starting values such as `+6%`, `+11%` or `-11%`, but the recorded colour is neutral. That may be a colour classification or geometry failure; text-only evidence cannot establish which signal is wrong. Automatically replacing every disagreeing number with a colour-derived value would hide that uncertainty.

On 708 rows, the recorded name, Hall, fresh-craft state and colour imply one conditional expected value. This is useful retry context, not proof that 708 rows can be accepted automatically. In particular, a guessed name cannot justify a confident sign/value. The local inference path now requires a recognised name without the `assumed` flag before supplying a missing percentage. Readable OCR values remain intact. This addresses the 31 cases of compounded name and value assumptions without claiming that their historical values were wrong.

The summary exporter previously reported the raw OCR passes and skipped final item rows whenever scans were available. That made it show zero inferred values despite 205 in the stored items. It now includes a separate `itemRecords` assessment alongside the raw-pass summary. The two layers must not be added together as independent observations.

The final items contain 132 confidently matched existing stat identities. Forty-one have additional unverified Main availability observations beyond the reviewed availability metadata, including Defender Hitpoints, Mortar Troop Hitpoints and Anti-Tank Gun Damage. These are review evidence in the JSON, not automatically confirmed pool entries or new aliases. The missing `Wall Miner Hitpoints` sign is not resolved by this file.

## Repeated entries and physical row duplicates

Thirteen groups repeat the same complete five-name/value signature in the same Hall/category. They contain 26 entries beyond one representative per group. Twenty-five adjacent entry pairs have at least three compatible ordered rows within ten seconds. These counts overlap and are identity-review candidates. They do not prove false duplicates: revisits, rerolls, distinct copies and missing/changed star evidence remain possible. Nothing was merged or deleted.

Sixty items contain the same recognised stat on two physical rows. Ordered row positions and distinct percentages must remain intact. Matching names within an item is never a reason to collapse those rows.

## What this export cannot establish

It contains crafting encounters rather than verified ownership transitions, and no equipped-slot observations, owned-item upgrade history or War crafting. Raw scan records do not contain an explicit link to the saved item ID, so chronology is a proposed association rather than proof of encounter continuity. The file also lacks image crops and the user's active comparison profile/owned cutoff, so it cannot establish pixel accuracy, current Red/Amber/Green correctness or capture-to-result latency.

The next useful data improvement is an explicit link between each raw read and its encounter, plus the recognition/capture version. Combined with field-level retention, this will let later evidence resolve uncertain names/values without joining separate artifacts. Existing historical rows remain observations; changes in values alone must not silently merge physical items or establish upgrades.

## Verification and reproduction

- The conflicting-retry regression fails before the retention fix and passes after it, preserving the bad read in diagnostics and leaving the item unconfirmed.
- Tests cover inference refusing an assumed identity, separate final-item inference summaries, duplicate encounters, export isolation, controller lifecycle and comparison gates.
- Both scanner pages pass the real browser export/evidence checks with no external requests or browser errors.
- Late timed replays are retained separately: the [production run](scanner-video-evidence-replay.json) has 10/24 encounters with directly matching stats, six row-reader-valid encounters and no valid incorrect stat sets; the [old-inference control](scanner-video-evidence-control-replay.json) has 11/24, five and zero respectively. Production delivered 255 frames with 362 ms maximum scheduling lag, versus 291 frames/320 ms in the control and 292 frames/16 ms in the earlier 21/24-direct run. Both late runs are slower; this does not isolate host load or all earlier metadata changes, and does not prove absence of a performance regression. Functional checks pass, but live throughput needs further investigation under stable conditions before claiming the earlier coverage is preserved.

The control restores inference from assumed names only in the isolated loopback response. It leaves the working production files and user's browser unchanged, and records `testVariant: allow-assumed-inference` in the report. It is not a candidate release setting.

```powershell
node scripts/audit_scanner_item_log.js '--input=C:\Users\edwar\Downloads\artifact-perk-observations-2026-10-16.json' --report=reports/scanner-full-item-log-2026-10-16.json
node scripts/test_scanner_collection.js
node scripts/test_scanner_recognition.js
node scripts/test_artifact_stat_context.js
node scripts/test_scanner_reading.js
node scripts/test_scanner_comparison.js
node scripts/run_scanner_ocr_fixture.js --stat-context --summary
node scripts/run_scanner_ocr_fixture.js --storage --stat-context --summary
node scripts/run_scanner_video_replay.js '--video=C:\Users\edwar\Videos\2026-10-16 12-32-06.mkv' --mode=replay --report=reports/scanner-video-evidence-replay.json
node scripts/run_scanner_video_replay.js '--video=C:\Users\edwar\Videos\2026-10-16 12-32-06.mkv' --mode=replay --control=allow-assumed-inference --report=reports/scanner-video-evidence-control-replay.json
```
