# Canonical army metadata

`army_catalog.json` is the source of truth for unit names, training type
(`barracks`, `factory`, `air`), display order, legacy aliases, linked units,
and perk targets. The frontend derives its groups and rating matches from it.

Every known canonical perk has an explicit scope: `unit`, `type`, or
`independent`. Enemy and invading perks are independent of the player's army.
Group perks retain one rating per perk, applying while any unit of that type
is present; they do not overwrite individual unit perk ratings. APC's linked
Heavy Infantry also activates Barracks group perks.

`perk_signs` records each canonical stat's fixed polarity as `1` or `-1`,
separate from its offensive/defensive rating weight. The user confirms that
every Invading effect is negative and that no stat has both polarities.
Other signs come from consistent canonical/captured evidence; missing entries
remain unknown rather than defaulting positive. Scanner fuzzy suggestions,
exact-name validation, manual correction, and the catalogue exporter enforce
these rules without changing raw OCR signs or supplying missing signs.
The canonical builder normalises inconsistent source-derived artifact signs
to this registry and records an override in the artifact's notes.

Run `node scripts/audit_artifact_signs.js` to audit all three captured batches
and the current artifact database. The report and original correction log
are stored under `reports/artifact-sign-*-2026-10-11.json`.

Edit this file when adding units or perks, then run:

```text
node scripts/export_army_catalog.js
node scripts/test_army_catalog.js
```

The exporter validates references and coverage of the canonical perk mapping
and rating defaults. It creates `ui/data/army_catalog.json` and the synchronous
browser bundle `ui/data/army_catalog.js`. Do not edit those generated copies.
`scripts/build_canonical.py` also runs the exporter. Update the catalog script's
version in HTML pages when publishing metadata changes to invalidate caches.
