# Discrepancies

**Generated:** 2026-09-05

## Draft vs wiki perk conflicts

Count: **70** (logged in `data/temp/conflicts.json`).  
Resolution rule: **prefer draft/official** over wiki when both present.

| Artifact | Slot | Draft | Wiki |
|---|---|---|---|
| Keyed English Guitar (Legendary) | 1 | Enemy Tower Damage -11 | Enemy Tower HP -11 |
| Keyed English Guitar (Legendary) | 2 | Enemy Tower HP -11 | Enemy Sniper Tower DMG -16 |
| Keyed English Guitar (Legendary) | 3 | Enemy Sniper Tower Damage -16 | Heavy Tank DMG 11 |
| Swimming Reindeer (Legendary) | 1 | Defender HP 11 | Defender Hitpoints 11 |
| Analytical Engine (Legendary) | 1 | Invading Bomber Damage -11 | Invading Bomber Damage 11 |
| Analytical Engine (Legendary) | 2 | All Defensive Towers HP 8 | All Defensive Towers Hitpoints 8 |
| Analytical Engine (Legendary) | 3 | Catapult HP 11 | Catapult Hitpoints 11 |
| Analytical Engine (Legendary) | 4 | Tower HP 11 | Tower Hitpoints 11 |
| Analytical Engine (Legendary) | 5 | Defender HP 6 | Defender Hitpoints 6 |
| DomiNations Army Helmet (Legendary) | 3 | Generals' HP 6 | Generals' Hitpoints 6 |
| DomiNations Army Helmet (Legendary) | 4 | Enemy Catapult HP -6 | Enemy Catapult Hitpoints -6 |
| DomiNations Army Helmet (Legendary) | 5 | Enemy Anti-Tank Gun HP -6 | Enemy Anti-Tank Gun Hitpoints -6 |
| First Strike Star (Legendary) | 3 | All Enemy Defensive Towers HP -3 | All Enemy Defensive Towers Hitpoints -3 |
| First Strike Star (Legendary) | 4 | Enemy Defender HP -3 | Enemy Defender Hitpoints -3 |
| Mahiole (Legendary) | 4 | Wall Sapper HP 11 | Wall Sapper Hitpoints 11 |
| 6th Anniversary Six-Shooter (Legendary) | 3 | Bomber HP 9 | Bomber Hitpoints 9 |
| Alfred Jewel (Legendary) | 3 | APC HP 6 | APC Hitpoints 6 |
| Mold Gold Cape (Legendary) | 1 | Invading Sabotage Duration -11 | Enemy Sabotage Duration -11 |
| Mold Gold Cape (Legendary) | 3 | Generals' HP 8 | Generals' Hitpoints 8 |
| Mold Gold Cape (Legendary) | 4 | Invading Bomber Damage 11 | Invading Bomber Damage -11 |
| Mold Gold Cape (Legendary) | 5 | All Defensive Towers HP & Damage 3 | All Defensive Towers Hitpoints and Damage 3 |
| Trundholm Sun Chariot (Legendary) | 3 | Invading Bomber HP -7 | Invading Bomber Hitpoints -7 |
| Trundholm Sun Chariot (Legendary) | 4 | Invading Transport HP -7 | Invading Transport Hitpoints -7 |
| Enigma Machine (Mythical) | 1 | Enemy Defender HP -16 | Enemy Defender Hitpoints -16 |
| Mask of Agamemnon (Mythical) | 1 | All Defensive Towers HP & Damage 8 | All Defensive Tower HP & DMG 8 |
| Mask of Agamemnon (Mythical) | 2 | Tower HP 16 | All Defensive Tower Damage 12 |
| Arm Reliquary of Charlemagne (Mythical) | 1 | Transport Cooldown -12 | Transport Cooldown -11 |
| Arm Reliquary of Charlemagne (Mythical) | 3 | Paratrooper HP 15 | Paratrooper Hitpoints 15 |
| Caligula's Ring (Mythical) | 3 | Paratrooper HP 14 | Paratrooper Hitpoints 14 |
| Da Vinci's Flying Machine (Mythical) | 1 | Fighter HP & Damage 7 | Fighter Hitpoints & Damage 7 |
| Da Vinci's Flying Machine (Mythical) | 2 | Fighter Damage 11 | Fighters Damage 11 |
| Da Vinci's Flying Machine (Mythical) | 3 | Fighter HP 11 | Fighters Hitpoints 11 |
| Da Vinci's Flying Machine (Mythical) | 4 | Fighter HP 11 | Fighters Hitpoints 11 |
| Da Vinci's Flying Machine (Mythical) | 6 | Heavy Tank HP 11 | Heavy Tank Hitpoints 11 |
| Elephant Archer Quiver (Mythical) | 3 | Invading Bomber Damage -11 | Invading Bomber Hitpoints -11 |
| Elephant Archer Quiver (Mythical) | 6 | Air Defense Damage 11 | Air Defense Attack Speed 11 |
| Gemini 8 Gloves (Mythical) | 1 | Defender Movement Speed 9 | Defenders Movement Speed 9 |
| Gemini 8 Helmet (Mythical) | 1 | Attack Helicopter Damage 11 | Factory Troop Damage 11 |
| Gemini 8 Helmet (Mythical) | 2 | Armored Car Damage 11 | Attack Helicopter Damage 11 |
| Gemini 8 Helmet (Mythical) | 3 | Bazooka Damage 11 | Armored Car Damage 11 |

… and 30 more in conflicts.json

## Hall assignments (formerly TBD)

| Artifact | Hall | Evidence |
|----------|------|----------|
| Analytical Engine | War | wiki Legendary_War_Artifacts |
| DomiNations Army Helmet | War | wiki Legendary_War_Artifacts |
| Mahiole | War | wiki Legendary_War_Artifacts |
| First Strike Star | Main | wiki Legendary_Artifacts |

Still prefer official BHG confirmation in notes when found.

## Roster / release

- Draft treated all 110 legendaries as Released; wiki-only extras added as Uncertain.
- Mythical wiki lists many more names than the verified draft rows — wiki-only mythicals **not** auto-added as released.
- **Exception:** June 2026 Marco's Wares official post confirmed Mythical **General Pershing's Bas-Relief**, **Joyeuse Sword**, **Silla Gold Crown** (missing from 29-row draft) → added as Released with BHG perk values.
- Nav-only / wiki-only legendaries with **no** DominationsWorld hit in 2026-09-05 sweep (remain Uncertain): 11th Anniversary Cake, Dilophosaurus Skull, Mask of Tutankhamun, Benin Royal Ivory Mask, Golden Lyre of Ur, Mona Lisa, Roman Dodecahedron, Tibetan Dung-Dkar.
- Official post confirmations for draft rows: British Kettle Drum (week-ahead-42026), Analytical Engine (31626), First Strike Star (5426), Mahiole (111725 + anniversary), DomiNations Army Helmet (11th anniversary).
- Ignore meta pages: Archaeology Capstone, Library, Technology.
- Sweep raw: `data/temp/official_sweep_posts.json`, `data/temp/official_sweep_marco.json`.

## Known data quirks

- Mythical draft values may be announcement/display (possibly max); max left blank.
- Legendary `perk_*_max` = |base|+9 (same sign); skipped for |base|==1 specials; noted in `notes`.
- Duplicate perk names on one artifact can be real.
- Hitpoints vs HP normalized via `perk_name_mapping.csv`.
- Mythical War quick_view for British Kettle Drum was wrong (legendary 5-perk set); statistic_table used.
