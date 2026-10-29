# Protected crafting score contract

Before changing crafting or owned-item comparison scores, read
`docs/artifact-rerolls.md`. Potential means the card's **actual five rows at
level 10, plus the gain from ONE best eligible reroll at level 10**. Never
replace all five rows hypothetically. For level-10 row scores
`150 + 30 + 15 + 0 + 0` and a legal replacement worth `150`, potential is
`195 + 150 = 345`, never `750`.

`scripts/test_crafting_score_contract.js` locks these hand-calculated examples
in the required scanner gate. Do not rewrite this rule or its expected examples
to accommodate an implementation. Reconcile an ambiguous request that appears
to change the one-reroll limit with the user before changing the contract.
Routine fixes that restore this contract do not require confirmation.

Crafting benchmarks use the owned item's Hall/type slot capacity from Collection:
War Equipment uses the fourth-best owned item; all other ordinary types use the
second-best. Apply this to strategy, saved-target and Rare Card recommendations.
Fewer than that many owned items means an open slot; ties do not replace items.

# Site-wide UI copy

Keep site UI copy to names, facts, and necessary actions. Do not add explanatory blurbs, introductory prose, redundant descriptions, or implementation details. Use concise labels, values, counts, statuses, and controls. Keep errors and instructions only when needed to complete an action. Apply this rule across all pages and new or edited UI, including scanner decision boxes.

# Shared UI design

For UI planning, implementation or review, read `docs/design/system.md` and `.agents/skills/dominations-ui/SKILL.md`. For broad consistency work, also read `docs/design/README.md` and `docs/design/audit.md`. Reuse shared component owners and documented variants instead of adding page-specific versions of base controls. Preserve the domain requirements in `ui/AGENTS.md`.

The design pack is the governing UI contract. Slate is the approved site-wide theme: cool graphite surfaces, soft gold accents, flat panels and outlined selections. Every page and the persistent shell use the same theme; do not introduce per-page palette overrides or load experimental study styles in production. Shared visual values live in `ui/design-tokens.css`; field, button, picker, rating, dialog and table primitives in `ui/components.css`; shared picker placement/dismissal in `ui/design-ui.js`. Load them through `ui/styles.css`; page CSS owns composition and documented domain variants. Do not add a competing base control style.

For UI changes, run `node scripts/check_design_system.cjs` and the relevant behaviour checks in `docs/design/README.md`. Shared visual changes also require `node scripts/test_design_ui.cjs` (use `--full` for the full viewport matrix). Review screenshots in `data/temp/design-review/index.html`. New routes, shared variants and justified exceptions must update `docs/design/consumers.json`, the specification and gallery/verification in the same change. Preserve existing exceptions only for their documented reason; do not refresh a baseline to conceal drift.
