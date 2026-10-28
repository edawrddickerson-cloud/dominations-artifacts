# DomiNations UI design specification

Status: governing design contract, 25 October 2026. Shared foundations and primitives are implemented across the first-party routes. The consumer registry records owners and domain exceptions; the delivery plan distinguishes implemented coverage from remaining manual validation. Existing user requirements in `AGENTS.md` and `ui/AGENTS.md` take precedence. Read [the delivery plan](README.md) for implementation order and validation.

## Direction and existing strengths

Slate is the approved default across the entire application: cool graphite canvas/panels, soft gold accents, flat surfaces and outlined selections. Use this theme for all future UI work. The artifact artwork, museum slots, table-first comparison, persistent navigation, Main/War context and profile controls already give the application an identity. Carry these strengths through Slate with the existing frontend architecture.

Use the same vocabulary, control treatment and hierarchy across pages. Give different tasks appropriate compositions: an inventory, a ratings editor and a live scanner need different layouts. Consistency means shared parts and predictable behaviour, not identical page templates.

Keep visible copy to names, facts, counts, statuses and necessary actions. Do not add marketing text, instructional introductions or implementation explanations to application pages. These design documents are developer documentation, not proposed UI copy.

## Slate appearance

Slate is implemented in the shared owners, not behind a page attribute or a theme switch. The registry records the approved palette and asset version; the ownership check rejects competing page palette definitions. All first-party routes load the same version through `styles.css`, including shell/iframe contexts and auxiliary documents.

Use flat `--panel` surfaces for toolbars, cards, settings sections and dialogs, and `--surface-raised` for headers/selected controls. Borders and separators use `--line`; native fields and interactive boundaries use `--control-edge`. Gold is an emphasis and selection cue. Keep solid gold for primary actions; navigation, segments and category tabs indicate selection with a raised surface and gold outline/edge/text. `.btn-choice` provides the flat saved-row selection variant with explicit `aria-pressed` state. Its selected background is `--selected-bg: #353329`.

Collection Targets keeps the approved Slate composition: framed category tabs, flat saved-target rows, a subtle divider below the saved list, a framed name/action toolbar, neutral section headings, and a dashed divider between selection and rating panels. Narrow views stack the panels and move that divider to the top. Other pages apply the same surface/selection vocabulary to their existing compositions; do not copy this editor layout onto scanners or collections.

Collection Targets has five views: Attacking, Defensive, Economy, Rare Cards and Rating Defaults. The shared `.crafting-purpose-tabs-five` variant uses five columns, three below 901px, two below 641px and one below 361px; full labels wrap. Rating Defaults replaces the former Advanced ratings disclosure and owns the existing global/group/profile/strategy rating controls. Its DOM stays mounted across tab switches to retain filters and editing state. Only the selected view is visible. All five tabs support arrows, Home/End and one tab stop; category drafts survive every view switch.

Blank and newly added Attacking target drafts start with Include All Enemy Building & Defender Debuffs checked. Users may uncheck it; that choice survives tab switches and explicit saves. Existing saved targets retain their selections. Defensive and Economy draft defaults are unchanged. Initial defaults are part of the clean draft baseline and do not create an unsaved-change warning by themselves.

The Rare Cards view groups combined unit presets and one preset per evidenced ordinary-crafted stat into Attacking, Defensive and Economy, following the target category mapping. Each family has a shared Off all button that disables its unit and stat presets atomically, preserves other families, and retains focus. Every preset has a shared `.seg.seg-equal` Matching lines control (3× and 4× / 4× only / Off). Unit presets also have Stats (Damage & HP / Damage / Hitpoints); individual-stat presets use their exact named stat. Defaults are 3× and 4× with Damage & HP for units. These profile settings save immediately; category target drafts retain their explicit-save lifecycle. The scanner combines all enabled presets into one Rare Card decision row, with strict preset-specific owned top-two comparison for the same hall and artifact type. Rarity uses the identical stat set in the Crafting Stats model and labels its personal sample; insufficient data remains explicit.

Avoid decorative brown/teal page gradients and local neutral palettes. Reserve shadows for overlays. Ownership/active equipment, signed effects, OCR uncertainty, stat tiers and scanner Keep/Discard remain distinct domain states with their documented colours. Theme work must not recolour these states into generic gold selection.

Rare-card eligibility comes from positive ordinary hall/type evidence in `DN_CRAFTED_PERK_POOLS`, loaded before the purpose service in every consumer. Full artifact metadata and named Legendary/Mythical examples do not establish craftability. The list uses the union of evidenced crafted stats across types; scanner qualification, inline rare scoring and rarity use the selected hall/type subset. These pools are incomplete: absence means unsupported by the current evidence, not proof that a stat can never be crafted. Combined unit rows require both evidenced damage and hitpoint stats and explicitly name that combination, such as Fighter · Damage / Hitpoints.

Rare-card rows share three dedicated columns: preset name, Matching lines and Stats. Matching lines must occupy the same column for individual-stat and combined-unit presets; absent Stats controls leave the third column empty. Do not let auto-sized per-row columns shift controls between these positions. Below 901px, rows stack into distinct labelled groups while preserving full labels. Browser checks verify cross-row alignment on desktop and text fit down to 320px.

## Foundations

The values below are implemented in `ui/design-tokens.css`. Use these tokens rather than repeating literals in page styles. Changes to values require contrast checks and rendered review of their consumers.

| Role | Shared value / rule |
|---|---|
| Canvas | `--bg: #191e26` |
| Surface | `--panel: #232b36` |
| Raised surface | `--surface-raised: #2c3643` |
| Borders | `--line: #3b4655` for separators; `--control-edge: #8793a4` for interactive boundaries |
| Primary / secondary text | `--text: #e8edf4`, `--muted: #b1bdcc` |
| Accent / selection | `--accent: #d5b779`; selection also uses pressed/checked state or an edge |
| Keyboard focus | `--focus: #8bbcf2`, 2px outline with visible offset; do not replace it with colour change alone |
| Fonts | Existing Segoe UI stack; tabular numerals for comparable numeric values; mono only for diagnostic identifiers |
| Type roles | Page title 1.25rem; section title 1rem; body/control .875rem; dense table .8125rem; metadata .75rem |
| Spacing | .25rem base; .25, .5, .75, 1, 1.5, 2rem scale; .125rem only for documented dense row details |
| Radius | .25rem controls; .375rem panels/popovers; .5rem dialogs; avoid different radii per page |
| Controls | Normal 2.25rem minimum height; compact 1.875rem; native numeric editors retain the common 2.4rem stepper geometry |
| Pointer targets | Keep touch/coarse-pointer controls at least 2.75rem where possible; expand hit area without enlarging every data row |
| Borders / elevation | 1px border; one shared popover shadow and one dialog shadow; reserve elevation for overlays |
| Motion | Brief state transitions only; respect reduced motion; OCR updates must not animate table dimensions |

Semantic tokens define success, danger, warning, unknown, selected and disabled states; inspect `ui/design-tokens.css` for their foreground, surface and edge values. Do not reuse owned-item green as a universal success colour without checking meaning and contrast. Gold indicates selection or a primary action, not success. Danger styling identifies destructive actions. Keep scanner decision colours as a documented domain variant.

Acceptance targets follow [WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/quickref/). Normal text requires 4.5:1 contrast; large text 3:1; control boundaries and meaningful state/focus indicators 3:1 against adjacent colours. Decorative separators and disabled controls have distinct exemptions. The token check measures the specified text/surface, field-edge and focus pairs; it does not establish conformance for every rendered pixel.

At 200% text scaling, keep controls and actions usable without clipped text. At 320 CSS px width (the reflow equivalent of 400% zoom on a 1280px viewport), avoid document-level horizontal scrolling. Data tables may scroll locally when their two-dimensional relationships require it. The scanner must preserve the five-stat/image ordering; adapt available columns and image size before considering any domain-layout exception. Do not waive overflow just because a route is a scanner. Test desktop browser zoom separately from emulated viewport width before claiming full zoom sign-off.

Every content document has one `main` landmark (native or equivalent role), a meaningful title and labelled sections; the persistent shell owns navigation and its skip-to-content action. Keep heading levels meaningful within each document. Keyboard users can reach and operate every control, see focus without it being hidden by sticky regions, dismiss pickers with Escape, and return from dialogs to their invoker. Disabled/invalid/loading/unknown/selected states must remain distinguishable beyond colour alone. Manual screen-reader, browser-native select popup and full zoom checks remain required for a conformance claim.

## Component contracts

### Full control labels — required

Always display complete option labels and selected values. Never use ellipsis, clipped text, line clamping or title-only disclosure to compensate for a control that is too narrow. This applies to native selects, segmented controls, buttons, tabs and picker triggers, including every side of a toggle. Allocate width from the longest option, including padding, borders and the native select arrow. If a complete native selected value cannot fit, reflow its container or use visible segmented choices; simply removing ellipsis does not fix clipping. Segments may wrap their labels and grow vertically while keeping every choice visible.

Verify real rendered text bounds, not only document overflow or CSS widths, at 1440, 1024, 768, 390 and 320px and with 200% text scaling. Exercise every label and selection, including disabled/off states and long names. The design guard rejects ellipsis in shared control primitives; the rendered review checks actual rare-toggle text bounds and focus. A screenshot with clipped control text fails review even if automated overflow checks pass.

The shared `.seg-equal` variant gives each choice an equal grid column, permits full-label wrapping and preserves `.seg-btn` appearance, pressed state and keyboard focus. Use it for visible two/three-way choices. Domain CSS may stack the groups, but must not truncate the individual labels.

The shared owner is `ui/components.css`, loaded by `ui/styles.css`. Public classes include `.btn`, `.btn-primary`, `.btn-accent`, `.btn-quiet`, `.btn-choice`, `.btn-danger`, `.btn-small`, `.btn-prominent`, `.ui-compact`, `.seg`, `.seg-btn`, `.rating-input`, `.th-sort` (including the statistics `.crafted-stats-sort` alias) and `.ui-document`. Native fields use element selectors. Existing picker classes are supported by the same owner to avoid rebuilding stateful consumer DOM. `ui/design-ui.js` owns presentation-only dismissal, focus return and viewport placement.

| Component | Shared contract | Permitted variants |
|---|---|---|
| Field | Visible label, stable control ID, hint/error association only when needed; shared font, border, radius, focus, disabled and invalid states | Normal, compact, inline |
| Single select | Label + current value; native `select` by default; shared closed-control styling | Short fixed choices; searchable single-choice picker only when long lists justify it |
| Multiple-choice picker | Shared trigger, selected summary, checkbox rows, optional search and bulk actions | Flat or grouped options; group membership retains domain rules |
| Action menu | Actions rendered as buttons/links; commands do not appear as a selected value | Small contextual menu |
| Button | Shared height, padding, font and focus; loading does not change width | Primary, secondary, quiet, danger; flat choice with `aria-pressed`; compact size |
| Segmented control | Visible bounded set with explicit state | Single-choice group or independently pressed toggles, based on actual semantics |
| Tabs | One active panel, stable labels, appropriate keyboard semantics | Category and statistics tabs; never infer a save operation from tab switching |
| Checkbox / switch | Checkbox for inclusion; switch for immediate on/off settings; accessible label and state | Dense checkbox row |
| Numeric/rating input | Validated range, signed values where meaningful, stable width; inherited and explicit values distinguishable | Shared 0–10 ratings; other domain ranges remain separate |
| Dialog | Shared heading, surface, backdrop and spacing; secondary/cancel first, destructive or save action last; least destructive initial focus; native focus containment and return | Unsaved Save/Discard/Cancel; delete confirmation; service consent |
| Data table | Shared header/sort treatment, row spacing, numeric alignment, local horizontal overflow | Browse, editable ratings, comparison matrix, live five-stat scanner |
| Identity/card | Artwork, name and concise metadata with consistent selected/owned states | Artifact, council member, museum slot |
| Status | Concise factual text plus semantic treatment; not colour alone | Empty, loading, error, offline, syncing, unknown |
| Disclosure | Native `details/summary` or equivalent accessible disclosure | Settings or optional detail; appearance shared with other controls where appropriate |

### Dropdown and popover decisions

1. Keep native single selects for profile, sort order, category, source and similar bounded choices. Native popup rendering varies by browser/OS; normalise the closed field and surrounding layout, and document that platform exception. Do not build custom listboxes solely to control native popup pixels.
2. Use one checkbox-popover family for perk filters, comparison selection and probability perk sets. Preserve their different domain data and selection scopes. A checkbox popover is a labelled group of controls, not an ARIA action menu or single-choice listbox.
3. A long single-choice list may use a searchable picker if a demonstrated task warrants it. Specify typing, arrows, Enter, Escape, selection and focus behaviour before replacing a native control.
4. Triggers share a chevron, value typography, padding, focus and disabled states. Summaries use `All`, one selected name, or `N selected` as appropriate. Do not treat an empty selection as `All` unless that filter's model explicitly does so.
5. Multi-select changes apply immediately for filters; target drafts remain drafts until Save target. Clear and Select visible actions describe their scope accurately. Filtering options must retain hidden selections.
6. Open at the trigger, flip or constrain to visible space, keep options within a scrollable panel, and avoid clipping by table/overflow ancestors. Escape closes and returns focus to the trigger; outside click closes without discarding changes. Only one picker in the same document should stay open. Preserve normal Tab navigation through search, bulk actions and checkboxes.
7. Overlays must work inside the shell's iframe. A child overlay cannot escape its frame through a larger z-index. Anchor within the available child viewport; shell-owned controls use shell-owned overlays. Verify keyboard/focus across the boundary and avoid a second fixed header.
8. Native select popup geometry is tested manually where automation cannot capture it. Custom panels get automated focus and overflow checks.

### Data representation

| Data | Display and behaviour |
|---|---|
| Names | Canonical artifact/stat/target names; preserve sign and canonical polarity; don't shorten distinct names into ambiguous labels |
| Numeric columns | Right align comparable values and headings; use tabular numerals; align units and decimal precision within a column |
| Percentages | Signed perk percentages where applicable; probability percentages are unsigned. Preserve domain precision and canonical raw values |
| Scores | Whole or decimal precision according to the scoring contract; never introduce rounding that changes ranking or qualification |
| Unknown vs zero | Unknown/unavailable uses `—`; known zero uses `0`; unresolved state never qualifies by looking like zero |
| Provisional score | Existing scanner notation such as `~20`; preserve numeric comparison and separate verified eligibility rules |
| Reroll | Preserve base plus gain, such as `20 + 60`, and the dedicated Dice column; do not merge it into a generic score |
| Sample/probability | Keep source, sample count and context when they affect interpretation; preserve current odds-first, percentage-second result hierarchy |
| Counts / observation rates | Integer counts with consistent locale grouping; rates retain numerator, denominator and eligible-sample context where needed |
| Dates / timestamps | Consistent locale presentation; distinguish date-only values from instants and preserve explicit UTC boundaries for weekly reports |
| Sorting | Keyboard-operable header button, `aria-sort`, consistent indicator; deterministic ties; only user sort actions reorder editable lists |
| Rating inheritance | Explicit, inherited and excluded are different states. Clearing an override restores inheritance; zero does not mean excluded |
| Selection | Distinguish current row/target, checkbox inclusion, ownership and active equipment; don't use a single gold/green state for all four |
| Empty/error | Distinguish no saved items, no filter matches, no sample, unavailable service and unknown OCR. One concise fact and an applicable action |
| Statistics | Prefer comparable tables/cards over decorative charts. If charts add value, include units, legend, sample/context and an accessible table |

Format at the presentation boundary. A shared formatter must receive enough context to distinguish probability, signed effect and score; it must not turn every number into one universal format. Display changes must not mutate persisted or canonical data.

Use Collection Target for the current saved target entity. Keep Strategy and Purpose only where they denote distinct existing models; do not rename persisted schema keys merely to align visible labels. Use Owned for collection membership, Active for equipped use, Selected for the current UI choice, Included for stat membership and Saved for persisted drafts. Qualification and provisional evidence are separate states. These distinctions should guide labels and accessible names as well as colours.

### Page composition and responsive behaviour

Keep a single persistent shell owning navigation, global profile and context controls. Embedded documents own page content. Planning contains Collection Targets and Artifact Rankings. First-party page navigation belongs in the side menu, including Statistics Methods. Privacy is the exception: it never has a side-menu entry and is linked only from Data & privacy details in Profiles. Do not otherwise repeat page links or navigation buttons inside page content, dialogs, notices, pickers or empty states; stat names remain plain text. Keep download actions, external references, contact links and entry/legacy redirect fallbacks. Use the existing allowlist/routing model and preserve history, capture lifetime and OAuth handoff. Privacy and methodology documents use the same shell.

For browsing pages, use a compact filter toolbar, result count and main table/cards. For editors, use a target/list context and an editing panel with explicit save actions where required. For collection pages, retain museum slots and artwork before detail/comparison. For statistics, keep calculator, context, results and evidence hierarchy. For scanner pages, retain their specialised live workspace.

The Crafting Scanner ends with Last 3 crafted items, newest first by original capture time within the active profile. Each compact row uses a native disclosure for the five stats and the shared `.btn.btn-small` Add to Collection action. Keep action nodes stable during OCR refresh. Older records remain in the full Crafting Stats log; recent rows use those same records and physical-item save IDs. Optional star/dice capture fields do not block an explicit save of complete stats, Hall and category. Unknown fields retain their provenance. Failed saves show a visible retryable error. Verify with `node scripts/test_crafting_scanner_contract.cjs`; its desktop/phone screenshots appear in `data/temp/design-review/index.html`.

Crafting Stats uses the same framed three-column tabs as Collection Targets: Personal Stats, Community Stats and Probability Calculator. Below 361px the shared tabs stack to preserve full names. Community Stats opens by default; only the selected view is visible. Tabs support ArrowLeft/ArrowRight, Home/End and a single tab stop. Statistics filters and distributions belong to the statistics views. The calculator has an independent Personal/Community data-source select and retains its inputs across tab switches. Inputs and odds sit side by side when space allows; requirements wrap before control text clips, with tier patterns below aligned fields. Tab appearance and geometry live in `components.css`; page styles own calculator composition.

Use content-driven wrapping with shared initial breakpoint tiers at 900px and 640px. Existing 480/600px rules need review, not blind deletion. Test 1440×900, 1024×768, 768×1024 and 390×844 plus zoom. Narrow layouts stack toolbars and optional panels, allow table-local horizontal scrolling and keep actions reachable. Do not hide required columns or reverse scanner image/stat ordering without an explicit requirement change. The scanner's five-stat/image row and compact decision layout are protected constraints. At phone widths, keep a 7rem minimum stat-name column, a smaller image alongside it, and local keyboard-scrollable overflow when the combined columns need more than the available width. Preserve all five rows and their order.

Define scroll ownership for each composition. Dense table workspaces may own a bounded scroll container; long settings pages may use document scrolling. Avoid accidental nested vertical scrolling and keep sticky headings below the shell header. Popovers, dialogs and focus rings must remain visible.

## Protected behaviours

These are migration constraints, not opportunities for a visual redesign to change product logic:

- Collection Target category drafts survive category switches. Save/Discard/Cancel protects profile and page navigation; saving all pending tabs is atomic and failed validation keeps the dialog open. Shared ratings save immediately.
- Target category membership, add-on sources, exclusions, donor references and schema migration remain canonical. Do not reintroduce the removed Army editor or retired General targets.
- Keep scanner focus selection/pinning, target row ordering, three-unlocked-row override, Keep/Discard wording, uncertain numeric notation, signed effects and benchmark distinctions. Follow the latest dated rule when older prose is superseded.
- Keep five read stats plus artifact image above the decision box; preserve name/score headings, multiplier, Max score and Dice columns, inline Edit behaviour, input identity, focus and scrolling.
- Inline scanner Edit pauses automatic OCR, rejects in-flight results and resumes the latest frame. Styling work must not rebuild focused inputs on every read.
- Own-item/crafting/purpose scores keep the existing shared ratings and selection logic. A green numeric tie is not automatically a replacement qualification.
- Preserve account, sync, consent and local-data boundaries. Preview fixtures must not send telemetry, request capture or change a real account.

Read `ui/AGENTS.md` and the relevant domain documentation for the full contract before changing these areas. This summary does not supersede them.

## Implementation ownership

Dependency direction: `ui/design-tokens.css` → `ui/components.css` → page compositions in `ui/styles.css` and feature styles. `ui/styles.css` imports the first two owners before composition rules. Keep page modules responsible for domain state; `ui/design-ui.js` handles repeated picker dismissal/focus/placement without rebuilding inputs or changing selections. Dynamic stylesheet/script references use the same migration asset version.

During migration, preserve existing token names as aliases where needed and load common definitions consistently in the shell and embedded documents. Extract old declarations when a consumer migrates; avoid permanently appending another override layer. Page CSS can set layout and documented variants; repeated control colours, focus, radius and typography belong to the shared component.

Record exceptions with component, consumer, reason and check. Legitimate exceptions include native popup rendering, scanner compact rows and specialised rating grids. A copied page rule without a reason is drift. New component variants must update this specification, the component gallery and affected checks in the same change.
