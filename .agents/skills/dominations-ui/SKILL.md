---
name: dominations-ui
description: Plan, implement or review UI changes in the DomiNations Artifacts repository using its shared design specification, migration plan and protected scanner/editor behaviour. Use for page layout, controls, dropdowns, tables, styling and data display; not for backend-only or dataset-only work.
---

# DomiNations UI

Read the repository root `AGENTS.md`, `ui/AGENTS.md` for UI work, and [the design specification](../../../docs/design/system.md). Paths in the following instructions are relative to the repository root. The specification is the governing design contract. Check `docs/design/consumers.json` for implementation owners, page recipes and verified domain exceptions.

For broad consistency work or a new shared component, also read `docs/design/README.md` and `docs/design/audit.md`. For a narrow change, inspect the relevant component owner and one existing consumer first. Use `ui/design-tokens.css` for visual values, `ui/components.css` for primitives and `ui/design-ui.js` for picker placement/dismissal. All pages import them through `ui/styles.css`. Page styles own layout. When a gap requires a variant, define it once in the shared owner and update the specification and consumer map. Do not copy another page's control CSS into the current page.

Keep the dark/gold visual identity, compact data hierarchy and concise names/facts/actions copy. Use the specification's component contracts for normal/compact fields, buttons, pickers, tables, dialogs and numeric states. Retain native single selects unless long-list search needs justify a custom control. Multiple selection remains checkbox selection; action menus remain commands.

Preserve domain semantics: unknown versus zero, provisional versus verified, signed percentages, shared rating inheritance, exclusions, benchmark comparison and explicit target saves. Consult `docs/scanner-comparison.md` before scanner changes. Never simplify required scanner composition or draft/OCR lifecycles to fit a generic component.

Inspect both shell and embedded contexts. Keep accessible names, keyboard focus, popup dismissal, local table overflow and narrow-view actions working. Preserve focused input identity during asynchronous refreshes.

Run `node scripts/check_design_system.cjs` for UI changes. Shared visual changes also run `node scripts/test_design_ui.cjs`; `--full` covers the complete viewport matrix. Inspect the generated screenshots in `data/temp/design-review/index.html`. Use `tests/design/gallery.html` for component states. Validate behaviour proportionately using the delivery plan's check mapping. UI migration requires rendered checks of the changed page and another consumer of the shared component, including keyboard and narrow layouts. Source-only review must be described as source-only. Use isolated local fixtures and block external services. Record pre-existing failures separately; do not claim an unrun check passed.

In the completion report, state what changed, which shared patterns it uses, checks run and any remaining limitation. If adding a new convention, update the specification, consumer/exception registry and actual gallery/verification coverage together. Do not baseline unexplained new local control styles to make the ownership guard pass.
