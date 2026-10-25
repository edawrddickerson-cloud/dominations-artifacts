# Collection Targets style studies

Slate has been selected and promoted to the production shared owners. This folder retains the exploratory studies; the canonical theme is now `ui/design-tokens.css`, `ui/components.css` and `docs/design/system.md`.

Requested alternatives to the approved shared design baseline. These are local visual proposals, not new production conventions. All three preserve the dark/gold identity and use the actual rendered target editor with the same sample targets, fields and selections.

- **Bronze:** warm charcoal, bronze edges, underline tabs and framed selection/rating panels.
- **Slate:** cooler graphite, softer gold, flat saved-target rows and a framed editor toolbar.
- **Workbench:** original palette, tighter spacing, wider workspace and a taller visible rating list.

Run `node scripts/preview_target_styles.cjs`. Open `data/temp/target-styles/index.html` through the local server, or `compare.html` for the four-way comparison including Current. The preview supports all three categories and desktop/tablet/phone widths. Screenshots and checks are generated alongside it.

Snapshots come from the production DOM in a fresh browser profile. Application scripts are removed; a content security policy blocks scripts, connections and form submission inside the snapshots. The viewer only switches snapshots/styles and permits native control inspection. Changes are not saved and do not affect an account or the production page.

If a study is selected for implementation, promote its tokens/composition into the documented shared owners, update the specification and consumer registry, and run the normal UI/domain checks. Do not load `variants.css` in a production route.
