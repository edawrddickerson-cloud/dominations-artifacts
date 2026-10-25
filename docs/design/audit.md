# UI consistency audit

25 October 2026. Requested high-effort independent subagent review, with primary-agent synthesis. Scope: first-party UI route families, CSS and component consumers, shared domain/persistence boundaries, project documentation and existing browser checks. Backend/data architecture was reviewed for UI constraints; this is not a correctness audit of every OCR algorithm, dataset row or third-party dependency.

This audit distinguishes source evidence from rendered verification. See [delivery plan](README.md) for the work required and [design specification](system.md) for the proposed target conventions.

## Evidence and limitations

The subagent inventory found 16 HTML routes, 9 CSS files (3,737 lines) and 64 JavaScript files (16,802 lines) at the first-party UI root. Counts describe that inventory scope, not all nested/vendor assets. `styles.css` accounted for 2,822 lines with 113 literal hex values; `scanner.css` for 417 lines with 85 literal hex values. Raw literals are a consolidation signal, not proof that every value is wrong.

The subagent ran `node scripts/test_navigation_ui.js --summary` successfully in an isolated headless Chrome profile. It exercised ten content routes and passed shell/header/filter/profile/history/draft-dialog checks, reporting zero external requests and zero browser errors. This demonstrates behaviour preservation candidates, not complete aesthetic or accessibility validation.

A broader custom geometry/rendered audit did not produce reviewable results. Subsequent shell commands failed before process start with `helper_unknown_error: setup refresh had errors`. No route screenshots, measured contrast, full keyboard audit, narrow-layout sign-off or completed skill-validator result is claimed. Historical browser reports were not counted as fresh validation. Runtime source was not changed during this review.

## Best existing patterns to retain

| Existing strength | Evidence | Carry forward |
|---|---|---|
| Recognisable dark/gold identity | `ui/styles.css:1–24` | Semantic foundation tokens and existing font stack |
| Persistent app shell | `ui/scanner-session.js:1–170`, `ui/navigation.js`, `ui/app-shell.css` | Single navigation/header, stable profile context and page history |
| Shared primary filter state | `ui/profiles-ui.js:299` onward | Keep domain state shared while consolidating its presentation |
| Semantic sortable ranking headers | `ui/council.html:102–112`, `ui/styles.css:1238–1327` | Button-based sort controls, numeric header alignment and explicit sort state |
| Themed native dialogs | `ui/collection.html:107`, `ui/ratings.html:80`, `ui/config.html:54` | Native modal behaviour with unified surface/action styles |
| Purpose-built collection layouts | `ui/collection.html`, `ui/council-collection.html`, `ui/council.css` | Artwork, slots, ownership and active identity rather than generic dashboard cards |
| Explicit inherited rating model | `ui/council.css:10–21`, `ui/crafting-purpose-editor.js`, `ui/AGENTS.md` | Separate inheritance, override, exclusion and zero states |
| Protected live scanner presentation | `ui/AGENTS.md`, `ui/scanner.css`, `docs/scanner-comparison.md` | Compact five-stat/image workspace, numeric uncertainty and stable editing |
| Probability result hierarchy | `ui/crafting-probability-ui.js`, `scripts/test_crafting_probability_ui.cjs` | Odds first, percentage second, source/sample and missing-data semantics |

## Findings and priority

### P1: Control styles are owned by multiple pages

Native selects have different padding, backgrounds, radii and inherited fonts: shared filters in `ui/styles.css:695–715`; profile selection near `ui/styles.css:129`; scanner controls in `ui/scanner.css:46,67`; collection toolbar in `ui/strategy-collection.css:3`; strategy controls in `ui/strategies.css:22,29`; council card select near `ui/council.css:101`; statistics fields throughout `ui/crafted-log-stats.css`; service forms in `ui/services.css:7`.

The collection toolbar also uses a `--border` fallback while the core theme defines `--line`. This creates a parallel border vocabulary. Proposed resolution: shared Field/Select tokens and density variants, followed by removal of migrated local appearances. Keep meaningful width/layout differences.

### P1: Multiple dropdown implementations need a shared contract

Picker implementations occur in `ui/app.js:805,963,1233,1252`, `ui/council.js:524,731,750`, `ui/profiles-ui.js:274–291`, and `ui/crafting-probability-ui.js:52`. The project combines native selects, custom button panels, comparison selectors and `details/summary` perk sets.

These are different semantic families, not candidates for a single all-purpose widget. Source review establishes duplication and different structures; it does not establish that every implementation fails keyboard operation. Proposed resolution: one visual Field/Trigger family, one shared checkbox-popover contract and reusable dismissal/placement behaviour where appropriate, with explicit native-select and action-menu semantics. Test each consumer's save/application model.

### P1: Global table rules force local counter-rules

`ui/styles.css:1238–1266` styles all tables and makes all `th` sticky, uppercase and compact. Council ratings compensate in `ui/council.css:10–17`; crafting purposes compensate near `ui/crafting-purposes.css:68`. Statistics add another table/header family in `ui/crafted-log-stats.css`.

Proposed resolution: shared table foundations with named browse/edit/compare/live variants. Use explicit component scope for sticky header behaviour. Do not make row headers look like column headings or change editable row order during input.

### P1: Page CSS and theme literals obscure ownership

Large shared and scanner stylesheets mix base components, page composition and later overrides. Feature styles add independent border/focus/selection choices. For example, `ui/strategy-collection.css` combines core-theme variables with alternate fallback palette values and a blue pressed background while the primary theme is gold.

Proposed resolution: map the existing cascade first, establish tokens and shared primitive owners, migrate consumers incrementally, and delete replaced rules. Do not append a final universal override sheet and call consolidation complete.

### P2: Labels and terminology drift

Shared filter labels are uppercase in `ui/styles.css:678–693`; feature controls use different label treatment in `ui/strategy-collection.css:2` and `ui/crafting-purposes.css`. Targets, strategies and purposes refer to overlapping historical concepts in different UI/code locations.

Proposed resolution: one label hierarchy and a small user-facing vocabulary. Use Collection Target for the current saved target entity; keep distinct terminology where a legacy strategy or a crafting purpose actually has distinct semantics. Code identifiers do not need a risky wholesale rename to fix visible language.

### P2: Existing UI prose conflicts with concise-copy policy

Review `ui/crafting-purpose-editor.js:75`, `ui/ratings.html:68–70`, `ui/collection.html:60–63`, and `ui/services-ui.js:123`. The subagent identified explanatory or redundant copy here. Apply the current names/facts/necessary-actions rule when these consumers migrate. Check purpose before removal: consent, legal obligations, validation and action-critical instructions must remain adequate.

### P2: Documentation can send future work toward superseded scanner behaviour

`tests/scanner/README.md` contains older decision and correction-layout expectations that conflict with the newer dated requirements in `ui/AGENTS.md`, including the removed Correct Recognition section. Proposed resolution: reconcile historical fixture documentation during scanner migration and link to current authority. Do not loosen current user requirements to satisfy stale prose or snapshots.

### P2: Responsive, focus and visual-state coverage needs a deliberate matrix

The passing navigation suite is a useful starting point. It does not prove uniform control metrics, readable contrast, custom picker edge handling, zoom or every route's narrow rendering. Different feature media queries and fixed/minimum table widths warrant rendered review.

Proposed resolution: local gallery plus representative page fixtures covering normal, focused, disabled, invalid, empty, loading, offline, unknown, selected and open states. Include long values, sign-bearing effects and live input preservation. Keep shell/iframe viewport and scroll ownership explicit.

### P2: Semantics and motion policy need shared defaults

The subagent found explicit `main` landmarks in only two of the eleven normal content pages (`crafting-stats` and `totals`). Ranking headers already demonstrate useful button/`aria-sort` semantics; target category tabs have roving keyboard navigation in `ui/crafting-purpose-editor.js:263–266`. Extend those patterns deliberately rather than adding ARIA indiscriminately. Validate landmark names across the shell and child document.

Focus styling is distributed across segmented controls (`ui/styles.css:1820`), target tabs (`ui/crafting-purposes.css:6`) and scanner targets (`ui/scanner.css:327`). Reduced-motion treatment exists locally near `ui/styles.css:2653`. Define shared focus/motion defaults and retain specialised geometry where required.

### P2: Number formatting lacks an explicit cross-page contract

Independent formatters include scores in `ui/app.js:685–686`, signed totals in `ui/totals.js:13`, observation rates in `ui/crafting-stats-tables.js:4`, probability/odds in `ui/crafting-probability-ui.js:17,29–32`, and timestamps in `ui/crafting-community-ui.js:34,51`. Different quantities legitimately need different precision. Define a quantity-specific display contract before extracting helpers; do not globally round all numbers the same way.

## Route classification

| Classification | Files |
|---|---|
| Active shell content (11) | `artifacts.html`, `collection.html`, `ratings.html`, `totals.html`, `scanner.html`, `storage-scanner.html`, `crafting-stats.html`, `council.html`, `council-collection.html`, `council-ratings.html`, `config.html` |
| Shell | `scanner-session.html` |
| Entry | `index.html` |
| Legacy Army route | `army.html`; preserve compatibility and removed-editor behaviour |
| Auxiliary documents | `privacy.html`, `crafting-statistics.html` (methodology, distinct from active `crafting-stats.html`) |

OAuth return is JavaScript (`auth-return.js`) associated with configuration, not another HTML page. Reconfirm the classification as files/routes evolve. Avoid reintroducing Army or treating the methodology document as a statistics-dashboard alias.

## Open decisions for implementation

- Final token values and density metrics require contrast and rendered checks. The proposal deliberately starts from the existing theme.
- Determine whether long single-choice stat lists need search; native selects remain the default until a concrete task justifies replacement.
- Choose popover placement mechanics after testing overflow/iframe boundaries; do not assume a z-index change solves clipping.
- Select representative visual baselines after deterministic fixtures exist. Avoid freezing existing visual defects into accepted screenshots.
- Verify the exact current check inventory and reconcile stale fixture instructions before expanding automation.

## Slate selection

The user selected Slate after reviewing the local style studies. It is now the application-wide palette and appearance contract, documented in `system.md`. The source findings above retain their original pre-migration evidence; old palette values in that evidence are historical, not defaults to copy.

## Migration follow-up

The shared foundation/control migration now implements the owners and checks listed in `README.md` and `consumers.json`. The observations above remain the historical baseline. Do not cite the original missing-gallery or unrun-shell limitations as the current implementation state. Fresh results are recorded in the generated `data/temp/design-review/report.json` and the completion report. Full manual accessibility/zoom and user visual sign-off remain separate.

No additional product feature, framework migration, deployment or data-schema change is required for the design consolidation.
