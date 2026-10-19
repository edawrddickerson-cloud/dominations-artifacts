# Crafting scanner display rules

Opt-in crafting purposes use the purpose match count in the large box: any selected purpose with a positive score improving its weighted owned top two (or filling a vacancy) makes it green. Purpose controls directly edit shared profile Off/Def ratings, using the same 0–10 values for craft and owned items. Axis mapping is fixed per stat: invading perks, defensive buildings/defenders and loot refund use Def; other perks, including economy loot/production/research, use Off. Clearing removes the profile override and restores global/group/factory inheritance. There are no independent purpose weights or quality floors. Schema v3 retains old purpose values in legacyPurposeRatings and migrates selected overrides once, preferring existing profile values then selected-purpose order. Explicit loadout overrides remain separate. Ties do not qualify. Every selected purpose is listed. With no purposes selected, the strategy score rules below apply. The three-unlocked-stats Keep override still takes precedence. See the Selected crafting purposes section of `../docs/scanner-comparison.md` and run `node scripts/test_crafting_purposes.js` plus `node scripts/test_crafting_purposes_ui.js --summary` for purpose changes.

Schema v4 uses saved user-named purposes, each combining selections across Attacking, Defensive and Economy. Each section starts with a protected saved default: Offensive - General, Defensive - General, Economy - General. These have fixed names, cannot be deleted, and include all catalogue stats of their category by default; individual stat inclusion remains editable. General Purpose is not a source checkbox. Internal general-* source IDs are retained for compatibility with earlier saved goals. The right-hand editor displays the canonical union once per stat and can exclude individual stats; real duplicate stat lines on an artifact still count separately. Scanner comparisons and grouped ratings use saved named goals, not each source selection. Name/selection/inclusion edits require Save purpose; shared ratings save immediately. The Army editor is removed, and configured armies migrate to named attacking goals without deleting the underlying strategy data. Existing built-in selections migrate into one named purpose, with previous selections retained in legacySelections. Unknown artifact-type availability is not absence; view filters never change saved membership.

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
- A displayed score or subtotal at or above its numeric benchmark is green,
  including provisional, inferred and incomplete scores (180 versus 170 is
  green). Multi-strategy rendering must preserve a numeric win or tie for the
  visible active strategy or any selected strategy. Review indicators and
  confirmed Keep eligibility remain separate; a tie does not claim replacement.
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
