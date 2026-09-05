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

## Official sweep (DominationsWorld / BHG, 2026-09-05)

- Confirmed on official posts: British Kettle Drum, Analytical Engine, First Strike Star, Mahiole, DomiNations Army Helmet
- June 2026 Marco's Wares mythicals **General Pershing's Bas-Relief**, **Joyeuse Sword**, **Silla Gold Crown** were missing from draft → added as Released
- Deep DW blog pass: **11th Anniversary Cake** and **Dilophosaurus Skull** → Released
- **Mask of Tutankhamun** → **Released** (July 2025 Legendary Calendar lists “The Mask of Tutankhamun” at 100 tokens; prior Week Ahead hits were King Tut event flavor only)
- Nav phantoms (Benin / Lyre / Mona Lisa / Dodecahedron / Dung-Dkar): still no Fandom page or DW/BHG hit → **kept Uncertain** (not removed; no proof never shipped)
- **Leftwich Trophy** → **Uncertain** (BHGAustin 2025-08: created but never sold; nobody has it; Showcase placeholder; disabling. Perks never published — not invented)
- Legendary token costs from May–Aug 2025 calendars + Aug 2023 calendar + 9th Ann vault (`data/raw/dw_legendary_token_costs.json`)
- Cost source map: `data/temp/token_cost_source_map.md`; mines in `data/temp/dw_calendar_final_mine.json`

## Targeted fixes this build

- **Hall/grade model:** Mythical is a grade (tier), not a hall. Canonical `hall` is Main or War for both Legendary and Mythical; `museum_hall` left blank (was previously used to stash Main/War under `hall=Mythical`).
- British Kettle Drum mythical perks: OK 6
- Hall overrides for prior TBD: First Strike Star=Main, Analytical Engine=War, DomiNations Army Helmet=War, Mahiole=War
- Wiki statistic_table parser fixed (same-line `||` cells, rowspan, `||-N%` row split) → filled most legendary perk gaps
- `guess_grade` no longer treats historical prose "mythical" as Mythical grade
- Token costs from wiki + DominationsWorld calendars (no IAP sale prices in `cost`)

## Gaps (not complete)

- Legendary perk gap remaining: 6 (Leftwich Uncertain + 5 nav-phantom Uncertain)
- Legendary token `cost`: 57 / 118 filled (more older calendars may exist; 2024 calendars not found as dedicated posts)
- Mythical max values intentionally blank (announcement numbers; no blind +9)
- Uncertain legendaries: Leftwich (never sold) + 5 nav phantoms
- dominations-info.com API still 404; not used as primary

## Outputs

- `data/artifacts.csv`
- `data/artifacts.json`
- `data/perk_name_mapping.csv`
- `data/artifact_release_reconciliation.csv`
- `data/temp/conflicts.json` (130 draft-vs-wiki conflicts, draft preferred)
