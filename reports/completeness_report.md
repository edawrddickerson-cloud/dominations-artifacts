# Completeness report

**Generated:** 2026-09-05  
**Builder:** `scripts/build_canonical.py`

## Counts

| Set | Rows | With ≥1 perk | Full expected slots |
|-----|------|--------------|---------------------|
| Legendary | 118 | 112 | 5 perks ideal; 112 have ≥5 |
| Mythical | 32 | 32 | 6 perks ideal; 32 have ≥6 |
| **Total** | **150** | **144** | |

## Draft vs canonical

- Legendary draft base: 110 → canonical legendary: 118 (includes wiki-only Uncertain candidates)
- Mythical draft base: 29 → canonical mythical: 32 (includes official June 2026 Marco extras if missing from draft)

## Official sweep (DominationsWorld, 2026-09-05)

- Confirmed on official posts: British Kettle Drum, Analytical Engine, First Strike Star, Mahiole, DomiNations Army Helmet
- June 2026 Marco's Wares mythicals **General Pershing's Bas-Relief**, **Joyeuse Sword**, **Silla Gold Crown** were missing from draft → added as Released
- Deep DW blog pass (151 posts): **11th Anniversary Cake** (week-ahead-33026) and **Dilophosaurus Skull** (update-133 / week-ahead-2926) flipped to **Released**
- **Mask of Tutankhamun**: DW Tutankhamun hits are King Tut event flavor only → remain Uncertain
- Nav phantoms (Benin / Lyre / Mona Lisa / Dodecahedron / Dung-Dkar): still no Fandom page or DW hit → **kept Uncertain** (not removed; no proof never shipped)
- Leftwich Trophy: no perks found (empty wiki table; no DW; no Fandom image) — not invented
- Legendary token costs filled from August token calendar + 9th Anniversary vault where blank
- See `data/temp/dw_cost_mine.json`, `data/temp/dw_legendary_costs.json`, `data/temp/uncertain_reverify.json`

## Targeted fixes this build

- British Kettle Drum mythical perks: OK 6
- Hall overrides for prior TBD: Analytical Engine=War, DomiNations Army Helmet=War, First Strike Star=Main, Mahiole=War
- Wiki statistic_table parser fixed (same-line `||` cells, rowspan, `||-N%` row split) → filled most legendary perk gaps
- `guess_grade` no longer treats historical prose "mythical" as Mythical grade
- Token costs from wiki + DominationsWorld calendars (no IAP sale prices in `cost`)

## Gaps (not complete)

- Legendary perk gap remaining: 6 (Leftwich Trophy + 5 nav-phantom Uncertain)
- Legendary token `cost` still incomplete (21 / 118 filled); more Marco calendars may exist
- Mythical max values intentionally blank (announcement numbers; no blind +9)
- Uncertain legendaries: Tutankhamun + 5 nav phantoms (pending stronger evidence)
- dominations-info.com API still 404; not used as primary

## Outputs

- `data/artifacts.csv`
- `data/artifacts.json`
- `data/perk_name_mapping.csv`
- `data/artifact_release_reconciliation.csv`
- `data/temp/conflicts.json` (130 draft-vs-wiki conflicts, draft preferred)
