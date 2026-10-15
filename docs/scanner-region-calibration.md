# Crafting scanner field calibration and benchmark

Authority: User-approved field calibration plan, 14 October 2026.
Ownership: Crafting scanner only; existing ratings, manual corrections, collection comparison and storage scanner remain authoritative.
Invariants: Pixels stay local and temporary. Only one coordinate template persists in this browser. Uncertain signs and contradictory evidence remain reviewable. No commit, push or deployment is included.

## Use the feature

Open **Crafting Scanner → Scanner setup**, connect the game or load a local screenshot, then select **Calibrate Fields** after the gold panel is found. The editor pauses reading on a frozen frame.

Choose each row's name, signed percentage and star, plus optional Category and Hall colour fields. Draw a box, drag its interior to move it, or drag a corner to resize it. Numeric inputs provide precise keyboard editing. Every selected field has a crop preview. Include the full sign and percent character; leave room for tall letters, long names and multi-digit percentages. Category/Hall coordinates can extend outside the panel. For Hall colour, sample a plain part of the Artifact Benefits ribbon: **red = Main, blue = War**. Existing saved coordinates remain usable. With no Hall box, the scanner samples the ribbon inside the anchored panel. An unclear or mixed colour retains the manually selected Hall.

**Save Field Boxes** stores one template in this browser. **Cancel** keeps the previous saved template. **Reset Saved Boxes** removes it. **Use saved field boxes** switches between calibrated and standard recognition. Screenshots are never persisted by calibration.

Boxes are relative to the detected panel and follow supported translation and uniform resizing. A panel aspect change greater than 8%, an invalid box, or an out-of-source crop requests recalibration and uses standard recognition. A missing panel anchor pauses reads. This is gold-panel tracking, not recognition of arbitrary game layouts.

Names and percentages are read independently and associated by row index; duplicates and locked rows remain separate. Wide percentage crops first locate their numeric suffix within that same crop, then use a character-restricted OCR pass. Narrow crops go directly to percentage OCR. Stars use yellow-pixel analysis. The existing name catalogue, polarity rules, hall classification and scorer remain authoritative. Weak fields get a bounded colour retry and, when needed, a standard recognition fallback. Contradictory field, hall or star evidence cannot become confirmed merely because the fallback succeeds. Stat crops retain the existing three-frame median filtering, and label changes participate in frame-change detection.

## What the measurements establish

### Category and hall correction, 14 October 2026

Category OCR isolates green lettering, accepts a clear category word even when the adjacent icon lowers overall line confidence, and retries with normal contrast or sparse text if the first pass does not identify a type. It still rejects competing category types. Crafting hall detection uses ribbon colour rather than OCR labels or percentage tiers, before applying percentage inference. Standard fallback retains the calibrated colour and a clear calibrated category.

The actual `Screenshot 2026-10-14 203330.png` is copied locally as `tests/scanner/calibration-203330.png`. Chrome OCR verified Pottery using the broad Category bounds shown there, and Main using the small red Hall patch even with War selected beforehand. The same screenshot also verifies the automatic ribbon sample without a Hall box. A synthetic blue patch verifies the War mapping; this is not an independently captured War artifact. The calibration UI regression also passed. Run `node scripts/run_scanner_ocr_fixture.js --crafting-metadata --report --summary` to reproduce the metadata checks. The older accuracy measurements below describe the earlier implementation.

**There is no evidence of a substantial accuracy gain on the available sample.** The standard scanner already gets all eight selected artifacts' stats and stars correct after its bounded internal retries. Broad saved boxes preserve that result but are slower and need more internal work. One manually tightened full screenshot also succeeds, without fallback; one example cannot establish an improvement.

The baseline was recorded before changing recognition behavior. Both paths use the same original screenshots, existing independently transcribed name/value labels, catalogue mapping and inference setting. Star counts were checked visually: one filled star except `review-225540`, which has two. The selected originals cover dimmed/locked rows, duplicate perks, long names, negative cost and Invading effects, and 1/6/11 percentage tiers. They are a targeted convenience sample, not a representative accuracy dataset.

Seven screenshots contain only the benefits panel: they have **no category or hall pixels**. Only `pic1` supports a complete five-name, five-value, category and five-star correctness measurement. Do not count the cropped images as complete-artifact successes. The broad-template test uses the same panel-relative stat/star geometry across the eight images; category is enabled only for the full screenshot. The separate tight test uses hand-selected bounds in `tests/scanner/pic1.regions.json`, without deriving boxes from OCR output.

“First call” below means one completed `recognize()` call, including its internal retries/fallback. “Initial pass” excludes those retries. Browser-controller second attempts, live-source latency and background reliability are outside this benchmark.

| Measurement | Standard baseline | Broad saved boxes |
| --- | ---: | ---: |
| Names correct, completed first call | 40/40 (100%) | 40/40 (100%) |
| Signed percentages correct, completed first call | 40/40 (100%) | 40/40 (100%) |
| Directly read percentages in final result | 40/40 (100%) | 40/40 (100%) |
| Inferred percentages in final result | 0/40 | 0/40 |
| Star states correct | 40/40 (100%) | 40/40 (100%) |
| All five stats and stars correct, completed first call | 8/8 (100%) | 8/8 (100%) |
| Category correct, completed first call | 1/1 | 1/1 |
| Complete artifact correct, completed first call | 1/1 | 1/1 |
| Names correct, initial pass | 40/40 (100%) | 39/40 (97.5%) |
| Signed percentages correct, initial pass | 37/40 (92.5%) | 37/40 (92.5%) |
| All five stats correct, initial pass | 6/8 (75%) | 6/8 (75%) |
| Complete artifact correct, initial pass | 1/1 | 0/1 |
| Calls needing internal retry/fallback | 2/8 (25%) | 3/8 (37.5%) |
| Calls needing standard fallback | — | 2/8 (25%) |
| Missing / extra / misassigned rows in final result | 0 / 0 / 0 | 0 / 0 / 0 |
| Confidently incorrect final stat results | 0/8 | 0/8 |
| OCR worker recognition calls, total | 15 | 135 |
| Mean warm first-call latency | 262 ms | 584 ms |
| Warm latency range | 173–428 ms | 390–974 ms |

`pic1` with manually tightened fields: **5/5 names, 5/5 direct signed percentages, 5/5 star states and category correct**, one completed and confirmed read, no retry/fallback, 11 worker calls, 185 ms warm latency. The baseline on that same image was 209 ms and two worker calls. These single-run timings do not establish a speed improvement. Timing runs used Chrome 153 on this development machine, with model initialization warmed separately and benchmark paths run sequentially; timings will vary.

The observed bottleneck is layout variability: percentages sit directly after names instead of in a fixed column. Broad boxes accommodate different names but require extra suffix localization and can retain dim-text ambiguity. Tight percentage boxes are effective for the selected artifact but can miss the percentage when the next name is longer or shorter. The broad category box also needed standard fallback on `pic1`; its tight category crop worked. Calibration is therefore optional, and the standard scanner remains the initial path until a user saves boxes.

## Verification

Passed the scanner capture, recognition, reading, frame, collection and comparison suites, plus the new `test_scanner_regions.js` suite. New checks cover normalized transforms, malformed templates, persistence failures, external-label clipping, row association, missing signs, contradictory crops, frozen snapshots, median input, geometry changes during OCR, lost anchors, cleanup and conflicts surviving standard fallback. Syntax checks passed for the changed scanner modules.

Actual Chrome UI tests passed at **1440×900 and 480×640**. They use real CDP pointer events to draw/move/resize boxes, numeric editing, save/cancel/reset, persisted coordinates, actual field OCR/scoring, 0.8× moved/resized source images, incompatible aspect fallback, missing-anchor pause and Stop cleanup. The standard crafting smoke test and storage scanner's real five/six-row OCR/UI harness also passed. The crafting smoke test's obsolete colour-badge assertion was updated to check colour evidence while preserving the previously requested compact stat display.

The UI screenshots and JSON results are under `tests/scanner/regions-ui-*`. All observed browser/worker traffic for these tests was local GET traffic; no external requests, non-GET requests or JavaScript exceptions were observed. These observations cover the exercised paths.

## Reproduce

Node 22+, local Chrome and the existing vendored OCR assets are required. Set `CHROME_PATH` if necessary. Run from the repository root:

```powershell
node scripts/test_scanner_regions.js
node scripts/test_scanner_capture.js
node scripts/test_scanner_recognition.js
node scripts/test_scanner_reading.js
node scripts/test_scanner_frames.js
node scripts/test_scanner_collection.js
node scripts/test_scanner_comparison.js
node scripts/run_scanner_ocr_fixture.js --regions-benchmark --baseline --report --summary
node scripts/run_scanner_ocr_fixture.js --regions-benchmark --report --summary
node scripts/run_scanner_ocr_fixture.js --regions-benchmark --regions-tight --report --summary
node scripts/run_scanner_ocr_fixture.js --regions-ui --viewport=1440x900 --report --summary
node scripts/run_scanner_ocr_fixture.js --regions-ui --viewport=480x640 --report --summary
node scripts/run_scanner_ocr_fixture.js --ui --summary
node scripts/run_scanner_ocr_fixture.js --storage --summary
```

The saved `regions-baseline.json` is the pre-change capture; rerunning `--baseline --report` replaces it with a run through the retained standard path. `regions-calibrated.json` and `regions-tight.json` contain field results, initial observations, final rows and measured timings.

Evidence still needed: full-screen captures where the standard scanner actually fails, independently labelled unread categories and War hall/category labels, three-star crafts, real panel/resolution/zoom variations, and live capture/animation trials. The Canvas transforms exercise coordinate handling only; they do not increase the count of independent screenshots or establish a live OCR improvement.
