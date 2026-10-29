# Profile 4: 100-token War Legendaries

User-collected, reviewed saved scans; all 35 rows record level 1. Original stat-panel pixels and raw OCR are not retained here. No field-by-field independent pixel verification is claimed. Percentage maxima are derived by the existing Legendary +9 rule. Count-effect maxima remain unknown.

Compared 7 distinct artifacts / 35 stat rows. 3 items / 5 rows differ from the current database. All selected entries already exist and already cost 100 Legendary Tokens. No new item was needed.

Saved workspace revision 338. Four differences affect the observed base value; the fifth concerns an inferred upgrade maximum only. **Resolved:** the user explicitly confirmed all four base differences are OCR errors and the database values are correct. The database values are retained; all 35 base values are now resolved. Original incorrect scan observations remain in the evidence JSON.

Canonical CSV, canonical JSON and served JSON were checked for equality before reconciliation. Review only; canonical data unchanged.

## Missing from Profile 4

- Great Imperial Crown
- The White Death's War Kit

This list is the difference against currently cataloged 100-token War Legendaries, not an exhaustive claim about uncataloged releases or artifacts with unknown token costs.

## Stat differences

| Artifact | Slot | Stat | Database | Saved scan |
|---|---:|---|---:|---:|
| 10th Mountain Division War Kit | 2 | APC Hitpoints | +7% | +1% |
| 10th Mountain Division War Kit | 3 | Machine Gun Infantry Damage | +8% | +5% |
| Gemini 8 Helmet | 2 | Armored Car Damage | +7% | +1% |
| Vespa 150 TAP | 2 | Machine Gun Infantry Hitpoints | +7% | +1% |

The corresponding cached Legendary pages agree with the database on all four values: [10th Mountain Division](../data/raw/wiki_pages/10th_Mountain_Division_War_Kit.txt), [Gemini 8 Helmet](../data/raw/wiki_pages/Gemini_8_Helmet.txt), [Vespa 150 TAP](../data/raw/wiki_pages/Vespa_150_TAP.txt). The JSON report records their SHA-256 checksums. The user has now confirmed the three 7-to-1 reads and the 8-to-5 read are OCR errors. Retained values are APC Hitpoints +7%, Machine Gun Infantry Damage +8%, Armored Car Damage +7% and Machine Gun Infantry Hitpoints +7%, respectively. This is user confirmation, not a claim that the agent inspected additional game pixels. No further confirmation of these four values is required.

Vespa row 5 is a separate range issue: Factory Troop Damage is +1% in both sources; the database leaves its maximum blank while the scanner derives +10%. The upgraded maximum was not observed. No +10% maximum has been asserted as an independently verified game value.

Demarcation Stone, General Pershing's Bas-Relief, Normandy SCR-536 and Tizona Sword match all five names and values. The shortened scan title Normandy SCR-536 resolves to the existing Normandy SCR-536 "Walkie-Talkie"; it is not a new artifact. All 35 stat names match after that identity resolution. Of the 35 base values, 31 match the original saved scans directly and four are resolved by the user's confirmation of the existing database values.

## Interpretation

This is observed saved scan text, not an upgrade inferred from the database. All saved levels are 1. Existing repeated perk slots are preserved. Count-effect maxima remain blank instead of using generic percentage inference.

Excluded 39 War Legendary scans from other cost tiers. The source contains 0 selected item images. The user deferred image import until a later browser-backup export. No cloud workspace write or deployment is part of this reconciliation.

## Validation

Seven distinct canonical identities, five reviewed level-1 rows each, correct War/Legendary editions and 100-token currency classification, signed base/max comparisons, and missing-set membership were checked. Canonical CSV/JSON and served JSON agree. Canonical JSON is byte-identical to the pre-review snapshot; all 300-token data is preserved. Verified-artifact, artifact-context and scan-image-import tests passed. Images remain deferred until the later local backup export.
