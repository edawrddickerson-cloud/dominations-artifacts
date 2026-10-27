# Profile 3: 22 War Mythicals — discrepancy review

Review only. Canonical entries, profile settings, inventory and hosted data were not changed.

Evidence: saved workspace revision 310, Profile 3 (`pmviqxudb786q`), active strategy `Main strategy`. The 22 War layout identities comprise 17 stored six-row scan records plus five database-only entries. All layout quantities are one; no duplicate identities or same-name Mythical entries were found. The unrelated Main craft and two Main ownership checkboxes are outside scope.

Canonical owners: `data/artifacts.json` and `data/artifacts.csv`; `ui/data/artifacts.json` is the served copy. CSV/JSON contents and UI JSON were checked for agreement. Six selected Mythicals are absent, although their Legendary editions exist. Those editions are distinct items, not substitutes or duplicates. Conversely, Elephant Archer Quiver and Ramesses II’s Abu Simbel are canonical War Mythicals outside this profile’s 22; their absence here is not a database defect.

**Cost authority:** the user confirms 1,000 tokens for every one of the 22. All 16 existing canonical rows already say `1000` / `Legendary Tokens`; no conflicting price or currency was found in that scope. The six absent Mythicals have no canonical cost or image entry. Any 100/300-token prices on their Legendary editions do not apply to these Mythicals.

**Provenance:** all 17 stored scans have `reviewed: true` and `manualCorrection: true`. All 102 rows are level 1; their levels have OCR/manual source labels (counts in JSON). All have empty `inferredFields`, null `valueSource`, and `rangeSource: inferred-level`. The save path retains current rows rather than replacing them with catalog perks (`ui/storage-scanner.js:41,191`; `ui/stored-artifacts.js:240,650`). Nevertheless, original OCR text/confidence and field-specific value/name corrections were not retained. These are reviewed scan-derived text, not 102 independently verified OCR readings. A null value source does not prove direct OCR. Linked titles/classification/IDs are normalized from the catalog; stored rows remain separate. The five entries without scans display database values and cannot validate that database independently.

**Levels and maxima:** compare level-1 current values against base values. Every scanned row records level 1, so upgrades do not explain the Maori discrepancy. Base/max endpoints were inferred by `impliedRange` (`ui/stored-artifacts.js:316`) using signed magnitude minus `(level - 1)` and a generic +9 maximum. The current row values are retained in JSON. These derived maxima are not game observations; do not promote them to verified Mythical maximums. Count/trigger perks must not be interpreted as percentages or upgraded with that generic rule.

**Images:** no image or artwork ID is retained in any of the 17 selected scan records. Existing canonical entries have image URLs, whose UI mappings agree with the raw mapping, but URL presence does not verify the image or current availability. A local screenshot of 10th Mountain Division War Kit was found and inspected; it confirms the title, War Mythical banner, six stars, six displayed values and each 1/10 level. It shows skis/rifle/poles artwork. Its Mythical database/image entry is missing. Other recent screenshots show Arm Reliquary’s Legendary edition and Admiral Yi’s Main editions; those do not verify these War Mythicals. No corresponding game screenshots were located for the other 21 in the repository, Downloads, Desktop or Pictures/Screenshots searched here. No remote image fetch was needed for this local comparison.

**Review queue:** this dated report and its JSON follow the existing `reports/discrepancies.md` review mechanism. The OCR alias feedback queue is for recognition rules, not canonical item corrections; nothing was submitted there.

| # | Item | Evidence | Finding | Cost | Image |
|---|---|---|---|---|---|
| 1 | Arm Reliquary of Charlemagne | Database only | Database only; no independent stat check; cached source name-or-value conflict | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 2 | 10th Mountain Division War Kit | Scan + pixels | Missing Mythical entry; Legendary edition exists | 1,000 tokens confirmed; entry missing | Screenshot checked; Mythical mapping absent |
| 3 | British Kettle Drum | Reviewed scan text | Six names and level-1 values match | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 4 | ASDIC Type 113X | Reviewed scan text | Missing Mythical entry; Legendary edition exists | 1,000 tokens confirmed; entry missing | Mapping absent; screenshot unavailable |
| 5 | Caligula's Ring | Reviewed scan text | Six names and level-1 values match | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 6 | Da Vinci's Flying Machine | Database only | Database only; no independent stat check | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 7 | Gemini 8 Gloves | Reviewed scan text | Six names and level-1 values match | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 8 | Gemini 8 Helmet | Database only | Database only; no independent stat check; cached source order-only conflict | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 9 | General Pershing's Bas-Relief | Reviewed scan text | Six names and level-1 values match | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 10 | Huey Armament System | Reviewed scan text | Six names and level-1 values match | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 11 | Joyeuse Sword | Reviewed scan text | Six names and level-1 values match | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 12 | Leonidas Bust | Reviewed scan text | Six names and level-1 values match; row 2 inferred max 10 unsupported | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 13 | Maori War Club | Reviewed scan text | Row 5 name and base differ; see detail | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 14 | Supermarine Spitfire Engine | Database only | Database only; no independent stat check | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 15 | T-34 Tank Engine | Database only | Database only; no independent stat check; cached source order-only conflict | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 16 | The Art of War | Reviewed scan text | Six names and level-1 values match | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 17 | The White Death's War Kit | Reviewed scan text | Six names and level-1 values match | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 18 | Vz-9 Avrocar | Reviewed scan text | Six names and level-1 values match | 1,000 tokens matches | URL mapped; screenshot unavailable |
| 19 | Demarcation Stone | Reviewed scan text | Missing Mythical entry; Legendary edition exists | 1,000 tokens confirmed; entry missing | Mapping absent; screenshot unavailable |
| 20 | Norden Bombsight | Reviewed scan text | Missing Mythical entry; Legendary edition exists; row 2 max 10 unsupported | 1,000 tokens confirmed; entry missing | Mapping absent; screenshot unavailable |
| 21 | Red Baron’s Engine | Reviewed scan text | Missing Mythical entry; Legendary edition exists; cached source name-or-value conflict | 1,000 tokens confirmed; entry missing | Mapping absent; screenshot unavailable |
| 22 | Tizona Sword | Reviewed scan text | Missing Mythical entry; Legendary edition exists | 1,000 tokens confirmed; entry missing | Mapping absent; screenshot unavailable |

## Item evidence

Percentages below are signed. `1 (effect)` is a non-percent effect/count. Slot order and repeated perks are preserved. “Match” means stored text agrees, not independently proven game accuracy. Cached wiki files are historical corroboration, not new pixel evidence; they can share sources with the canonical database. JSON contains full stored row metadata, source hashes, canonical provenance URLs and all flags.

### 1. Arm Reliquary of Charlemagne

Identity: `arm-reliquary-of-charlemagne-mythical`. Classification: War / Mythical (database classification only).

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Transport Cooldown | No scan; database supplied | Transport Cooldown / -12% / -21 | database-only |
| 2 | Paratrooper Damage | No scan; database supplied | Paratrooper Damage / 15% / 24 | database-only |
| 3 | Paratrooper Hitpoints | No scan; database supplied | Paratrooper Hitpoints / 15% / 24 | database-only |
| 4 | Generals' Damage | No scan; database supplied | Generals' Damage / 15% / 24 | database-only |
| 5 | Fighter Damage | No scan; database supplied | Fighter Damage / 14% / 23 | database-only |
| 6 | Invading Heavy Tank Damage | No scan; database supplied | Invading Heavy Tank Damage / -11% / -20 | database-only |

**Unverified:** these six perks originate solely from the existing database. No separate scanned values, scanned levels or Mythical source image was retained in Profile 3. Agreement with the screen’s database-backed display would be circular.

**Historical source review:** canonical row 1 Transport Cooldown is −12% (max −21), while the cached Mythical page says −11%. Profile 3 supplies no independent scan or level for this item. Flag the one-point base discrepancy; do not choose a correction or assume an upgrade without a Mythical game screenshot. The available Arm Reliquary screenshot is Legendary and cannot settle this.

Historical source: [Arm_Reliquary_of_Charlemagne(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Arm_Reliquary_of_Charlemagne(Mythical_War_Artifacts).txt). Extracted source rows: Transport Cooldown -11%; Paratrooper Damage +15%; Paratrooper Hitpoints +15%; Generals' Damage +15%; Fighter Damage +14%; Invading Heavy Tank Damage -11%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `database-only-no-independent-scan`, `cached-source-name-or-value-conflict`.

### 2. 10th Mountain Division War Kit

Identity: `scan-5fcbb03c-e384-481b-9d01-e66791e3d60b`. Classification: War / Mythical (stored six-row scan; banner independently checked).

Captured: `2026-10-26T23:07:47.715Z`; accepted: `2026-10-26T23:12:47.644Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

Pixel evidence: [original game screenshot](../data/raw/profile3-war-mythical-review/10th-mountain-division-war-kit.png). All six level-1 values below agree; artwork is skis/rifle/poles. This verifies current/base values, not future upgrade maxima or price.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Ranged Siege Damage | 13% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 2 | APC Damage | 13% / L1 (manual) | Missing entry | canonical-entry-missing |
| 3 | APC Hitpoints | 12% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 4 | Machine Gun Infantry Damage | 13% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 5 | Enemy Defender Spawn Time | 11% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 6 | Enemy Redoubt Damage | -11% / L1 (ocr) | Missing entry | canonical-entry-missing |

**Review: add candidate only.** No same-name Mythical was found anywhere in canonical data. Existing other editions: `10th-mountain-division-war-kit-legendary` (War Legendary; 100 Legendary Tokens). Their perks, prices and artwork are not substitutes for a Mythical entry. Proposed cost is 1,000 tokens from the user, independent of scanned text.

Historical source: [10th_Mountain_Division_War_Kit(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/10th_Mountain_Division_War_Kit(Mythical_War_Artifacts).txt). Extracted source rows: Ranged Siege Damage +13%; APC Damage +13%; APC Hitpoints +12%; Machine Gun Infantry Damage +13%; Enemy Defender Spawn Time +11%; Enemy Redoubt Damage -11%.

Cost: canonical Mythical cost absent; user confirms 1,000 tokens.

Flags: `missing-canonical-mythical`, `missing-mythical-cost-and-image-map`, `derived-maxima-unverified`, `six-current-values-and-levels-visually-confirmed`.

### 3. British Kettle Drum

Identity: `british-kettle-drum-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:15:48.684Z`; accepted: `2026-10-26T23:15:48.689Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Mortar Troop Attack Speed | 7% / L1 (manual) | Mortar Troop Attack Speed / 7% / 16 | match |
| 2 | Mortar Troop Damage | 11% / L1 (ocr) | Mortar Troop Damage / 11% / 20 | match |
| 3 | Barracks Troop Damage | 12% / L1 (ocr) | Barracks Troop Damage / 12% / 21 | match |
| 4 | Barracks Troop Hitpoints | 12% / L1 (ocr) | Barracks Troop Hitpoints / 12% / 21 | match |
| 5 | Ranged Siege Damage | 11% / L1 (manual) | Ranged Siege Damage / 11% / 20 | match |
| 6 | Enemy Defender Spawn Time | 11% / L1 (ocr) | Enemy Defender Spawn Time / 11% / 20 | match |

Historical source: [British_Kettle_Drum(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/British_Kettle_Drum(Mythical_War_Artifacts).txt). Extracted source rows: Mortar Troop Attack Speed +7%; Mortar Troop Damage +11%; Barracks Troop Damage +12%; Barracks Troop Hitpoints +12%; Ranged Siege Damage +11%; Enemy Defender Spawn Time +11%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 4. ASDIC Type 113X

Identity: `scan-690a3c52-399c-452a-bb71-26a7a9314f22`. Classification: War / Mythical (stored six-row scan; source banner unavailable).

Captured: `2026-10-26T23:14:22.977Z`; accepted: `2026-10-26T23:17:45.496Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Invading Generals' Hitpoints | -14% / L1 (manual) | Missing entry | canonical-entry-missing |
| 2 | Invading Barracks Troop Damage | -14% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 3 | Invading Factory Troop Damage | -14% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 4 | Invading Airstrip Troop Damage | -14% / L1 (manual) | Missing entry | canonical-entry-missing |
| 5 | Defender Spawn Time | -14% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 6 | Missile Silo Damage | 14% / L1 (ocr) | Missing entry | canonical-entry-missing |

**Review: add candidate only.** No same-name Mythical was found anywhere in canonical data. Existing other editions: `asdic-type-113x-legendary` (War Legendary; 300 Legendary Tokens). Their perks, prices and artwork are not substitutes for a Mythical entry. Proposed cost is 1,000 tokens from the user, independent of scanned text.

Historical source: [ASDIC_Type_113X(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/ASDIC_Type_113X(Mythical_War_Artifacts).txt). Extracted source rows: Invading Generals Hitpoints -14%; Invading  Barracks Troop Damage -14%; Invading  Factory Troop Damage -14%; Invading  Airstrip Troop Damage -14%; Defender Spawn Time -14%; Missile Silo Damage +14%.

Cost: canonical Mythical cost absent; user confirms 1,000 tokens.

Flags: `missing-canonical-mythical`, `missing-mythical-cost-and-image-map`, `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 5. Caligula's Ring

Identity: `caligula-s-ring-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:18:59.344Z`; accepted: `2026-10-26T23:18:59.348Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Ranged Siege Damage | 14% / L1 (ocr) | Ranged Siege Damage / 14% / 23 | match |
| 2 | Paratrooper Damage | 14% / L1 (ocr) | Paratrooper Damage / 14% / 23 | match |
| 3 | Paratrooper Hitpoints | 14% / L1 (ocr) | Paratrooper Hitpoints / 14% / 23 | match |
| 4 | Guerrilla Damage | 14% / L1 (ocr) | Guerrilla Damage / 14% / 23 | match |
| 5 | Ranged Siege Damage | 14% / L1 (manual) | Ranged Siege Damage / 14% / 23 | match |
| 6 | Wall Sapper Damage | 14% / L1 (ocr) | Wall Sapper Damage / 14% / 23 | match |

Repeated perks: Ranged Siege Damage ×2. Preserved as separate slots; not duplicate items. Cached Mythical source also provides slot evidence below.

Historical source: [Caligula's_Ring(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Caligula%27s_Ring(Mythical_War_Artifacts).txt). Extracted source rows: Ranged Siege Damage +14%; Paratrooper Damage +14%; Paratrooper Hitpoints +14%; Guerilla Damage +14%; Ranged Siege Damage +14%; Wall Sapper Damage +14%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 6. Da Vinci's Flying Machine

Identity: `da-vinci-s-flying-machine-mythical`. Classification: War / Mythical (database classification only).

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Fighter Hitpoints & Damage | No scan; database supplied | Fighter Hitpoints & Damage / 7% / 16 | database-only |
| 2 | Fighter Damage | No scan; database supplied | Fighter Damage / 11% / 20 | database-only |
| 3 | Fighter Hitpoints | No scan; database supplied | Fighter Hitpoints / 11% / 20 | database-only |
| 4 | Fighter Hitpoints | No scan; database supplied | Fighter Hitpoints / 11% / 20 | database-only |
| 5 | Heavy Tank Damage | No scan; database supplied | Heavy Tank Damage / 11% / 20 | database-only |
| 6 | Heavy Tank Hitpoints | No scan; database supplied | Heavy Tank Hitpoints / 11% / 20 | database-only |

**Unverified:** these six perks originate solely from the existing database. No separate scanned values, scanned levels or Mythical source image was retained in Profile 3. Agreement with the screen’s database-backed display would be circular.

Historical source: [Da_Vinci's_Flying_Machine(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Da_Vinci%27s_Flying_Machine(Mythical_War_Artifacts).txt). Extracted source rows: Fighter Hitpoints & Damage +7%; Fighters Damage +11%; Fighters Hitpoints +11%; Fighters Hitpoints +11%; Heavy Tank Damage +11%; Heavy Tank Hitpoints +11%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `database-only-no-independent-scan`.

### 7. Gemini 8 Gloves

Identity: `gemini-8-gloves-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:22:23.720Z`; accepted: `2026-10-26T23:22:23.727Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Defender Movement Speed | 9% / L1 (ocr) | Defender Movement Speed / 9% / 18 | match |
| 2 | Defender Hitpoints | 12% / L1 (ocr) | Defender Hitpoints / 12% / 21 | match |
| 3 | Enemy Defender Spawn Time | 12% / L1 (ocr) | Enemy Defender Spawn Time / 12% / 21 | match |
| 4 | All Defensive Towers Hitpoints | 12% / L1 (ocr) | All Defensive Towers Hitpoints / 12% / 21 | match |
| 5 | All Defensive Towers Damage | 12% / L1 (ocr) | All Defensive Towers Damage / 12% / 21 | match |
| 6 | Enemy Missile Silo Damage | -12% / L1 (ocr) | Enemy Missile Silo Damage / -12% / -21 | match |

Historical source: [Gemini_8_Gloves(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Gemini_8_Gloves(Mythical_War_Artifacts).txt). Extracted source rows: Defenders Movement Speed +9%; Defender Hitpoints +12%; Enemy Defender Spawn Time +12%; All Defensive Towers Hitpoints +12%; All Defensive Towers Damage +12%; Enemy Missile Silo Damage -12%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 8. Gemini 8 Helmet

Identity: `gemini-8-helmet-mythical`. Classification: War / Mythical (database classification only).

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Attack Helicopter Damage | No scan; database supplied | Attack Helicopter Damage / 11% / 20 | database-only |
| 2 | Armored Car Damage | No scan; database supplied | Armored Car Damage / 11% / 20 | database-only |
| 3 | Bazooka Damage | No scan; database supplied | Bazooka Damage / 11% / 20 | database-only |
| 4 | Heavy Tank Damage | No scan; database supplied | Heavy Tank Damage / 11% / 20 | database-only |
| 5 | Barracks Troop Damage | No scan; database supplied | Barracks Troop Damage / 11% / 20 | database-only |
| 6 | Factory Troop Damage | No scan; database supplied | Factory Troop Damage / 11% / 20 | database-only |

**Unverified:** these six perks originate solely from the existing database. No separate scanned values, scanned levels or Mythical source image was retained in Profile 3. Agreement with the screen’s database-backed display would be circular.

**Historical source review:** the cached Mythical page has the same six signed perk/value pairs in a different slot order. This is an ordering discrepancy only; it does not establish a missing perk or different total. No game screenshot establishes the correct order for this database-only entry.

Historical source: [Gemini_8_Helmet(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Gemini_8_Helmet(Mythical_War_Artifacts).txt). Extracted source rows: Factory Troop Damage +11%; Attack Helicopter Damage +11%; Armored Car Damage +11%; Bazooka Damage +11%; Heavy Tank Damage +11%; Barracks Troop Damage +11%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `database-only-no-independent-scan`, `cached-source-order-only-conflict`.

### 9. General Pershing's Bas-Relief

Identity: `general-pershing-s-bas-relief-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:22:52.353Z`; accepted: `2026-10-26T23:22:52.359Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Barracks Troop Damage | 9% / L1 (ocr) | Barracks Troop Damage / 9% / 18 | match |
| 2 | Heavy Infantry Hitpoints | 9% / L1 (ocr) | Heavy Infantry Hitpoints / 9% / 18 | match |
| 3 | Ranged Infantry Hitpoints | 9% / L1 (ocr) | Ranged Infantry Hitpoints / 9% / 18 | match |
| 4 | Heavy Cavalry Hitpoints | 9% / L1 (ocr) | Heavy Cavalry Hitpoints / 9% / 18 | match |
| 5 | Ranged Siege Damage | 9% / L1 (manual) | Ranged Siege Damage / 9% / 18 | match |
| 6 | Raider Damage | 9% / L1 (ocr) | Raider Damage / 9% / 18 | match |

Historical source: [General_Pershing's_Bas-Relief(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/General_Pershing%27s_Bas-Relief(Mythical_War_Artifacts).txt). Extracted source rows: Barracks Troop Damage +9%; Heavy Infantry Hitpoints +9%; Ranged Infantry Hitpoints +9%; Heavy Cavalry Hitpoints +9%; Ranged Siege Damage +9%; Raider Damage +9%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 10. Huey Armament System

Identity: `huey-armament-system-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:23:12.627Z`; accepted: `2026-10-26T23:23:12.861Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Barracks Troop Damage | 9% / L1 (ocr) | Barracks Troop Damage / 9% / 18 | match |
| 2 | Attack Helicopter Damage | 12% / L1 (ocr) | Attack Helicopter Damage / 12% / 21 | match |
| 3 | Attack Helicopter Damage | 12% / L1 (ocr) | Attack Helicopter Damage / 12% / 21 | match |
| 4 | Attack Helicopter Hitpoints | 12% / L1 (ocr) | Attack Helicopter Hitpoints / 12% / 21 | match |
| 5 | Bazooka Damage | 12% / L1 (ocr) | Bazooka Damage / 12% / 21 | match |
| 6 | All Enemy Defensive Towers Damage | -11% / L1 (ocr) | All Enemy Defensive Towers Damage / -11% / -20 | match |

Repeated perks: Attack Helicopter Damage ×2. Preserved as separate slots; not duplicate items. Cached Mythical source also provides slot evidence below.

Historical source: [Huey_Armament_System(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Huey_Armament_System(Mythical_War_Artifacts).txt). Extracted source rows: Barracks Troop Damage +9%; Attack Helicopter Damage +12%; Attack Helicopter Damage +12%; Attack Helicopter Hitpoints +12%; Bazooka Damage +12%; All Enemy Defensive Towers Damage -11%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 11. Joyeuse Sword

Identity: `joyeuse-sword-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:23:21.407Z`; accepted: `2026-10-26T23:23:21.613Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Heavy Tank Damage | 11% / L1 (ocr) | Heavy Tank Damage / 11% / 20 | match |
| 2 | Factory Troop Damage | 11% / L1 (ocr) | Factory Troop Damage / 11% / 20 | match |
| 3 | Heavy Tank Damage | 11% / L1 (ocr) | Heavy Tank Damage / 11% / 20 | match |
| 4 | Bomber Damage | 11% / L1 (ocr) | Bomber Damage / 11% / 20 | match |
| 5 | Generals' Damage | 11% / L1 (ocr) | Generals' Damage / 11% / 20 | match |
| 6 | Defender Damage | 11% / L1 (ocr) | Defender Damage / 11% / 20 | match |

Repeated perks: Heavy Tank Damage ×2. Preserved as separate slots; not duplicate items. Cached Mythical source also provides slot evidence below.

Historical source: [Joyeuse_Sword(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Joyeuse_Sword(Mythical_War_Artifacts).txt). Extracted source rows: Heavy Tank Damage +11%; Factory Troop Damage +11%; Heavy Tank Damage +11%; Bomber Damage +11%; Generals' Damage +11%; Defender Damage +11%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 12. Leonidas Bust

Identity: `leonidas-bust-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:23:44.405Z`; accepted: `2026-10-26T23:23:44.410Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Bazooka Damage | 13% / L1 (ocr) | Bazooka Damage / 13% / 22 | match |
| 2 | Mercenary Camp Deploys Spartans when Destroyed | 1 (effect) / L1 (manual) | Mercenary Camp Deploys Spartans when Destroyed / 1 (effect) / unknown | match |
| 3 | Quick Victory Time | 11% / L1 (ocr) | Quick Victory Time / 11% / 20 | match |
| 4 | Generals' Hitpoints & Damage | 11% / L1 (ocr) | Generals' Hitpoints & Damage / 11% / 20 | match |
| 5 | Bazooka Damage | 11% / L1 (ocr) | Bazooka Damage / 11% / 20 | match |
| 6 | Bazooka Hitpoints | 11% / L1 (ocr) | Bazooka Hitpoints / 11% / 20 | match |

Repeated perks: Bazooka Damage ×2. Preserved as separate slots; not duplicate items. Cached Mythical source also provides slot evidence below.

**Review: row 2 range.** Stored current value is 1 for Mercenary Camp Deploys Spartans when Destroyed; generic inference produced base 1 / max 10. Canonical max is blank. The cached source uses +1 without a percent sign. Retain the effect as a count/trigger; max 10 is unsupported and is a profile-derived range issue, not evidence that canonical needs max 10.

Historical source: [Leonidas_Bust(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Leonidas_Bust(Mythical_War_Artifacts).txt). Extracted source rows: Bazooka Damage +13%; Mercenary Camp Deploys Spartans when Destroyed +1; Quick Victory Time +11%; Generals Hitpoints and Damage +11%; Bazooka Damage +11%; Bazooka Hitpoints +11%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `perk-2-derived-max-differs`, `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`, `non-percent-effect-generic-range-inference`.

### 13. Maori War Club

Identity: `maori-war-club-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:24:12.996Z`; accepted: `2026-10-26T23:24:13.222Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Generals' Hitpoints & Damage | 12% / L1 (ocr) | Generals' Hitpoints & Damage / 12% / 21 | match |
| 2 | All Defensive Towers Hitpoints & Damage | 8% / L1 (ocr) | All Defensive Towers Hitpoints & Damage / 8% / 17 | match |
| 3 | Defender Spawn Time | -11% / L1 (ocr) | Defender Spawn Time / -11% / -20 | match |
| 4 | Defender Movement Speed | 8% / L1 (ocr) | Defender Movement Speed / 8% / 17 | match |
| 5 | Invading Recon Scan Duration | -10% / L1 (ocr) | Enemy Recon Plane Scan Duration / -12% / -21 | name-or-base-conflict |
| 6 | Generals' Attack Speed | 8% / L1 (ocr) | Generals' Attack Speed / 8% / 17 | match |

**Review: row 5.** Profile has **Invading Recon Scan Duration −10%**, L1, inferred max −19. Canonical has **Enemy Recon Plane Scan Duration −12%**, max −21. Both names exist separately in the perk mapping; this is not an accepted alias. The cached Mythical page explicitly lists Invading Recon Scan Duration −10%, corroborating the profile text. Confirm current game pixels before editing canonical data; the −10 versus −12 difference is not explained by the recorded L1 upgrade state.

Historical source: [Maori_War_Club(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Maori_War_Club(Mythical_War_Artifacts).txt). Extracted source rows: Generals' Hitpoints and Damage +12%; All Defensive Towers Hitpoints and Damage +8%; Defender Spawn Time -11%; Defender Movement Speed +8%; Invading Recon Scan Duration -10%; Generals' Attack Speed +8%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `perk-5-name-or-base-conflict`, `perk-5-derived-max-differs`, `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 14. Supermarine Spitfire Engine

Identity: `supermarine-spitfire-engine-mythical`. Classification: War / Mythical (database classification only).

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Airstrip Troop Damage | No scan; database supplied | Airstrip Troop Damage / 8% / 17 | database-only |
| 2 | Bomber Damage | No scan; database supplied | Bomber Damage / 14% / 23 | database-only |
| 3 | Bomber Hitpoints | No scan; database supplied | Bomber Hitpoints / 14% / 23 | database-only |
| 4 | Bomber Hitpoints | No scan; database supplied | Bomber Hitpoints / 14% / 23 | database-only |
| 5 | Heavy Tank Damage | No scan; database supplied | Heavy Tank Damage / 14% / 23 | database-only |
| 6 | Fighter Damage | No scan; database supplied | Fighter Damage / 14% / 23 | database-only |

**Unverified:** these six perks originate solely from the existing database. No separate scanned values, scanned levels or Mythical source image was retained in Profile 3. Agreement with the screen’s database-backed display would be circular.

Historical source: [Supermarine_Spitfire_Engine(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Supermarine_Spitfire_Engine(Mythical_War_Artifacts).txt). Extracted source rows: Airstrip Troop Damage +8%; Bomber Damage +14%; Bomber Hitpoints +14%; Bomber Hitpoints +14%; Heavy Tank Damage +14%; Fighter Damage +14%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `database-only-no-independent-scan`.

### 15. T-34 Tank Engine

Identity: `t-34-tank-engine-mythical`. Classification: War / Mythical (database classification only).

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Heavy Tank Damage | No scan; database supplied | Heavy Tank Damage / 11% / 20 | database-only |
| 2 | Heavy Tank Hitpoints | No scan; database supplied | Heavy Tank Hitpoints / 11% / 20 | database-only |
| 3 | Invading Heavy Tank Damage | No scan; database supplied | Invading Heavy Tank Damage / -11% / -20 | database-only |
| 4 | Invading Heavy Tank Hitpoints | No scan; database supplied | Invading Heavy Tank Hitpoints / -11% / -20 | database-only |
| 5 | Invading Heavy Cavalry Damage | No scan; database supplied | Invading Heavy Cavalry Damage / -11% / -20 | database-only |
| 6 | Invading Barracks Troop Damage | No scan; database supplied | Invading Barracks Troop Damage / -11% / -20 | database-only |

**Unverified:** these six perks originate solely from the existing database. No separate scanned values, scanned levels or Mythical source image was retained in Profile 3. Agreement with the screen’s database-backed display would be circular.

**Historical source review:** the cached Mythical page has the same six signed perk/value pairs in a different slot order. This is an ordering discrepancy only; it does not establish a missing perk or different total. No game screenshot establishes the correct order for this database-only entry.

Historical source: [T-34_Tank_Engine(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/T-34_Tank_Engine(Mythical_War_Artifacts).txt). Extracted source rows: Invading Barracks Troop Damage -11%; Heavy Tank Damage +11%; Heavy Tank Hitpoints +11%; Invading Heavy Tank Damage -11%; Invading Heavy Tank Hitpoints -11%; Invading Heavy Cavalry Damage -11%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `database-only-no-independent-scan`, `cached-source-order-only-conflict`.

### 16. The Art of War

Identity: `the-art-of-war-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:26:45.936Z`; accepted: `2026-10-26T23:26:45.941Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Anti-Tank Gun Damage | 20% / L1 (ocr) | Anti-Tank Gun Damage / 20% / 29 | match |
| 2 | Heavy Tank Hitpoints | 14% / L1 (ocr) | Heavy Tank Hitpoints / 14% / 23 | match |
| 3 | Heavy Tank Damage | 14% / L1 (ocr) | Heavy Tank Damage / 14% / 23 | match |
| 4 | Invading Generals' Hitpoints | -14% / L1 (ocr) | Invading Generals' Hitpoints / -14% / -23 | match |
| 5 | Invading Generals' Damage | -14% / L1 (ocr) | Invading Generals' Damage / -14% / -23 | match |
| 6 | Generals' Hitpoints & Damage | 14% / L1 (ocr) | Generals' Hitpoints & Damage / 14% / 23 | match |

Historical source: [The_Art_of_War(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/The_Art_of_War(Mythical_War_Artifacts).txt). Extracted source rows: Anti-Tank Gun Damage +20%; Heavy Tank Hitpoints +14%; Heavy Tank Damage +14%; Invading Generals' Hitpoints -14%; Invading Generals' Damage -14%; Generals' Hitpoints and Damage +14%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 17. The White Death's War Kit

Identity: `the-white-death-s-war-kit-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:26:54.361Z`; accepted: `2026-10-26T23:26:54.589Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Sniper Tower Damage | 11% / L1 (ocr) | Sniper Tower Damage / 11% / 20 | match |
| 2 | Sniper Tower Damage | 11% / L1 (ocr) | Sniper Tower Damage / 11% / 20 | match |
| 3 | Sniper Tower Hitpoints | 11% / L1 (ocr) | Sniper Tower Hitpoints / 11% / 20 | match |
| 4 | Enemy Defender Spawn Time | 11% / L1 (ocr) | Enemy Defender Spawn Time / 11% / 20 | match |
| 5 | All Defensive Towers Hitpoints | 9% / L1 (ocr) | All Defensive Towers Hitpoints / 9% / 18 | match |
| 6 | All Defensive Towers Damage | 9% / L1 (ocr) | All Defensive Towers Damage / 9% / 18 | match |

Repeated perks: Sniper Tower Damage ×2. Preserved as separate slots; not duplicate items. Cached Mythical source also provides slot evidence below.

Historical source: [The_White_Death's_War_Kit(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/The_White_Death%27s_War_Kit(Mythical_War_Artifacts).txt). Extracted source rows: Sniper Tower Damage +11%; Sniper Tower Damage +11%; Sniper Tower Hitpoints +11%; Enemy Defender Spawn Time +11%; All Defensive Towers Hitpoints +9%; All Defensive Towers Damage +9%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 18. Vz-9 Avrocar

Identity: `vz-9-avrocar-mythical`. Classification: War / Mythical (stored six-row scan; linked classification normalized from catalog).

Captured: `2026-10-26T23:28:09.150Z`; accepted: `2026-10-26T23:28:09.153Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Air Defense Attack Speed | 14% / L1 (ocr) | Air Defense Attack Speed / 14% / 23 | match |
| 2 | Invading Fighter Damage | -14% / L1 (manual) | Invading Fighter Damage / -14% / -23 | match |
| 3 | Air Defense Damage | 14% / L1 (ocr) | Air Defense Damage / 14% / 23 | match |
| 4 | Invading Bomber Damage | -14% / L1 (ocr) | Invading Bomber Damage / -14% / -23 | match |
| 5 | Invading Fighter Hitpoints | -14% / L1 (manual) | Invading Fighter Hitpoints / -14% / -23 | match |
| 6 | Invading Bomber Hitpoints | -14% / L1 (ocr) | Invading Bomber Hitpoints / -14% / -23 | match |

Historical source: [Vz-9_Avrocar(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Vz-9_Avrocar(Mythical_War_Artifacts).txt). Extracted source rows: Air Defense Attack Speed +14%; Invading Fighter Damage -14%; Air Defense Damage +14%; Invading Bomber Damage -14%; Invading Fighter Hitpoints -14%; Invading Bomber Hitpoints -14%.

Cost: canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.

Flags: `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 19. Demarcation Stone

Identity: `scan-e57179b7-8dbb-4e3f-9149-9ebbb9bc1c9e`. Classification: War / Mythical (stored six-row scan; source banner unavailable).

Captured: `2026-10-26T23:22:14.511Z`; accepted: `2026-10-26T23:22:59.025Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Missile Silo and Big Red Button Damage | 11% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 2 | Heavy Infantry Damage | 9% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 3 | Ranged Infantry Damage | 9% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 4 | Supply Vehicle Healing | 9% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 5 | Invading Machine Gun Infantry Damage | -9% / L1 (manual) | Missing entry | canonical-entry-missing |
| 6 | All Enemy Defensive Towers Damage | -9% / L1 (ocr) | Missing entry | canonical-entry-missing |

**Review: add candidate only.** No same-name Mythical was found anywhere in canonical data. Existing other editions: `demarcation-stone-legendary` (War Legendary; 100 Legendary Tokens). Their perks, prices and artwork are not substitutes for a Mythical entry. Proposed cost is 1,000 tokens from the user, independent of scanned text.

Historical source: [Demarcation_Stone(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Demarcation_Stone(Mythical_War_Artifacts).txt). Extracted source rows: Missile Silo and Big Red Button Damage +11%; Heavy Infantry Damage +9%; Ranged Infantry Damage +9%; Supply Vehicles Healing +9%; Invading Machine Gun Infantry Damage -9%; All Enemy Defensive Towers Damage -9%.

Cost: canonical Mythical cost absent; user confirms 1,000 tokens.

Flags: `missing-canonical-mythical`, `missing-mythical-cost-and-image-map`, `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

### 20. Norden Bombsight

Identity: `scan-17ebb017-f201-4c8a-b366-4feeac7e2338`. Classification: War / Mythical (stored six-row scan; source banner unavailable).

Captured: `2026-10-26T23:25:55.940Z`; accepted: `2026-10-26T23:26:02.109Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Invading Fighter Damage | -13% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 2 | APC Deploys Marines On Death | 1 (effect) / L1 (manual) | Missing entry | canonical-entry-missing |
| 3 | Coalition Troop Damage | 13% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 4 | Defender Spawn Time | -13% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 5 | Invading Fighter Damage | -13% / L1 (manual) | Missing entry | canonical-entry-missing |
| 6 | Machine Gun Infantry Damage | 13% / L1 (ocr) | Missing entry | canonical-entry-missing |

Repeated perks: Invading Fighter Damage ×2. Preserved as separate slots; not duplicate items. Cached Mythical source also provides slot evidence below.

**Review: row 2 range.** APC Deploys Marines On Death has stored current value 1 but inferred max 10. Cached Mythical source says +1 without %. Do not turn this into +1%/+10% or assert an upgraded effect count. Rows 1 and 5 both list Invading Fighter Damage −13% in the profile and cached source; do not deduplicate them.

**Review: add candidate only.** No same-name Mythical was found anywhere in canonical data. Existing other editions: `norden-bombsight-legendary` (War Legendary; 300 Legendary Tokens). Their perks, prices and artwork are not substitutes for a Mythical entry. Proposed cost is 1,000 tokens from the user, independent of scanned text.

Historical source: [Norden_Bombsight(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Norden_Bombsight(Mythical_War_Artifacts).txt). Extracted source rows: Invading Fighter Damage -13%; APC Deploys Marines On Death +1; Coalition Troop Damage +13%; Defenders Spawn Time -13%; Invading Fighter Damage -13%; Machine Gun Infantry Damage +13%.

Cost: canonical Mythical cost absent; user confirms 1,000 tokens.

Flags: `missing-canonical-mythical`, `missing-mythical-cost-and-image-map`, `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`, `non-percent-effect-generic-range-inference`.

### 21. Red Baron’s Engine

Identity: `scan-8b20ffd9-0e90-41a7-8222-76b895f921c5`. Classification: War / Mythical (stored six-row scan; source banner unavailable).

Captured: `2026-10-26T23:26:16.692Z`; accepted: `2026-10-26T23:26:19.366Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Enemy Air Defense Damage | -11% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 2 | Fighter Damage | 11% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 3 | Bomber Damage | 11% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 4 | Heavy Tank Damage | 11% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 5 | Machine Gun Infantry Damage | 11% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 6 | Invading Fighter Hitpoints | -11% / L1 (ocr) | Missing entry | canonical-entry-missing |

**Review: add candidate only.** No same-name Mythical was found anywhere in canonical data. Existing other editions: `red-baron-s-engine-legendary` (War Legendary; 300 Legendary Tokens). Their perks, prices and artwork are not substitutes for a Mythical entry. Proposed cost is 1,000 tokens from the user, independent of scanned text.

**Historical source review:** cached Mythical row 1 says Enemy Air Defense Damage **+11%**, while the saved profile says **−11%**. Cached row 6 says **Invading Fighters Damage −11%**, while the profile says **Invading Fighter Hitpoints −11%**. The first may be a source sign error; the second changes the stat kind. No retained game screenshot settles either. Keep both flags attached to this missing-entry candidate.

Historical source: [Red_Baron's_Engine(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Red_Baron%27s_Engine(Mythical_War_Artifacts).txt). Extracted source rows: Enemy Air Defense Damage +11%; Fighter Damage +11%; Bomber Damage +11%; Heavy Tank Damage +11%; Machine Gun Infantry Damage +11%; Invading Fighters Damage -11%.

Cost: canonical Mythical cost absent; user confirms 1,000 tokens.

Flags: `missing-canonical-mythical`, `missing-mythical-cost-and-image-map`, `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`, `cached-source-name-or-value-conflict`.

### 22. Tizona Sword

Identity: `scan-f6b145f2-3a03-4f16-85de-49544356bb04`. Classification: War / Mythical (stored six-row scan; source banner unavailable).

Captured: `2026-10-26T23:27:16.369Z`; accepted: `2026-10-26T23:27:48.608Z`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.

| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |
|---|---|---|---|---|
| 1 | Ranged Siege Damage | 11% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 2 | Enemy Defender Spawn Time | 11% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 3 | Heavy Cavalry Damage | 11% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 4 | Heavy Cavalry Hitpoints | 6% / L1 (ocr) | Missing entry | canonical-entry-missing |
| 5 | Ranged Siege Damage | 11% / L1 (manual) | Missing entry | canonical-entry-missing |
| 6 | Ranged Siege Hitpoints | 6% / L1 (ocr) | Missing entry | canonical-entry-missing |

Repeated perks: Ranged Siege Damage ×2. Preserved as separate slots; not duplicate items. Cached Mythical source also provides slot evidence below.

**Review: add candidate only.** No same-name Mythical was found anywhere in canonical data. Existing other editions: `tizona-sword-legendary` (War Legendary; 100 Legendary Tokens). Their perks, prices and artwork are not substitutes for a Mythical entry. Proposed cost is 1,000 tokens from the user, independent of scanned text.

Historical source: [Tizona_Sword(Mythical_War_Artifacts).txt](../data/raw/wiki_pages/Tizona_Sword(Mythical_War_Artifacts).txt). Extracted source rows: Ranged Siege Damage +11%; Enemy Defender Spawn Time +11%; Heavy Cavalry Damage +11%; Heavy Cavalry Hitpoints +6%; Ranged Siege Damage +11%; Ranged Siege Hitpoints +6%.

Cost: canonical Mythical cost absent; user confirms 1,000 tokens.

Flags: `missing-canonical-mythical`, `missing-mythical-cost-and-image-map`, `reviewed-scan-text-not-independent-pixel-verification`, `derived-maxima-unverified`.

## Validation and limits

Checked exactly 22 distinct War layout identities, 17 six-row stored scans (102 rows), five database-only entries, canonical CSV/JSON/UI parity, image-map parity, duplicate normalized names, level metadata, all costs/currencies and six-perk slot comparisons. One game screenshot was read independently. No canonical build, recognition rerun, planner save, database write, deployment or UI change was performed. Original raw OCR and additional game screenshots remain unavailable, so scan-derived text matches are not a blanket correctness claim. Evidence JSON and the copied original screenshot include SHA-256 references for reproducibility.
