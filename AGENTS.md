# Site-wide UI copy

Keep site UI copy to names, facts, and necessary actions. Do not add explanatory blurbs, introductory prose, redundant descriptions, or implementation details. Use concise labels, values, counts, statuses, and controls. Keep errors and instructions only when needed to complete an action. Apply this rule across all pages and new or edited UI, including scanner decision boxes.

# Shared UI design

For UI planning, implementation or review, read `docs/design/system.md` and `.agents/skills/dominations-ui/SKILL.md`. For broad consistency work, also read `docs/design/README.md` and `docs/design/audit.md`. Reuse shared component owners and documented variants instead of adding page-specific versions of base controls. Preserve the domain requirements in `ui/AGENTS.md`.

The design pack is the governing UI contract. Slate is the approved site-wide theme: cool graphite surfaces, soft gold accents, flat panels and outlined selections. Every page and the persistent shell use the same theme; do not introduce per-page palette overrides or load experimental study styles in production. Shared visual values live in `ui/design-tokens.css`; field, button, picker, rating, dialog and table primitives in `ui/components.css`; shared picker placement/dismissal in `ui/design-ui.js`. Load them through `ui/styles.css`; page CSS owns composition and documented domain variants. Do not add a competing base control style.

For UI changes, run `node scripts/check_design_system.cjs` and the relevant behaviour checks in `docs/design/README.md`. Shared visual changes also require `node scripts/test_design_ui.cjs` (use `--full` for the full viewport matrix). Review screenshots in `data/temp/design-review/index.html`. New routes, shared variants and justified exceptions must update `docs/design/consumers.json`, the specification and gallery/verification in the same change. Preserve existing exceptions only for their documented reason; do not refresh a baseline to conceal drift.
