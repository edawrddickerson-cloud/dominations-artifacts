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
  benchmark, even with uncertain, inferred or provisional points. When comparing
  multiple selected strategies, red means all available required comparisons
  are lower. A missing benchmark or open slot is not a numeric loss.
- Capture completeness, confidence, Keep eligibility and the three-unlocked-stat
  Keep reason remain separate from score colour. They must not turn a known
  below-benchmark score amber or green.
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
