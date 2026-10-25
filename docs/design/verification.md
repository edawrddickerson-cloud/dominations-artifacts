# Design migration verification

25 October 2026. Shared foundations and primitives are applied to all styled first-party routes. This record covers the migration and its review artifacts; it does not claim full accessibility conformance.

## Rendered review

`node scripts/test_design_ui.cjs --full` passed **337 checks** and generated **75 screenshots**. The matrix covers 1440×900, 1024×768, 768×1024, 390×844 and 320×800. It renders all eleven active content routes, both auxiliary documents and the component gallery, plus a populated scanner preview at each size. The persistent shell is included in active-page screenshots. Entry and Army remain compatibility/redirect routes and are classified in `consumers.json`.

Review `data/temp/design-review/index.html`; select a viewport and open any screenshot at full size. Results are in `data/temp/design-review/report.json`. These ignored artifacts can be regenerated. The local preview serves the live app at `/ui/ratings.html` and components at `/tests/design/gallery.html`.

The runner uses a temporary Chrome profile, disposable sample collection/targets and a synthetic scanner reading. It blocks remote services and artwork. Sample artwork can therefore appear as a placeholder. It does not read the user's browser profile or change an account. The live app opened separately uses that browser's own local profile, not the screenshot fixture.

Checks cover main landmarks, document versus local overflow, shared field metrics, every custom picker consumer's placement/Escape/focus return, checkbox retention through search with no matches, native keyboard focus and modal dismissal. Populated scanner checks protect a readable stat-name column. The narrower horizontal scanner/data region is keyboard focusable; it preserves all five stats and the adjacent image instead of crushing names or changing their order.

## Passing focused validation

| Area | Commands |
|---|---|
| Ownership and contrast | `node scripts/check_design_system.cjs`; negative probes confirmed new local control styling and inadequate token contrast are rejected |
| Persistent shell | `node scripts/test_navigation_ui.js --summary`; also `--viewport=390x844` |
| Target model and drafts | `node scripts/test_crafting_purposes.js`; `node scripts/test_crafting_purposes_ui.js --summary` |
| Native number steppers | `node scripts/test_strategy_management_ui.js --summary` |
| Council ratings | `node scripts/test_council_ratings_ui.js` |
| Artifact target rankings | `node scripts/test_artifact_ranking_targets_ui.js` |
| Collection and dialogs | `node scripts/test_strategy_collection_ui.js --summary` |
| Probability and statistics | `node scripts/test_crafting_probability_ui.cjs`; `node scripts/test_crafting_stats_page.cjs` |
| Consent and saved-data choice | `node scripts/test_sharing_ui.cjs`; `node scripts/test_cloud_choice_ui.cjs` |
| Scanner recognition/comparison | `node scripts/test_scanner_recognition.js`; `node scripts/test_scanner_comparison.js`; `node scripts/test_strategy_scanner.js`; `node scripts/test_scanner_reading.js` |
| Scanner layout | `node scripts/run_scanner_ocr_fixture.js --glance --viewport=1440x900 --summary`; also `--viewport=390x844` |
| Provisional colours | `node scripts/run_scanner_ocr_fixture.js --provisional-colours --summary` |
| Live editing and target pinning | `node scripts/test_crafting_purposes_ui.js --summary --inline-edit`; also `--target-focus` |
| Skill | System skill creator's `quick_validate.py .agents/skills/dominations-ui` passed with its YAML dependency installed in an ignored task-local directory |
| Source hygiene | JavaScript syntax checks and `git diff --check` |

Two old browser wrappers were repaired without relaxing their assertions: collection scenarios now run inside the persistent shell's content frame; native number-pointer tests use the current iframe-offset hook and run before the target fixture mutates navigation/profile state.

The expanded picker checks also found and fixed a real probability interaction defect: `[data-stats-view]` matched the body as well as the source buttons. Every checkbox click refreshed the calculator before its native change event saved the selection. The handler now targets `button[data-stats-view]`; real click, search, no-match and selection-retention checks cover the correction.

## Pre-existing failure and manual limits

`node scripts/run_scanner_ocr_fixture.js --storage-layout --summary` still fails its **“unknown editable fields have amber borders”** assertion. The same assertion was reproduced while serving all original first-party HTML, JavaScript and CSS directly from Git HEAD in the isolated harness. The missing state is the tier selector's `is-unknown` class; the fields marked unknown retain their amber borders. This migration does not alter storage inference/normalisation or weaken the assertion.

The design check measures specified token pairs and exercises the listed interactions. Browser-native select popup rendering, actual browser zoom/text scaling, coarse-pointer use and screen-reader behaviour still need manual review before an accessibility conformance claim. The viewport matrix verifies layout/reflow; it is not a substitute for all of those checks.
