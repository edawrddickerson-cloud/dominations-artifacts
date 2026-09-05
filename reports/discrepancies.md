# Discrepancies

**Generated:** 2026-09-05

## Draft vs wiki perk conflicts

Count: **130** (logged in `data/temp/conflicts.json`).  
Resolution rule: **prefer draft/official** over wiki when both present.

| Artifact | Slot | Draft | Wiki |
|---|---|---|---|
| Heads of Hevajra (Legendary) | 4 | Armored Car Damage 11 | Armored Car DMG 11 |
| Heads of Hevajra (Legendary) | 5 | All Enemy Defensive Towers Damage 11 | All Enemy Defensive Towers DMG 11 |
| Keyed English Guitar (Legendary) | 1 | Enemy Tower Damage -11 | Enemy Tower DMG -11 |
| Keyed English Guitar (Legendary) | 3 | Enemy Sniper Tower Damage -16 | Enemy Sniper Tower DMG -16 |
| Keyed English Guitar (Legendary) | 5 | Heavy Tank Damage 11 | Heavy Tank DMG 11 |
| Quimbaya Treasure (Legendary) | 2 | Guerrilla HP 9 | Guerrilla Hitpoints 9 |
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
| ASDIC Type 113X (Legendary) | 1 | Invading Barracks Troop Damage -9 | Invading  Barracks Troop Damage -10 |
| ASDIC Type 113X (Legendary) | 2 | Invading Factory Troop Damage -9 | Invading  Factory Troop Damage -10 |
| ASDIC Type 113X (Legendary) | 3 | Invading Airstrip Troop Damage -9 | Invading  Airstrip Troop Damage -10 |
| ASDIC Type 113X (Legendary) | 4 | Defender Spawn Time -9 | Defender Spawn Time -10 |
| ASDIC Type 113X (Legendary) | 5 | Missile Silo Damage 9 | Missile Silo Damage 10 |
| ASM-135 Anti-Satellite Missile (Legendary) | 1 | Missile Silo and Red Button Damage 7 | Missile Silo and Red Button Damage 8 |
| ASM-135 Anti-Satellite Missile (Legendary) | 2 | Missile Silo Damage 7 | Missile Silo Damage 8 |
| ASM-135 Anti-Satellite Missile (Legendary) | 3 | Airstrip Troop Damage 3 | Airstrip Troop Damage 4 |
| ASM-135 Anti-Satellite Missile (Legendary) | 4 | Air Defense Damage 7 | Air Defense Damage 8 |
| ASM-135 Anti-Satellite Missile (Legendary) | 5 | Defender Hitpoints 7 | Defender Hitpoints 8 |
| Alfred Jewel (Legendary) | 3 | APC HP 6 | APC Hitpoints 6 |
| Caligula's Ring (Legendary) | 1 | Paratrooper Damage 6 | Paratrooper Damage 7 |
| Caligula's Ring (Legendary) | 2 | Paratrooper Hitpoints 6 | Paratrooper Hitpoints 7 |
| Caligula's Ring (Legendary) | 3 | Guerilla Damage 6 | Guerilla Damage 7 |
| Caligula's Ring (Legendary) | 4 | Ranged Siege Damage 3 | Ranged Siege Damage 4 |
| Caligula's Ring (Legendary) | 5 | Wall Sapper Damage 6 | Wall Sapper Damage 7 |
| Capt. McConnell's Hero Ensemble (Legendary) | 1 | Generals' Hitpoints and Damage 7 | Generals' Hitpoints and Damage 8 |
| Capt. McConnell's Hero Ensemble (Legendary) | 2 | Oil Looted 8 | Oil Looted 9 |
| Capt. McConnell's Hero Ensemble (Legendary) | 3 | Fighter Damage 8 | Fighter Damage 9 |
| Capt. McConnell's Hero Ensemble (Legendary) | 4 | Fighter Damage 9 | Fighter Damage 10 |
| Capt. McConnell's Hero Ensemble (Legendary) | 5 | Airstrip Troop Hitpoints 9 | Airstrip Troop Hitpoints 10 |

… and 90 more in conflicts.json

## Hall assignments (formerly TBD)

| Artifact | Hall | Evidence |
|----------|------|----------|
| Analytical Engine | War | wiki Legendary_War_Artifacts |
| DomiNations Army Helmet | War | wiki Legendary_War_Artifacts |
| Mahiole | War | wiki Legendary_War_Artifacts |
| First Strike Star | Main | wiki Legendary_Artifacts |

Still prefer official BHG confirmation in notes when found.

## Roster / release

- Draft treated all 110 legendaries as Released; wiki-only extras merged in.
- **Released (DW confirmed this pass):** 11th Anniversary Cake, Dilophosaurus Skull.
- **Uncertain kept:** Mask of Tutankhamun (wiki only; DW text is event flavor); Benin Royal Ivory Mask, Golden Lyre of Ur, Mona Lisa, Roman Dodecahedron, Tibetan Dung-Dkar (nav redlinks only — not removed).
- Leftwich Trophy: roster Released but wiki statistic table empty; deep DW/Fandom search found no perks — still missing.
- Mythical wiki lists many more names than the 29 verified draft rows — extras **not** auto-added as released.
- Ignore meta pages: Archaeology Capstone, Library, Technology.

## Known data quirks

- Mythical draft values may be announcement/display (possibly max); max left blank.
- Legendary `perk_*_max` = |base|+9 (same sign); skipped for |base|==1 specials; noted in `notes`.
- Duplicate perk names on one artifact can be real.
- Hitpoints vs HP normalized via `perk_name_mapping.csv`.
- Mythical War quick_view for British Kettle Drum was wrong (legendary 5-perk set); statistic_table used.
- Marco's Wares **1000 Legendary Tokens** prices are Mythical — never copied onto Legendary `cost`.
