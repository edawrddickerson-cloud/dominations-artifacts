# Comprehensive design pack and delivery plan

25 October 2026. Scope: the first-party application as a whole, including shared shell, artifact and council pages, scanners, statistics, configuration and auxiliary routes. Vendor libraries and backend internals are considered only where they constrain UI behaviour.

This is the governing design pack and its migration record. Start with the [design specification](system.md), [consumer/exception registry](consumers.json) and [project skill](../../.agents/skills/dominations-ui/SKILL.md). The [original audit](audit.md) records the source baseline; the phases below retain the rationale for the migration.

## Implemented baseline and review

See [migration verification](verification.md) for fresh results, the known pre-existing storage assertion and remaining manual checks.

All 16 first-party routes are classified in `consumers.json`. All styled documents load shared tokens and primitives through `ui/styles.css`. Every active content page loads `ui/design-ui.js`, including dynamically created pickers. Entry/Army documents retain redirect behaviour. Legal and methodology pages use the shared document recipe.

Native field appearances, buttons/segments, picker surfaces/triggers, rating inputs, basic tables and dialogs have shared owners. Migrated local field appearances were removed. Local scanner geometry, stat/reroll colours, collection artwork/layouts and rating grids retain their domain behaviour. Shared helpers never decide selection/save state. Two unknown-OCR field appearance exceptions are recorded in the registry with their checks.

`tests/design/gallery.html` imports production components and demonstrates fields, density, long values, invalid/disabled controls, selection pickers, inherited/override/zero ratings, numeric states, empty data and native dialogs. It stays outside deployed `ui/` assets.

Run `node scripts/check_design_system.cjs` to check route coverage, foundation loading, measured token contrast and competing native-field/picker declarations. Exceptions name the exact selector, property values, domain reason and check. Add a shared variant instead of broadening exceptions for ordinary controls.

Run `node scripts/test_design_ui.cjs` to render all 13 content/auxiliary pages and the gallery at desktop and phone widths. `--full` adds intermediate sizes and 320px reflow. Screenshots and interaction/layout results are generated in `data/temp/design-review/index.html` and `report.json`. The runner uses a fresh local browser profile, blocks external services, checks landmarks/overflow/shared fields, exercises real picker Escape/focus/selection retention and native dialog keyboard behaviour. Screenshots show disposable sample targets and collection data, plus a clearly synthetic populated scanner preview; they never access the user's account. Use the domain fixtures below for populated scanner/collection workflows.

This baseline is ready for visual review; it is not a claim of complete WCAG conformance. Browser-native popup appearance, screen-reader usage, coarse-pointer interaction and actual browser zoom still need manual review. Existing page/domain compositions remain deliberate variants, not duplicated control owners.

## Recommended approach

Build on the strongest existing patterns: dark/gold foundations, persistent navigation/header, compact sortable tables, museum layouts, inherited rating editors, themed dialogs and the scanner's specialised workspace. Consolidate reusable controls and data conventions before polishing individual pages. Keep the current HTML/CSS/JavaScript architecture; a framework migration would add work without resolving the design decisions.

The pack must cover both appearance and behaviour. Matching select borders is insufficient if selection summaries, keyboard navigation, save timing and unknown values still mean different things on each page.

## What the completed pack contains

| Artifact | Purpose | Status |
|---|---|---|
| Audit and consumer inventory | Evidence, best existing patterns, gaps and affected pages | Initial source audit in this pack; rendered sample coverage recorded separately |
| Design specification | Foundations, control selection, data semantics, responsive compositions, exceptions | Proposed baseline in this pack |
| Repository skill and agent entry point | Make future work consult the same rules | Included in this pack |
| Runtime token and component owners | One source for colours, type, spacing, states and shared behaviours | Implemented; `ui/design-tokens.css`, `ui/components.css`, `ui/design-ui.js` |
| Local component gallery | Render actual shared controls and representative states | Implemented; `tests/design/gallery.html` |
| Page recipes and migrated consumers | Apply components to every active route without changing domain logic | Shared primitives applied; routes classified in `consumers.json`; visual review pending |
| Verification and exception registry | Behaviour checks, screenshots and justified variants | Ownership guard, rendered runner and registry implemented; generated screenshots remain review artifacts |

The gallery should be a local developer fixture, excluded from production navigation. It should import production styles/helpers rather than recreate a second design system. Include normal/compact selects, a long selected name, empty/multiple selections, open/search/no-match popovers, disabled/focused/invalid fields, inherited/explicit/zero ratings, sort directions, empty tables, numeric uncertainty and dialogs. Add actual-data specimens with long names, negative effects and large counts. Demonstrate component states without enabling live OCR, account access, capture permissions or external calls.

## Coverage and page migration recipes

| Area / source routes | Retain | Align and verify |
|---|---|---|
| Shell: `scanner-session.html`, `navigation.js`, `app-shell.css` | Persistent DOM, profile/global context, history and embedded-page model | Control metrics, active/connection states, fixed header, sidebar collapse, popup boundaries and one scroll owner |
| Artifact ranking: `artifacts.html` | Canonical stats, artwork, ranking and filters | Native selects, perk/cost/comparison pickers, numeric alignment, sort state and result counts |
| Collection: `collection.html` | Museum slots, selected artifact details and owned comparisons | List toolbar, empty/selected/owned states, inline edits, destructive dialogs and local table scrolling |
| Targets/ratings: `ratings.html`, `crafting-purpose-editor.js` | Effect-group editor, category drafts, shared ratings and exclusions | Target vocabulary, grouped selectors, save actions, rating cells, unsaved modal and stable row order |
| Totals: `totals.html` | Domain grouping and active-loadout summary | Same number formats, state colours, headings and comparison conventions as ranking/collection |
| Crafting scanner: `scanner.html` | Five-stat/image layout, compact target rows, Keep/Discard, inline correction | Controls and setup disclosure; protected focus/pinning, uncertainty, reroll and OCR edit lifecycle |
| Storage scanner: `storage-scanner.html` | Capture/review workflow and special artifact fields | Setup controls, unknown/invalid fields, review table and shared add-to-collection actions |
| Crafting statistics: `crafting-stats.html` | Odds-first calculator, source/sample context and observed distributions | Perk multi-picker, source/category selects, tabs, metric cards, sortable tables and unavailable states |
| Council browsing: `council.html` | Hall-specific identity and stat links | Browse/filter recipe, shared fields and ranking table states |
| Council collection: `council-collection.html` | Ownership, active cards and collection composition | Same card/action/selection family as artifact collection with distinct domain fields |
| Council ratings: `council-ratings.html` | Axis/inheritance grid and unavailable cells | Shared rating cells, section disclosures, header sort behaviour and horizontal scrolling |
| Configuration: `config.html`, `services-ui.js` | Profiles, account, consent, backup and sync workflows | Forms, destructive actions, dialogs, loading/error/offline states; preserve data boundaries |
| Auxiliary documents: `privacy.html`, `crafting-statistics.html` | Legal facts and crafting statistics methodology | Shared readable typography and navigation; retain necessary legal/method details without adding redundant introductory prose |
| Authentication: `auth-return.js` on `config.html` | Authentication return and handoff | Concise statuses/actions and return path; no shell duplication |
| Entry/legacy: `index.html`, `army.html` | Existing redirects/compatibility and permitted deep links | Test actual redirect behaviour; do not revive removed screens or apply a new template to a redirect |

At implementation start, resolve this route inventory against current first-party HTML and the navigation allowlist. Assign every route to an active page, shell, auxiliary document, redirect or fixture. Remove stale inventory entries only after checking callers. This avoids treating historical routes as current product features.

## Original delivery phases and completion gates

### Phase 0 — Baseline and decisions

Confirm the route/consumer matrix in the audit, map stylesheet load order for shell and each content document, and inventory all control families. Capture representative existing pages at desktop and narrow widths in an isolated local browser. Include open pickers, dialogs, populated/empty/error states and focused editors. Record current failures rather than making them the accepted target.

Settle proposed sizes, density variants, select policy, semantic colours and numeric conventions from `system.md`. Record measured contrast and any changed token values. The design pack is the decision source; screenshots demonstrate it but do not replace semantic requirements.

Completion gate: each route classified; each repeated component has a proposed owner and consumers; existing passing behaviours identified; source observations and rendered observations separated.

### Phase 1 — Foundations and gallery

Create shared token ownership, typography/spacing/density scales, focus and state tokens. Preserve existing token names through aliases where useful. Decide load order before splitting `styles.css`; avoid a global reset that unexpectedly changes the rating grids or native controls. Provide the developer gallery with real shared imports and deterministic fixture state.

Completion gate: shell and two unlike content pages use identical shared foundation values; gallery shows contrast/focus/density states; no duplicate visible shell; no unexplained change to protected scanner geometry.

### Phase 2 — Controls, dropdowns and dialogs

Start with the user's clearest inconsistency: native select appearance across header, scanner setup, collection toolbar, statistics and settings. Consolidate field/button styles and remove migrated local declarations. Then consolidate checkbox popover presentation and common dismissal/focus/viewport behaviour across perk, cost, comparison and probability consumers where their actual semantics match. Keep single-select, multiple-select and command behaviour distinct.

Extract shared dialog appearance and action hierarchy while preserving each workflow's validation and persistence. Use one rating-input presentation with explicit inherited/override/zero/excluded states. Do not move domain state into a generic UI helper.

Completion gate: every select consumer is migrated or has a documented exception; every custom picker has keyboard, selection-summary, search-retention and edge-overflow checks; dialogs close/retain/save correctly; no focus loss during refresh.

### Phase 3 — Data presentation and page recipes

Consolidate table/sort headers, signed numeric formatting, unknown/provisional display, ownership/selection state, concise empty/error states and action placement. Migrate browsing pages together, collections together, then ratings and statistics. Correct terminology and remove redundant blurbs as part of each affected page change. Preserve any wording carrying necessary legal or operational meaning.

Completion gate: all active non-scanner routes follow a documented composition; comparable values align; sorting does not reorder actively edited rows; cleared ratings restore inheritance; source/sample/unknown context survives formatting.

### Phase 4 — Scanner integration and responsive review

Migrate scanner setup/review controls after shared controls are stable. Treat the five-stat/image row, compact decision box and live editor as explicit component variants. Use the focused scanner checks required by `ui/AGENTS.md`, not a generic screenshot alone. Verify in-flight OCR rejection and input identity if the edited structure changes.

Review every active page at 1440×900, 1024×768, 768×1024 and 390×844, zoom, keyboard-only and coarse pointer. Check long values, empty stores and unavailable network states. Restrict horizontal overflow to data regions. Keep required scanner layout constraints visible; record any unresolved narrow-layout conflict for a specific design decision.

Completion gate: protected scanner behaviours pass; narrow controls and actions remain reachable; no popover clipping, hidden focus, overlapping sticky layers or duplicate header.

### Phase 5 — Prevent drift

Complete the component-consumer map and a small exception registry. Add a focused guard against new raw colour/control-style duplication in migrated owners/consumers, using an explicit baseline and exceptions. Do not ban all raw values in domain layouts or count legacy violations as new failures. Prefer a targeted CSS/parser check over a brittle expression that fails on harmless formatting.

Add repeatable local gallery snapshots and a small set of representative page baselines with stable data and asynchronous content controlled. Keep a behavioural check alongside important snapshots: a picture cannot prove saved drafts or keyboard operation. Integrate appropriate checks into the repository's actual validation workflow after inspecting it; do not assume a package manager, CI job or component framework exists.

Completion gate: adding a component variant requires its specification, gallery state and affected verification together; a new page must name its recipe and shared components; every permitted exception has a reason and a check. No migrated page redefines base control appearance without an explicit variant.

## Validation mapping

The commands below were identified in the repository; run only the relevant set during implementation and follow `ui/AGENTS.md` when its requirements are broader. The numeric-input row invokes its existing browser wrapper, including real native stepper/keyboard checks. Documentation-only changes do not require replaying OCR fixtures.

| Change | Existing checks to use |
|---|---|
| Shell, header, profile or navigation | `node scripts/test_navigation_ui.js --summary`; `node scripts/test_navigation_auth.cjs` when auth routing changes |
| Shared numeric controls | `node scripts/test_strategy_management_ui.js --summary` (runs `tests/number-inputs-browser.js`) |
| Target drafts, ratings, purposes | `node scripts/test_crafting_purposes.js`; `node scripts/test_crafting_purposes_ui.js --summary` |
| Council ratings | `node scripts/test_council_ratings_ui.js` |
| Artifact target rankings | `node scripts/test_artifact_ranking_targets_ui.js` |
| Collection comparisons | `node scripts/test_strategy_collection_ui.js` and relevant collection/scanner fixtures |
| Statistics and probability | `node scripts/test_crafting_probability_ui.cjs` and existing statistics checks for the affected module |
| Scanner reading/comparison/styles | Required recognition, comparison, strategy, reading, glance and provisional-colour commands in `ui/AGENTS.md` |
| Live settling lifecycle | Additional speculation and worker-readiness commands in `ui/AGENTS.md` |
| Shared control visual change | `node scripts/check_design_system.cjs`; `node scripts/test_design_ui.cjs` (`--full` for the complete matrix), plus rendered inspection |

Confirm command names against current scripts before execution. Existing tests can contain superseded visual assumptions; reconcile against the current user requirements rather than reverting the UI to make an old test green. Changes to test expectations require a requirement-based explanation.

## Working agreement for future changes

Read `system.md` and the repository skill before UI work. Reuse the component owner or extend a documented variant. Implement a new convention in the shared owner, update its specification and gallery coverage, and migrate affected consumers together where practical. Keep domain invariants in their existing authoritative documents rather than copying all scoring rules into a styling skill.

For each migration change, report affected components/pages, removed duplicate rules, checks run and remaining exceptions. Finish one coherent component family before broadening the migration. Do not mark the entire pack implemented while routes or open component states remain unaudited.

## Risks and boundaries

The largest implementation risks are CSS specificity/load-order changes, shell-versus-iframe overlay boundaries, asynchronous editors losing focus, inherited zero/excluded states being flattened, and scanner decisions changing under a visual refactor. Migrate with representative consumers and delete replaced rules promptly. Avoid a whole-project stylesheet rewrite in one change.

This plan does not authorise deployment, account changes or data migrations. The current deliverable intentionally leaves runtime implementation to the phases above. The skill and root agent entry point require shared ownership, specification/registry updates and the implemented checks. Generated screenshots support review; full accessibility and visual sign-off must be based on the checks actually performed.
