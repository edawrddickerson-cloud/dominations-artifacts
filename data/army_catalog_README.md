# Canonical army metadata

`army_catalog.json` is the source of truth for unit names, training type
(`barracks`, `factory`, `air`), display order, legacy aliases, linked units,
and perk targets. The frontend derives its groups and rating matches from it.

Every known canonical perk has an explicit scope: `unit`, `type`, or
`independent`. Enemy and invading perks are independent of the player's army.
Group perks retain one rating per perk, applying while any unit of that type
is present; they do not overwrite individual unit perk ratings. APC's linked
Heavy Infantry also activates Barracks group perks.

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
