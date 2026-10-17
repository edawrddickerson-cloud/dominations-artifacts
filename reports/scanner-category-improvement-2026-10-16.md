# First implementation increment: automatic crafting category capture

Implemented locally after the gameplay baseline. The reader now locates the green category line above the benefits panel and separates its text from the adjacent category icon before OCR. Wrapped artifact titles no longer dictate a fixed category crop. Header text that is too high or title-sized is rejected as category evidence. Existing saved category boxes continue to work.

This improves the automatic category input used by the crafting comparison. It preserves the confidence thresholds, name/sign validation, keeper rules and collection/import behavior. It does not yet automate owned-item persistence or slot recognition.

## Same-frame before/after measurement

Original: [baseline](scanner-video-2026-10-16-baseline.json). Candidate: [all 34 labelled frames](scanner-video-category-after.json). Both use the same original video, reviewed labels, manual game viewport, production reading controller, default crafting field boxes, local OCR assets and factory scoring profile. Colour inference and automatic retries are disabled in these diagnostic still-frame runs.

| Crafting measure | Before | After |
| --- | ---: | ---: |
| Category correct | 4/24 | 24/24 |
| All labelled visible fields correct | 3/24 | 12/24 |
| All five names/values correct and direct | 12/24 | 12/24 |
| Row-reader valid without review | 3/24 | 3/24 |
| Valid result with incorrect name/value set | 0 | 0 |

The completeness gain comes from reading missing categories, rather than inferring more stats or relaxing review. Signed-percentage errors and weak row evidence still prevent many complete/accepted results. Category reads in these 24 development frames have OCR confidence 93-96; these scores are supporting evidence, not calibrated probabilities.

Median crafting read duration was 974 ms before and 913 ms after; the respective 95th percentiles were 1,348 ms and 1,328 ms. This is a modest timing change, with the primary gain in metadata completeness. Timings include worker startup for the first case in each mode and UI comparison, but exclude detection, capture transport and stabilization. They do not meet or establish the proposed 300-500 ms end-to-end target.

Storage retains its baseline results: all 52 names/values across ten items are direct and correct; nine items have all labelled fields correct, with the existing Trench Knife title error remaining. One item is valid without row review. Storage category extraction uses its own existing path.

"All labelled visible fields" excludes the explicitly unlabelled animated star pixels and one unreadable storage level. The video is development evidence used to tune this change, not an independent holdout. A manually supplied game viewport bypasses source discovery. These measurements do not establish account-wide collection correctness, slot identity or world-class accuracy.

## Timed check

The [candidate replay](scanner-video-category-replay.json) repeats the original 156-258 second crafting sequence with automatic reading, inference, comparison and logging enabled at a 350 ms source-frame cadence. The [original replay](scanner-video-2026-10-16-replay.json) remains unchanged. Compare directly read results separately from matching inferred values.

| Timed crafting measure, out of 24 labelled encounters | Before | After |
| --- | ---: | ---: |
| At least one associated completed read | 18 | 20 |
| Matching names/values, including inference | 16 | 18 |
| Matching names/values entirely direct | 8 | 9 |
| All labelled fields match, including inference | 2 | 18 |
| At least one row-reader valid result | 2 | 3 |
| Valid result with incorrect names/values | 0 | 0 |

The after replay delivered 292 frames over 102.1 seconds, with at most 16 ms scheduling lag. Four labelled encounters still had no associated completed read. Nine of the 18 matching stat sets relied on inferred percentages; the category gain must not be reported as 18 fully direct captures or 18 accepted results.

Encounter association still uses the nearest manually labelled timestamp within two seconds. Precise readable boundaries, capture chooser behavior, duplicate-log correctness, actual user-profile recommendations and held-out sessions remain outside this check. Faster category processing can change whether a read finishes before navigation; report encounter counts without treating them as a precise live miss rate or capture-to-render latency.

## Verification

- Parser/geometry regressions cover wrapped titles, separate icon groups, multiple-word War labels, absent categories, large title text, cyan titles and unchanged strict category confidence.
- Reading lifecycle, calibration/field geometry, scoring/comparison and video-evidence checks pass.
- The real calibrated category/Hall screenshot check passes with no external requests or browser errors.
- Both scanner pages reference the updated shared recognizer with a new cache version.

Reproduce the after measurements without overwriting the original baseline:

```powershell
node scripts/run_scanner_video_replay.js '--video=C:\Users\edwar\Videos\2026-10-16 12-32-06.mkv' --mode=baseline --report=reports/scanner-video-category-after.json
node scripts/run_scanner_video_replay.js '--video=C:\Users\edwar\Videos\2026-10-16 12-32-06.mkv' --mode=replay --report=reports/scanner-video-category-replay.json
node scripts/test_scanner_recognition.js
node scripts/test_scanner_reading.js
node scripts/test_scanner_regions.js
node scripts/test_scanner_comparison.js
node scripts/test_scanner_video.js
```

Next focused reading increment: improve direct extraction of dim signed percentages, especially the existing -6/-8 and +6/+5 failures and missing green suffixes. Keep whole-item exactness, inference counts, wrong acceptance and timing visible when evaluating that change.
