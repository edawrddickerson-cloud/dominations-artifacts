# Completeness report

**Generated:** 2026-09-05  
**Builder:** `scripts/build_canonical.py`

## Counts

| Set | Rows | With ≥1 perk | Full expected slots |
|-----|------|--------------|---------------------|
| Legendary | 118 | 64 | 5 perks ideal; 62 have ≥5 |
| Mythical | 32 | 32 | 6 perks ideal; 32 have ≥6 |
| **Total** | **150** | **96** | |

## Draft vs canonical

- Legendary draft base: 110 → canonical legendary: 118 (includes wiki-only Uncertain candidates)
- Mythical draft base: 29 → canonical mythical: 32 (includes official June 2026 Marco extras if missing from draft)

## Official sweep (DominationsWorld, 2026-09-05)

- Confirmed on official posts: British Kettle Drum, Analytical Engine, First Strike Star, Mahiole, DomiNations Army Helmet
- June 2026 Marco's Wares mythicals **General Pershing's Bas-Relief**, **Joyeuse Sword**, **Silla Gold Crown** were missing from draft → added as Released
- Wiki-only legendaries (11th Anniversary Cake, Dilophosaurus Skull, Mask of Tutankhamun, Benin Royal Ivory Mask, Golden Lyre of Ur, Mona Lisa, Roman Dodecahedron, Tibetan Dung-Dkar): **no** DominationsWorld hit in swept posts → remain Uncertain
- See `data/temp/official_sweep_posts.json`

## Targeted fixes this build

- British Kettle Drum mythical perks: OK 6
- Hall overrides for prior TBD: Analytical Engine=War, DomiNations Army Helmet=War, First Strike Star=Main, Mahiole=War

## Gaps (not complete)

- Large legendary perk gap: 54 legendaries still have no perks
- Mythical max values intentionally blank (announcement numbers; no blind +9)
- Wiki-only legendaries marked `Uncertain` until BHG/DominationsWorld confirmation
- dominations-info.com API still 404; not used as primary

## Outputs

- `data/artifacts.csv`
- `data/artifacts.json`
- `data/perk_name_mapping.csv`
- `data/artifact_release_reconciliation.csv`
- `data/temp/conflicts.json` (70 draft-vs-wiki conflicts, draft preferred)
