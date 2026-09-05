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
- Wiki-only legendaries re-verified 2026-09-05 (Fandom API + DW `?s=` + prior sweep): **no** DominationsWorld/BHG hits → remain Uncertain
- Cake / Dilophosaurus / Tutankhamun: Fandom pages + statistic_table perks exist
- Benin / Lyre / Mona Lisa / Dodecahedron / Dung-Dkar: **no Fandom page** (nav phantoms)
- See `data/temp/official_sweep_posts.json`, `data/temp/uncertain_reverify.json`

## Targeted fixes this build

- British Kettle Drum mythical perks: OK 6
- Hall overrides for prior TBD: Analytical Engine=War, DomiNations Army Helmet=War, First Strike Star=Main, Mahiole=War
- Wiki statistic_table parser fixed (same-line `||` cells, rowspan, `||-N%` row split) → filled most legendary perk gaps
- `guess_grade` no longer treats historical prose "mythical" as Mythical grade
- Token costs / acquisition filled from wiki when present (no IAP sale prices in `cost`)

## Gaps (not complete)

- Legendary perk gap remaining: 6 (Leftwich Trophy empty wiki table + 5 nav-phantom Uncertain)
- Legendary token `cost` sparsely documented on wiki (4 filled); acquisition_method from wiki prose where stated
- Mythical max values intentionally blank (announcement numbers; no blind +9)
- Wiki-only legendaries marked `Uncertain` until BHG/DominationsWorld confirmation
- dominations-info.com API still 404; not used as primary

## Outputs

- `data/artifacts.csv`
- `data/artifacts.json`
- `data/perk_name_mapping.csv`
- `data/artifact_release_reconciliation.csv`
- `data/temp/conflicts.json` (130 draft-vs-wiki conflicts, draft preferred)
