# Crafting scanner display rules

When changing the crafting scanner's reading, scoring, comparison or styles,
preserve the **Crafting display rules** in `../docs/scanner-comparison.md`.
These are user requirements, reinforced after repeat regressions:

- Keep the best current stat candidate visible, including an uncertain first
  reading. Weaker retries must not erase it or alternate it with a weaker name
  or percentage. Stronger evidence may replace it within the same encounter.
- When a candidate name and signed percentage are available, show its
  provisional weighted score (for example `~20`) rather than a dash. Do not
  invent a missing name or percentage, or promote a preview into verified data.
- The main score box is red when its displayed score or subtotal is below its
  benchmark, even with uncertain, inferred or provisional points, unless exactly
  three stats are unlocked (the Keep override below). When comparing
  multiple selected strategies, red means all available required comparisons
  are lower. A missing benchmark or open slot is not a numeric loss.
- Exactly three unlocked stats override benchmark colour: the main box must be
  green and show a bold “Keep — 3 stats unlocked” reason, regardless of the score,
  missing percentages, category or benchmark, including multi-strategy rendering.
  Other capture completeness, confidence and Keep eligibility states must not
  turn a known below-benchmark score amber or green. Clear the override when the
  next item no longer has three unlocked stats.
- Reset held candidates on a genuine new artifact, profile or capture context;
  never carry an old item's evidence into the next one.

For changes to these rules, run the focused checks from the repository root:

```
node scripts/test_scanner_recognition.js
node scripts/test_scanner_comparison.js
node scripts/test_strategy_scanner.js
node scripts/test_scanner_reading.js
node scripts/run_scanner_ocr_fixture.js --glance --viewport=1440x900 --summary
node scripts/run_scanner_ocr_fixture.js --provisional-colours --summary
```

The colour regression must exercise the real multi-strategy renderer. The
general glance test disables strategy comparisons to isolate its other checks,
so that test alone cannot catch strategy rendering overriding the main colour.

For changes to live OCR during settling, also run
`node scripts/test_scanner_speculation.js` and
`node scripts/test_scanner_worker_readiness.js`. Preserve the full 220 ms gate:
early work requires a ready worker, a fresh observation and exact settled-input
validation. Coarse change signatures alone cannot approve it. Rejected work must
not publish or populate verified crop evidence, and must release the worker
before the ordinary settled retry. See the OCR during settling section of the
comparison document for the input and lifecycle contract.
