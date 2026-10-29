# Design migration verification

25 October 2026. Shared foundations and primitives are applied to all styled first-party routes. This record covers the migration and its review artifacts; it does not claim full accessibility conformance.

## Crafted-only rare presets and columns — 27 October 2026

Corrected preset generation to use the union of positive ordinary hall/type evidence in the existing crafted pools, instead of all 201 metadata stat identities. Named-only/unclassified effects such as Airstrip Troop Damage and Barracks Troop Damage no longer create presets. Individual presets cover the evidenced ordinary stats; combined unit presets require both damage and hitpoints and explicitly label that combination. Rare qualification and inline rare scoring intersect the current hall/type pool. Ordinary target scoring, OCR and rerolls retain their existing behaviour. Source pools remain incomplete and do not prove excluded effects impossible.

Matching lines now occupies one dedicated desktop column across every row; Stats occupies the next, with an empty third cell for individual-stat presets. Narrow views stack separately labelled groups. Updated the gallery to render this exact composition. Passed: craft-pool generation/fixture checks, crafted preset coverage and exclusions, per-hall/type qualification and inline scores, normal targets and migration, desktop/390px page checks, inline ratings, pinned focus, required scanner unit checks, provisional colours, standalone glance, probability and ownership checks. One parallel glance run raced its existing asynchronous correction-control creation; the unchanged fixture passed when rerun alone. The focused five-width and 200% text review passed 122 checks with 30 screenshots; desktop/320px screenshots were visually reviewed.

## Rare-card families — 26 October 2026

Rare Cards now includes an individual preset for every canonical stat alongside the combined unit HP/damage presets, grouped into Attacking, Defensive and Economy. Each family's Off all action is an atomic profile settings update that preserves other families, unit modes, normal collection targets and focus. The scanner aggregates overlapping matches into one Rare Card row; individual stats use the same weighted top-two and probability model. Existing unit choices migrate without resetting opt-outs; explicitly all-off setups remain off.

Passed: complete stat coverage and unique preset IDs; three/four-line thresholds, owned ties, family isolation and migration tests; desktop/390px target browser fixtures including an economy stat's live match and rarity; scanner recognition/comparison/strategy/reading, glance and provisional-colour checks; inline shared ratings, pinned target focus, probability engine and design ownership. The focused targets/scanner visual run passed 117 checks with 30 screenshots at all five widths and 200% text size. Desktop and phone family layouts were visually reviewed. The broader 517-check run passed the rare-card checks but had ten unrelated navigation assertions on crafting-stats/config, reflecting separately changed page links. Those unrelated workspace changes are outside this feature.

## Single Unit Rare Cards — 26 October 2026

Rating Defaults follow-up: moved the former Advanced ratings disclosure into a fifth Collection Targets tab named Rating Defaults. The shared five-tab variant wraps at intermediate widths and stacks at 320px. The existing ratings DOM remains mounted across view changes; filters, shared rating edits and category drafts keep their established lifecycle. Behaviour checks cover panel visibility, search identity/value retention, Home/End navigation, unsaved drafts, actual rating edits and profile/group inheritance.

The full five-width review passed 477 checks with 85 screenshots. Visual review then found that the Rating Defaults reset actions needed wrapping at 320px; the corrected toolbar passed a focused 98-check narrow review with 17 screenshots, including explicit action bounds. Target browser checks passed at desktop and 390px; artifact-type rating edits, perk-group inheritance and design ownership checks passed. Desktop and corrected 320px Rating Defaults screenshots were visually reviewed. No scanner scoring or rating persistence rules changed in this follow-up.

Collection Targets has a fourth view using shared tabs and two shared `.seg-equal` controls per unit: 3× and 4× / 4× only / Off, plus Damage & HP / Damage / Hitpoints. The default is 3× and 4× with Damage & HP. Groups stack on narrow views; labels wrap without clipping. The scanner keeps one aggregate decision row, unit/count/outcome details, and a personal-history model estimate with sample context. Stat mode restricts pattern matching, shared scores, owned benchmarks and rarity together.

Passed: target scoring and migration checks; real-page targets/rare cards at desktop and 390px, including mode-specific rarity; scanner pinned-focus, shared-rating and inline-edit fixtures; required recognition, comparison, strategy and reading checks; glance and provisional-colour browser checks; probability engine; design ownership. The final full design run passed 472 checks with 80 screenshots across 1440, 1024, 768, 390 and 320px, including rendered bounds of every toggle label and 200% text size. Desktop and 320px rare-card screenshots were visually reviewed. The design pack prohibits ellipsis/clipping as a layout workaround, and the ownership guard rejects shared control ellipsis. General scanner colour fixtures explicitly turn rare presets off to isolate strategy comparisons; the dedicated target fixture checks default-on presets and all stat modes. Browser fixtures blocked external services and used disposable data. Rarity is a model estimate from eligible personal history, not validated game odds or live community data.

## Slate promotion

Slate is the approved default on every page and in the persistent shell. The shared palette is registered in `consumers.json`; `design-tokens.css` owns its implementation. Flat surfaces and outlined selections replace the earlier page gradients and solid selection fills. Collection Targets uses the selected study's tabs, saved-row selection, framed editor toolbar and panel divider. Domain scoring, ownership and OCR colours retain their documented semantics.

Fresh validation passed the **402-check** rendered matrix and regenerated **75 screenshots**. The 65 added checks verify the full registered Slate palette in both shell and content documents at all five viewport sizes. The ownership guard also passes; negative probes confirm it rejects page token overrides, legacy theme literals, changes that disagree with the registered palette and duplicated native-control styles.

Focused checks passed for target drafts, collection comparisons/deletion, native number steppers, narrow shell navigation, scanner recognition/comparison/reading, provisional colours, inline scanner editing, desktop/narrow scanner geometry, probability controls and sharing dialogs. The updated project skill passed its validator. The pre-existing storage assertion and manual accessibility limits below remain documented separately.

## Rendered review

`node scripts/test_design_ui.cjs --full` passed **402 checks** (the original 337 interaction/layout checks plus 65 Slate palette checks) and generated **75 screenshots**. The matrix covers 1440×900, 1024×768, 768×1024, 390×844 and 320×800. It renders all eleven active content routes, both auxiliary documents and the component gallery, plus a populated scanner preview at each size. The persistent shell is included in active-page screenshots. Entry and Army remain compatibility/redirect routes and are classified in `consumers.json`.

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

Side-menu navigation follow-up: removed first-party page links and navigation buttons from page content, including collection/statistics/scanner shortcuts, linked council stat names, empty states and sharing notices. Privacy and Statistics Methods are reachable from Settings in the persistent side menu. Existing URL deep links, exports, external references and contacts remain supported. The ownership check, navigation, council ratings, collection comparison, statistics and sharing checks passed. The desktop/phone design run passed 186 checks and generated 30 screenshots with no browser errors; representative collection, statistics and privacy screenshots were visually reviewed. Navigation fixtures now use the side menu instead of the removed council stat link.

Crafting Stats layout follow-up: Personal Stats, Community Stats and Probability Calculator now have separate views, using Collection Targets' framed tabs moved into the shared component owner. Community opens by default. The calculator has an independent Personal/Community data-source select and retains inputs across switches. `node scripts/check_design_system.cjs`, `node scripts/test_crafting_probability_ui.cjs` and `node scripts/test_crafting_stats_page.cjs` passed, including 30 statistics behavior checks and keyboard tab navigation. The calculator fixture checks dropdown text fit and Max-tier alignment at 1440, 1024, 768, 390 and 320px. `node scripts/test_design_ui.cjs --full` passed 397 checks with 75 screenshots; a 320px follow-up passed 81 checks. `node scripts/test_crafting_purposes_ui.js --summary` passed with zero external requests and browser errors. At 320px tabs and calculator requirement fields stack to retain full text. Desktop and narrow screenshots were visually reviewed. Remote services were blocked; live community data was not validated.

`node scripts/run_scanner_ocr_fixture.js --storage-layout --summary` still fails its **“unknown editable fields have amber borders”** assertion. The same assertion was reproduced while serving all original first-party HTML, JavaScript and CSS directly from Git HEAD in the isolated harness. The missing state is the tier selector's `is-unknown` class; the fields marked unknown retain their amber borders. This migration does not alter storage inference/normalisation or weaken the assertion.

The design check measures specified token pairs and exercises the listed interactions. Browser-native select popup rendering, actual browser zoom/text scaling, coarse-pointer use and screen-reader behaviour still need manual review before an accessibility conformance claim. The viewport matrix verifies layout/reflow; it is not a substitute for all of those checks.

## Scanner field evidence and title review - 29 October 2026

The existing diagnostics disclosure/list/shared buttons now include questionable accepted titles as well as missing names. JSON exports include grouped unverified title candidates and bounded local field evidence. No new base control or visual variant was introduced. The field evidence owner preserves raw provenance, manual choices, physical row identity, provisional scores and conflict/save boundaries; privacy projections omit raw evidence while preserving unresolved conflict flags.

The full `node scripts/test_crafting_scanner_contract.cjs` passed on the final source, including new evidence/title/spelling/numeric-retry suites, unchanged scoring examples and benchmark checks, desktop/390/320px ownership/recovery, glance/provisional colours, speculation/readiness and real War OCR/calibration/live/stability checks. Storage real title/header coverage passed 47 cases; desktop/390px layout, passive saving, catalogue artwork and linked-item browser checks passed. Backup, stored artifacts, inference, history/reconciliation, workspace privacy, feedback consent, site-build dependency hashing and service-loader checks passed. Browser fixtures used disposable local data and reported no external traffic or browser errors.

Desktop and 320px scanner screenshots were visually reviewed in `data/temp/design-review/index.html`. Storage layout fixture maintenance replaces its removed navigation-link assertion with the current visible inventory-transfer button, and checks the existing optional-tier behavior separately from required unknown-field warnings. No product layout or protected crafting expectation was changed to satisfy a fixture. Summary: `reports/scanner-evidence-2026-10-29.json`; private logs remain under ignored `data/temp/ocr-review-2026-10-29/`. Catalogue coverage and live-game accuracy remain limited by independent captures; no deployment occurred.
