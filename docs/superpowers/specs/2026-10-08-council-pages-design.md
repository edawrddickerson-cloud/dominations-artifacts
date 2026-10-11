# Council Priority + Collection pages

**Date:** 2026-10-08  
**Status:** Implemented for review

## Goal

Two council pages in the same multi-page HTML app as Artifacts Priority / Collection:

1. **Council Priority** — filter, sort, Off/Def rate stats (like artifact Priority)
2. **Council Collection** — mark owned (with rarity) and activate up to 7 whose bonuses apply

## Safety vs parallel artifact work

- New files: `ui/council.html`, `ui/council-collection.html`, `ui/council.js`, `ui/council-collection.js`, `ui/council-shared.js`, `ui/council.css`, `ui/data/councilors.json`, `ui/data/council_stat_rating_defaults.json`
- Minimal edits: site-nav links only on `index.html` and `collection.html`
- No edits to `app.js`, `collection.js`, or `shared.js`

## Decisions

| Topic | Choice |
|--------|--------|
| War vs Multiplayer | Mode toggle; selects which bonus set is shown/scored |
| Off / Def | Preference ratings on stats (separate from War/MP) |
| Owned rarity | Tracked per owned councilor; active 7 use that rarity |
| Browse rarity | Global rarity selector (default Legendary) scores everyone |
| Active 7 types | Any 7 owned; no type slot rules in v1 |
| Ratings DB | Separate `dn-council-stat-ratings`; defaults seeded from matching artifact perk defaults |

## localStorage keys

- `dn-council-owned` — `{ [id]: { rarity } }`
- `dn-council-active` — string[] (max 7)
- `dn-council-stat-ratings` — `{ v, ratings }`
- `dn-council-ui` — `{ mode, rarity }`
- `dn-council-pref-sort-axes`
- `dn-council-hide-owned`

## Data

- Source: `data/raw/grege117_councilors.json` → `ui/data/councilors.json`
- Defaults builder: `data/temp/_build_council_ui_data.py` → `ui/data/council_stat_rating_defaults.json`
