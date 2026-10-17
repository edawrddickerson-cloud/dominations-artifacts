# Second implementation increment: dim names and signed percentages

Implemented locally after the [category-line fix](scanner-category-improvement-2026-10-16.md). Overlapping crafting row crops now separate the coloured numeric suffix from its name before focused OCR. A magnified, background-normalised view preserves faint signs and digits; uncertain fields get an alternative treatment. This reduces repeated whole-row guide reads. A failed retry retains an earlier readable name/value at its original confidence, and disagreement between readable values still requires review.

The numeric crop only locates pixels. It does not supply a percentage from colour or the perk catalogue. Existing signed syntax, confidence, qualifier, polarity, colour/tier and disagreement checks remain in force. Names-only custom boxes retain their existing scope. The field reader serves both Main and War crafting; this recording contains Main crafting only. Storage keeps its separate row-reading path.

## Same-frame measurement

Compare the saved [category-only result](scanner-video-category-after.json) with the [new result](scanner-video-percentage-after.json), using the same 24 crafting frames, labels, production controller/scorer, default fields and manual game viewport. Colour inference and automatic temporal retries are disabled. The original [pre-category baseline](scanner-video-2026-10-16-baseline.json) remains unchanged.

| Crafting measure | After category fix | After percentage fix |
| --- | ---: | ---: |
| All five names/values correct and direct | 12/24 | 23/24 |
| All labelled visible fields correct | 12/24 | 23/24 |
| Category correct | 24/24 | 24/24 |
| Row-reader valid without review | 3/24 | 9/24 |
| Valid result with incorrect names/values | 0 | 0 |
| OCR calls across the 24 frames | 610 | 407 |
| Median read duration | 928 ms | 710 ms |
| 95th percentile read duration | 1,328 ms | 1,113 ms |

Medians average the two middle samples; p95 uses nearest rank. Read duration includes the controller, comparison UI and first worker startup, excluding capture transport, initial detection and stabilisation. This is about 24% lower median duration and 33% fewer OCR calls on this run, not a measured end-to-end live latency gain. Every previously direct-correct crafting frame remains correct.

The remaining failure is the Bronze Helmet at 195 seconds: row five's very dim `-6%` is read as `-3%` with confidence 18 and a colour/tier conflict. The result requires review. Fifteen of 24 items still require review, including otherwise correct reads with weak or conflicting evidence; this change does not claim dependable unattended acceptance of 23 items.

Storage remains 10/10 direct-correct name/value sets and 9/10 correct labelled visible-field sets, with one row-reader-valid result. The existing `A.E.F.` title error remains. All 34 results and five negative/interruption probes are retained in the JSON; the sell-confirmation panel candidate remains an unresolved detection issue.

## Timed replay

The [candidate replay](scanner-video-percentage-replay.json) uses the same 156–258 second crafting sequence, 350 ms source-frame cadence, automatic reading, colour inference, comparison and logging as the [category-only replay](scanner-video-category-replay.json).

| Timed measure, out of 24 labelled encounters | After category fix | After percentage fix |
| --- | ---: | ---: |
| At least one associated completed read | 20 | 22 |
| Correct names/values, including inference | 18 | 21 |
| Correct names/values entirely direct | 9 | 21 |
| All labelled visible fields correct, including inference | 18 | 21 |
| At least one row-reader-valid result | 3 | 8 |
| Valid result with incorrect names/values | 0 | 0 |

The new run delivered 292 frames in 102.1 seconds, with at most 16 ms scheduling lag and 23 completed reads. All 21 encounters with matching stats have a matching direct read. Herodotus' Tunic at 174 seconds and Kuba Mask at 255 seconds have no associated completed read; the Bronze Helmet remains incorrect and requires review. Multiple reads can belong to one encounter.

Encounter association still uses the nearest labelled timestamp within two seconds. Exact readable encounter boundaries, real background capture, personalised collection cutoffs and duplicate/slot correctness are outside this replay. These counts do not prove a live missed-encounter rate, stale-result safety or capture-to-result latency.

## Regression checks

Geometry and reading tests cover spaced signs, a joined plus/first digit before a separate final digit, uniformly coloured backgrounds, multiple lines, physical row association and retention of earlier readable fields after an incomplete retry. Retained fields keep their original confidence; contradicting signed values still flag conflict. Recognition, reading lifecycle, scoring/comparison and reproducible video metrics pass.

The expanded real screenshot audit passes all 66 cases: 22 existing source screenshots at three scales, with every name/value set correct and all five percentages directly read in every case. Sixty-five results are confirmed, one `greenissue` image at 0.75 scale still requires review, and there are no confidently incorrect results. These are 22 source images, not 66 independent artifacts. The browser reports no external requests or errors. Before this numeric change, the corresponding audit had 61/66 entirely direct sets and 60/66 confirmed results.

## Reproduce

```powershell
node scripts/run_scanner_video_replay.js '--video=C:\Users\edwar\Videos\2026-10-16 12-32-06.mkv' --mode=baseline --report=reports/scanner-video-percentage-after.json
node scripts/run_scanner_video_replay.js '--video=C:\Users\edwar\Videos\2026-10-16 12-32-06.mkv' --mode=replay --report=reports/scanner-video-percentage-replay.json
node scripts/run_scanner_ocr_fixture.js --crafting-audit --summary
node scripts/test_scanner_regions.js
node scripts/test_scanner_recognition.js
node scripts/test_scanner_reading.js
node scripts/test_scanner_comparison.js
node scripts/test_scanner_video.js
```

For local crop diagnosis, use `--mode=percentages --times=239`; `--mode=numeric` compares magnification/contrast variants and writes text observations under ignored `data/temp`. Extracted imagery and the original recording remain local. The video and older screenshot fixtures are development evidence used while tuning; these results are not held-out accuracy guarantees or proof of automatic collection maintenance.
