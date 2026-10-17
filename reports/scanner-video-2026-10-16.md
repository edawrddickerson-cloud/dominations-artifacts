# First gameplay recording: scanner development baseline

The recording reproduces practical weaknesses that the earlier screenshot audit did not expose. Crafting category detection, dim signed percentages and automatic reading across navigation deserve priority. This change adds local evidence and a repeatable harness; it does not change production recognition or establish world-class accuracy.

Subsequent implementation: [the category-line improvement](scanner-category-improvement-2026-10-16.md) and [dim signed-percentage improvement](scanner-percentage-improvement-2026-10-16.md) change production reading and record separate after measurements. The baseline below remains the original pre-fix evidence.

## Recording and labels

Original: `2026-10-16 12-32-06.mkv` in the laptop's Videos folder. Duration 297.8 seconds; recorded resolution 3440 x 1440; 138,691,069 bytes. SHA-256: `4613b9518b97bca227e5ce63970659d6c8c8a6b137257b7301d3bad76e88cf9a`. Frame rate has not been independently established.

The rightmost 880 pixels are black recording padding. Game viewport selected manually at `(188, 312, 1796, 1024)`. This selection is an evaluation input, not an achievement of automatic viewport detection. The scanner is not visible alongside the game during most item navigation, so the recording alone cannot establish what its live UI displayed.

| Approximate time | Content |
| --- | --- |
| 0-14 s | Desktop/recording setup; excluded from item labels |
| 15-55 s | Main and War hall galleries |
| 56-143 s | Stored items, Main/War, ordinary/Legendary/Mythical, five/six rows |
| 145-157 s | Benefits/menu interruptions |
| 160-256 s | Main crafting results, animations and sell confirmations |
| 259-289 s | Stored-item gallery |
| 290 s | Field Surgery Kit stored-item dialog |

[Independent development labels](../tests/scanner/video/2026-10-16.json) cover 24 crafted artifacts and 10 stored artifacts, plus five negative/interruption probes. Names, signed values, categories, Hall, stars and visible storage dice/levels were transcribed from native game-only frames before OCR. A second pixel review corrected literal War-prefixed category labels and marked four animated row-star states unlabelled. One faint level is also unlabelled. The artwork's total star count is kept separate from a temporarily invisible row star. Crafting titles identify encounters; storage titles are evaluated.

This is one development session, annotated by one reviewer. Adjacent frames and repeated rows do not increase the independent encounter count. Additional stored dialogs and the crafting result near 250 seconds remain unlabelled. A sell confirmation at 251 seconds is a negative/interruption case, not that artifact's complete label.

Original footage, extracted frames, contact sheets and the detailed indexing manifest remain under local/ignored paths. The harness serves the original read-only on loopback and uses an isolated Chrome profile with local OCR assets; it does not navigate the game or import the user's collection.

## Single-frame baseline

[Machine-readable results](scanner-video-2026-10-16-baseline.json). All frames use the production reading controller, recognizer and scoring UI. Crafting uses the default overlapping calibrated row boxes; category falls back to the production category crop. Storage uses the detected full dialog. Colour inference and automatic retries are disabled for this diagnostic run. The category preview is limited to 1280 pixels as in normal capture.

| Measure | Crafting | Storage |
| --- | ---: | ---: |
| Independently labelled items | 24 | 10 |
| Gold panel detected in game viewport | 24/24 | 10/10 |
| All names and signed values exact and direct | 12/24 | 10/10 |
| Category exact | 4/24 | 10/10 |
| Hall exact | 24/24 | 10/10 |
| All labelled visible fields exact | 3/24 | 9/10 |
| Row-reader result valid without review | 3/24 | 1/10 |
| Valid result with incorrect name/value set | 0 | 0 |

"All labelled visible fields" includes stars, category and Hall, plus storage title, known levels and dice. It excludes explicitly unlabelled star/level pixels; it is not a claim of full capture correctness for every visible field. "Valid" is the recognizer's row validation status, not permission to Keep an artifact or proof of a complete comparison decision.

Crafting matched 119/120 names (118 directly, one assumed) and 106/120 signed values directly. Storage read all 52/52 names and signed values; one stored title read `A.E.P's Trench Knife` instead of `A.E.F.'s Trench Knife`. No expected perk names were absent from the current catalogue.

Median single-frame read duration was 974 ms for crafting and 439 ms for storage; the respective 95th percentiles were 1,348 ms and 897 ms. These timings include the reading controller, comparison UI and first worker startup in each mode; later cases reuse the model. They exclude initial panel detection, capture transport, user calibration and stabilization. Some sampled frames are still animating. These timings and exactness rates must not be presented as complete live-session accuracy or capture-to-render latency.

## Timed replay

[Machine-readable replay](scanner-video-2026-10-16-replay.json) feeds 156-258 seconds of the original source at a 350 ms cadence and records scheduling lag. The production automatic reader, inference, comparison UI and item logger remain active while frames advance; OCR completion does not pause video time. The harness captures both input-frame time and read completion time, and measures the result selected by the controller after retry combination.

Encounter association is a proposal: a read is assigned to the nearest manually labelled timestamp within two seconds, then its fields are compared exactly. First-readable/last-readable boundaries are not yet labelled. A result assigned by timestamp can be incomplete or wrong; assignment never creates ground truth. The result near 250 seconds is unlabelled. Read duration is not end-to-end latency. Missing proposals and mismatched reads do not independently prove stale/mixed output.

The 102-second sequence delivered 292 frames with at most 15 ms of scheduling lag. It produced 21 completed reads associated with 18/24 labelled encounters. Six labelled encounters had no associated completed read. Of the 24 labelled encounters, 16 had a matching name/value result, but only eight did so entirely from direct reads; the other eight relied on inferred percentages. Only two had all labelled fields correct. The row reader marked two results valid; no valid result had incorrect names or percentages, but one lacked its category. This is not a complete comparison approval. These association counts need boundary annotation and capture-path coverage before they can be a definitive missed-encounter evaluation.

## Ranked failures and next work

1. **Category crop/layout.** Only 4/24 crafting categories were read in the still-frame baseline. Wrapped titles move the category line, and category icons share its OCR crop. At 161 seconds the title wraps and Armor sits close to the crop boundary. The fixed crop's clipping/context is a hypothesis to test with field evidence; do not fill the category from a perk pattern. Track and read that line independently, then measure complete score availability.
2. **Dim signed percentages.** Failures include missing green percentages and incorrect digits: -6 becomes -8 at 174 seconds, +6 becomes +5 at 204 seconds, and -6 becomes -5 at 217 seconds. These remained review results. Improve field imagery/recognition and compare direct values, signs and qualifiers; correct inferred values must remain a separate count.
3. **Animation and navigation.** The timed replay has encounters with no completed associated read. Label their exact readable intervals and inspect cancellations, settling and worker occupancy. Temporal evidence must stay within an artifact; reducing wait times alone is not an accuracy fix.
4. **Interruption gating.** Four menu/gallery probes yield no panel; the sell confirmation at 251 seconds still yields a crafting panel candidate. This is a detector candidate, not proof that a false result was accepted. Add explicit dialog/readability checks and a stale-result regression for it.
5. **Storage review burden and title evidence.** Every labelled storage name/value pair is correct, but 9/10 items request review for weak OCR evidence. Preserve that protection while testing corroboration and field-specific confidence. Catch title errors independently of row correctness.
6. **Capture geometry.** Neither detector found its panel on any of the 34 full 3440-pixel recording frames; each found every labelled panel on the 2560-pixel active desktop and game viewport. Padding changes panel width relative to the full frame. Treat this recording artifact separately from ordinary capture failures; it does not establish a fault in the user's actual shared source.

This replay uses a fresh factory profile with an empty collection. The actual user's owned-item cutoff, personalized ratings, Keep decision, duplicate-log behavior and stale/mixed-result safety have not been independently validated by this video run. There is no War crafting or held-out session. Do not replace the recognizer or loosen acceptance thresholds based on this session alone.

## Reproduce locally

Run from the repository root with Node 22+ and local Chrome. Set `CHROME_PATH` if Chrome is installed elsewhere. No ffmpeg or package installation is needed; Chrome decodes the original MKV.

```powershell
node scripts/run_scanner_video_replay.js '--video=C:\Users\edwar\Videos\2026-10-16 12-32-06.mkv' --mode=index
node scripts/run_scanner_video_replay.js '--video=C:\Users\edwar\Videos\2026-10-16 12-32-06.mkv' --mode=frames --times=161,174,204,217,251
node scripts/run_scanner_video_replay.js '--video=C:\Users\edwar\Videos\2026-10-16 12-32-06.mkv' --mode=baseline
node scripts/run_scanner_video_replay.js '--video=C:\Users\edwar\Videos\2026-10-16 12-32-06.mkv' --mode=replay
node scripts/test_scanner_video.js
```

The recording hash and game viewport must match the labels. `--times` can select baseline cases for diagnosis; that writes a subset report and must not be reported with the full denominator. `--start`, `--end` and `--interval` select replay timing. Use `--report=reports/<candidate-name>.json` to preserve the original baseline/replay JSON when comparing a candidate; default commands overwrite their report. `--mode=category --times=161,171` extracts local category crop images; `--mode=percentages --times=239` shows the numeric crops. `--mode=numeric --times=174,204` compares numeric OCR contrast/magnification variants and saves text results under `data/temp`. Pixel output is restricted to ignored `data/temp`.
