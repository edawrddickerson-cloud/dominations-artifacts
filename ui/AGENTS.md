# Crafting scanner display rules

Every Attacking troop choice and the explicit Include All Enemy Building & Defender Debuffs choice includes Enemy Defender Spawn Time and Enemy Defender Hitpoints. Display both in Enemy Building & Defender Debuffs alongside enemy-buildings/enemy-all stats; deduplicate shared selections and preserve zero-rating checkbox behavior and saved exclusions. Enemy Recon Plane Scan Duration and Enemy Sabotage Duration remain Battle Effects. Enemy Defender Spawn Time has positive canonical polarity; preserve it in scoring.

October 21 decision layout: show each selected focus in a three-column row (name, target, actual score), plus an always-listed 3 Unlocked Rows focus with target exactly 3. Rows are muted red unless they qualify, when they turn green. The right Keep/Discard indicator uses a stronger red for a miss. The whole target bar is clickable, and the indicator uses about 55% of its former width. Any matching row makes the right indicator green; its only visible word is Keep or Discard. Keep uncertainty in numeric notation, without status blurbs. October 22 supersedes the image placement: keep the five read stats and artifact image in a horizontal row above the decision box. The section heading shows the scanned artifact name. The focused Collection Target heading reads "[target name] Score" and is centred across the multiplier, Max score and Dice columns; switching targets never replaces the artifact heading. The five-row table shows shared rating multiplier, maximum-upgrade contribution and target-specific reroll gain. Show a reroll bonus beside its base value in Max score, such as 0 + 80 or 20 + 60. Keep dice images in their own Dice column. Automatic focus selects the highest-scoring green target, or the highest-scoring target when none qualify; ties keep selected-target order. Clicking a target pins its scoring context across scans. There is no Auto button. Edit in the table heading enables the artifact name and in-place stat names, signed percentages and included visible-stat multipliers, with immediate validated corrections to the same canonical log record. Pause automatic OCR and reject in-flight results during Edit; resume the latest frame when Edit ends. Keep field formatting, focus and table dimensions stable. The separate Correct Recognition section is removed; category and hall correction controls live in expanded Scanner setup. Fit the right-aligned artifact image to the full five-stat section height, including its header. There is no separate rating editor. Edit only shared profile scoring from 0 to 10; never add/remove included stats or change category, exclusions or borrowed sources. Preserve editor input identity, focus and scrolling during OCR refreshes. Remove the separate strategy comparison table. Without selected targets, retain strategy comparisons as focus rows. This replaces the earlier standalone three-unlocked-stats reason display and amber decision state; unread/unavailable comparisons remain internally unknown and do not invent a green match.

Target settings use effect groups, not artifact-type groups, consistently across Main/War. Sort within groups on header clicks only; retain row order, focus and scroll during rating edits. Attacking unit choices include relevant enemy building debuffs: aircraft include Air Defense, Tower and all-enemy-tower stats; ground units include every individually listed building except Air Defense, plus all-enemy-tower stats. Paratroopers fight on the ground despite their Airstrip category. Expand linked units before combining building coverage and deduplicate canonical stats. Fort has no separate canonical debuff; do not invent one. The explicit Enemy Defensive Buildings choice includes every enemy-buildings and enemy-all stat. Preserve saved stat exclusions.

Collection Targets navigation and profile switches must use the themed Save / Discard / Cancel dialog for unsaved drafts. Save all pending tabs atomically; validation errors keep the dialog open. Cancel/Escape retains drafts. Switching category tabs retains drafts without prompting. Keep the native beforeunload fallback for browser refresh/close. Shared ratings save immediately and must not trigger a draft warning.

Opt-in crafting purposes use the purpose match count in the large box: any selected purpose with a positive score improving its weighted owned top two (or filling a vacancy) makes it green. Purpose controls directly edit shared profile Off/Def ratings, using the same 0–10 values for craft and owned items. Axis mapping is fixed per stat: invading perks, defensive buildings/defenders and loot refund use Def; other perks, including economy loot/production/research, use Off. Clearing removes the profile override and restores global/group/factory inheritance. There are no independent purpose weights or quality floors. Schema v3 retains old purpose values in legacyPurposeRatings and migrates selected overrides once, preferring existing profile values then selected-purpose order. Explicit loadout overrides remain separate. Ties do not qualify. Every selected purpose is listed. With no purposes selected, the strategy score rules below apply. The three-unlocked-stats Keep override still takes precedence. See the Selected crafting purposes section of `../docs/scanner-comparison.md` and run `node scripts/test_crafting_purposes.js` plus `node scripts/test_crafting_purposes_ui.js --summary` for purpose changes.

Schema v6 assigns every saved collection target one primary category: Attacking, Defensive or Economy. Saving accepts only that category's choices and explicit perks. Tabs maintain independent drafts and list targets only by primary category. Other categories are opt-in addOns, each using either source: profile (all category stats with shared ratings) or source: target plus targetId (only that named donor's own-category included stats). Never recurse into a donor's add-ons; cycles resolve base stats once. The right panel edits only the primary category; source controls show optional category membership. Profile/named membership combines once per canonical stat for both craft and owned benchmarks. Donor edits update dependents; missing donors block target qualification, and deletion of a referenced target requires changing the dependent's source first. No automatic General targets are created or listed. Schema v6 removes the three retired custom-general-* defaults and their scanner flags. References to an unmodified retired default become full-profile sources; customised exclusions are preserved as a category-only snapshot source, displayed as Previous category selection. removedDefaultTargets backs up the retired definitions. Empty categories open blank editable drafts, and deleting the last target leaves the list empty. Schema v4 mixed targets migrate into their original primary target plus explicit category-local donors, retaining original IDs, selected flags, exclusions and scoring; legacyTargets backs up prior definitions. Pre-v4 selections and armies retain their earlier migration and legacySelections/legacyPurposeRatings backups. Changes to names, choices, exclusions and sources require Save target; shared ratings save immediately. Stats with no current selections remain available for individual inclusion. The Army editor stays removed; underlying strategy data remains intact.

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

Scanner spacing: keep compact margins around the five read rows and tight target-row padding. The connected image-refresh prompt and button share one right-aligned line above the image, level with the larger artifact heading. Fit the image below that line so its bottom stays aligned with the last stat row. Add to Collection sits above Keep/Discard in the right column, while target rows occupy the left column without an additional empty action row.
