# Crafting scanner: plan for world-class reliability

Date: 2026-10-16  
Status: Plan recorded for the next stage. The current speed and accuracy improvements are implemented locally; the work below has not started.  
Scope: Crafting scanner first, with shared recognition/scoring changes checked against Storage Scanner.

## Intended experience

Navigate through artifacts at a natural pace. The scanner follows the current artifact, captures its visible fields, and settles on a trustworthy score without repeated clicks. If a field cannot be read, highlight that field and keep the readable data intact. Previous-artifact data must remain clearly identified whenever retained on screen.

The goal is a substantial practical improvement in speed, completeness, and reliability. Success is measured by complete artifacts and correct decisions, not a particular speed multiplier or an average character-recognition score.

## Current foundation

The October 16 implementation provides:

- Batched OCR of calibrated fields, with physical row association that preserves omissions and duplicates.
- A pinned local fast English model, the original model for difficult-read fallback, model warming during capture stabilization, and separate caches for public model assets.
- Focused row/percentage retries and retained raw batch, guide, and field evidence.
- Cached owned-collection benchmarks and active rating lookups, with collection/profile/rating invalidation.
- Exclusion of assumed names, inferred percentages, and conflicting fields from complete crafting comparison totals. Readable rows can still produce a labelled subtotal.
- Regression coverage for signs, row positions, scoring, profile changes, correction, cancellation, capture cleanup, and both worker lifecycles.

Recorded measurements:

| Measurement | Result | Boundary |
| --- | --- | --- |
| Warm calibrated OCR across eight matched screenshots | 5,206 ms before; 1,044 ms after, approximately 5x faster | Excludes capture stabilization, model startup, and UI rendering |
| OCR calls across those eight screenshots | 137 before; 12 after | Aggregate, not calls per artifact |
| Repeated collection comparison | Approximately 225x faster | Synthetic 500-item collection; excludes OCR and capture |
| Expanded screenshot audit | 66/66 final name/value sets match labels | 22 source screenshots at three sizes; resized images are not independent examples |
| Direct extraction and review | 61/66 runs read all five percentages directly; 60/66 confirmed | Five runs still infer one percentage; one further run has contradictory evidence |

No confidently incorrect result was observed in that audit. Most source screenshots omit category/Hall pixels, and frozen-image tests do not establish live accuracy, transition handling, or complete-metadata accuracy.

Evidence: [OCR measurements](../reports/scanner-crafting-performance.json), [comparison measurements](../reports/scanner-comparison-performance.json), [recognition review](scanner-recognition.md), and [comparison behavior](scanner-comparison.md).

## Proposed acceptance targets

These are initial targets to validate on agreed hardware, resolutions, layouts, and navigation speeds. They are not achieved guarantees.

| Measure | Initial target | Definition |
| --- | --- | --- |
| End-to-end latency | Typically 300-500 ms; 95th percentile below one second | First frame on which the artifact is fully visible and readable to the correct current result being rendered; includes detection, stabilization, OCR, validation, comparison, and rendering |
| Complete automatic correctness | Above 99% | All required visible fields correct, current, and captured without inference or manual correction, divided by eligible artifact encounters |
| Wrong automatic acceptance | Below 0.1% | Incorrect automatically accepted complete results divided by all automatically accepted complete results |
| Manual review frequency | Below 1% in ordinary supported conditions | Eligible encounters requiring user correction or remaining incomplete; report missed encounters separately |
| Stale decisions | Zero in the transition regression suite | An old or mixed-artifact result must never be presented as a confirmed current decision |

Report cold-start/model-load time separately. For rapid navigation that never exposes a readable artifact long enough, record a missed/too-brief encounter instead of silently excluding it from the navigation report.

Complete capture includes all five perk names and signed percentages, star states, category, Hall, and any visible calibrated dice controls. Preserve locked rows and duplicate perks. Distinguish pixel evidence from manual input, rule-based eligibility, and inferred values. Existing explicit keeper/scoring rules must be tested separately from complete-capture accuracy.

A confidence score or agreement between recognizers does not prove these targets. Establish them using independently checked labels, held-out sessions, documented denominators, and uncertainty intervals. Thousands of independent encounters will be needed to substantiate a rare-error target; frames or resized copies of the same artifact do not increase that independent sample count.

## Milestone 1: gameplay evidence and repeatable replay

Start when a gameplay recording is available.

1. Preserve the original recording and capture metadata: resolution, frame rate, game/capture layout, scaling, and whether the scanner was visible alongside it.
2. Identify artifact encounters and transitions by timestamp. Include readable pauses, ordinary navigation, fast skips, returns to previous items, and interruptions.
3. Extract representative full dialogs and difficult field crops. Independently transcribe visible names, signs, numbers, category, Hall, stars, and dice. Mark truly unreadable or absent fields as such. OCR output must not supply its own ground truth.
4. Build a replay harness that feeds recorded frames through the production reading controller and scorer at recorded timing. Single-frame OCR checks remain useful, but cannot stand in for this replay.
5. Produce an encounter-level report: complete/direct extraction, field errors, missing artifacts, duplicate log entries, stale/mixed results, review rate, and latency percentiles. Break results down by colour, brightness, scale, layout, and transition type.
6. Separate development and evaluation recordings. Group repeated views of the same artifact together so tuning and evaluation do not share it. Reserve additional sessions and resolutions for final validation.

Recording guide: start with 2-5 minutes at normal game resolution, around two seconds per artifact plus some faster navigation. Keep the full artifact dialog visible and include varied colours, locked rows, duplicates, and categories. A side-by-side scanner view helps diagnose display errors if it preserves the game's usual text resolution. Use the original recording where possible.

Deliverables: local recording manifest, reviewed labels, replay command, baseline report, and a ranked failure list. Videos and extracted pixels remain local development evidence and outside the published site.

Exit condition: the replay reproduces observed failures and can compare a candidate change with the current scanner on exactly the same encounters.

## Milestone 2: capture, tracking, and current-artifact identity

Use the replay to determine how much failure comes from capture rather than OCR.

- Track the panel and field geometry through supported movement and resizing while preserving native text detail.
- Detect readable/stable fields individually. Unchanged fields should not need repeated OCR, and changing fields must invalidate their previous evidence.
- Evaluate short frame bursts and aligned temporal evidence for animated or dim text. Do not combine different artifacts or manufacture stars/dice states through filtering.
- Make cancellation and encounter identity explicit: late results from another artifact, crop, session, or manual edit cannot update the current result or log entry.
- Reduce fixed waiting only where replay results show that latency improves without more missed or mixed reads.

Deliverables: measured capture/settling changes and regression sequences for animations, navigation, panel movement, capture interruption, and revisiting identical artifacts.

Exit condition: current-artifact tracking passes every reviewed transition sequence, and latency improves without reducing direct-capture correctness or increasing review frequency.

## Milestone 3: recognition suited to each field

Keep the current implementation as the measured baseline.

- Benchmark the current Tesseract paths and a modern dedicated text recognizer, such as [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), on the reviewed game crops. Compare exact names, signed percentages, review frequency, latency, startup, memory, and local deployment requirements. No engine replacement is assumed in advance.
- Evaluate names separately from signed numeric suffixes. Signs, decimal points, and percent glyphs need explicit error analysis.
- Treat stars, dice, and Hall colour as visual classification tasks, with their own labels and checks.
- Use the perk catalogue to rank plausible spellings while preserving readable qualifiers and raw evidence. Unknown names remain observable candidates; they must not become a convenient known perk.
- Retry only uncertain fields with a useful alternative image treatment or recognizer. Agreement is supporting evidence; disagreements remain visible.
- Consider game-font training or synthetic examples only after the failure analysis justifies them. Tune on development data and evaluate on unseen real captures.
- Keep processing local. Compare browser/WASM/WebGPU and a local helper only if the measured candidate warrants the added deployment work. A cloud service would be a separate product decision.

Deliverables: per-field engine comparison, selected processing path, resource measurements, and reproducible difficult-crop regressions.

Exit condition: the selected path improves direct complete-artifact correctness or materially reduces review frequency, while meeting the agreed latency/resource budget and preserving sign/qualifier/scoring invariants.

## Milestone 4: confidence, correction, and trustworthy decisions

- Keep separate evidence for names, percentages, metadata, and visual controls. Name similarity is not the probability that a whole field is correct.
- Calibrate automatic acceptance using held-out labelled results. Report correctness among accepted results together with acceptance/review coverage; rejecting everything is not success.
- Show the particular uncertain field and its original crop/readings, with a quick correction path that retains other captured data.
- Keep partial subtotals distinct from complete comparison decisions. Present unknown category/Hall and uncertain reroll availability explicitly.
- Validate the existing three-open-stat keeper exception separately so it cannot be mistaken for a fully read artifact or a score-based recommendation.
- Retain reviewed corrections as labelled development evidence. Do not automatically turn every runtime correction into a global alias or training label.

Deliverables: acceptance thresholds justified by evaluation results, field-specific review behavior, and correction/decision regression tests.

Exit condition: acceptance meets the measured error target at useful coverage, and users can distinguish a complete current result, a subtotal, a retained previous result, and an explicit keeper exception.

## Milestone 5: release gate and continuing evaluation

Validate the chosen implementation on held-out recordings and supported hardware/resolutions. Measure the entire capture-to-render path, including cold starts, longer sessions, memory bounds, storage/profile updates, and interruptions. Recheck Storage Scanner wherever shared code changed.

Before treating the targets as achieved, publish a local evaluation report containing the scope, independent encounter counts, denominators, confidence intervals, latency percentiles, direct/inferred/manual field counts, missed encounters, and remaining failures. Add every newly confirmed failure to the regression set without moving evaluation examples into development unnoticed.

Keep the current tested implementation available as a fallback if a candidate increases wrong acceptance, loses fields, or exceeds the resource budget. Future deployment remains a separate task from recording this plan.

## Immediate next action

Supply the first original gameplay recording when ready. The next implementation work begins with Milestone 1: reproduce and classify failures before selecting another OCR engine or adjusting acceptance rules.
