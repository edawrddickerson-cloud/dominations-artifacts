# Third batch artifact stat review — 2026-10-11

Authority: User-supplied latest OCR export, current local canonical catalogue, and the continuing Multiplayer collection task.
Ownership: Stat coverage review and evidence interpretation.
Invariants: Clean OCR spelling is not independent visual verification. Keep Enemy/Invading identities distinct. The export does not independently identify the hall; Multiplayer/Main context comes from the ongoing session. War availability remains unknown.
Constraints: Text-only export; no screenshots or independent artifact counts. Fuzzy suggestions remain assumptions and do not establish new stats.
History: Third export, after the first two lists were connected locally and spelling suggestions appeared in the current scanner.

Source: `C:/Users/edwar/Downloads/artifact-perk-observations-2026-10-11 (2).json`, exported at 2026-10-11T18:32:25.263Z.

## Results

The export contains **53 distinct reads**, **120 unique labels**, **104 labels marked known**, **16 labels marked unknown**, and **5 validated reads**. Batch two contained 37 reads, 101 labels, 53 known, 48 unknown, and one validated read. These are different samples, not a controlled accuracy benchmark; reads can repeat artifacts.

The previous additions are being recognised in this export: 16 first-batch names and seven second-batch names appear with known labels. These are counts of names present and recognised, not coverage percentages for the whole game. There is no repeated exact-name catalogue lag like the previous export's 14 already-configured names marked unknown. The two already-configured names marked unknown here are explicitly flagged as assumed spelling suggestions.

Of the 16 unknown labels, five are complete new candidate identities, two are already-configured fuzzy-suggestion identities, two are misspelled variants of the pending Invading Guerrilla Hitpoints proposal, and seven are other spelling variants or malformed rows. Repeated variants are not additional stats.

## Five clean candidates

Recommend the following for catalogue inclusion review as **Multiplayer/Main** candidates. All five are absent from both the current canonical mapping and factory-rating keys; War availability remains unknown.

| Candidate | Reads | Observed values |
|---|---:|---|
| Invading Raider Hitpoints | 3 | -1% |
| Invading Attack Helicopter Damage | 2 | -6%, -1% |
| Invading Mortar Troop Hitpoints | 1 | -1% |
| Invading Ranged Siege Damage | 1 | -1% |
| Invading Paratrooper Hitpoints | 1 | -6% |

**Invading Raider Hitpoints** now has three clean reads. It was previously held because only `Invading Raider Hitpomts` appeared; the new spelling resolves that textual ambiguity. This batch also contains the misspelled -6% variant, which should remain raw evidence rather than a second identity.

**Invading Attack Helicopter Damage** has two clean reads with different signed values and is the other strongest addition candidate in this batch.

All five belong with invading single-unit effects, remain independent of the player's army, and use separate canonical identities from their friendly equivalents. If activated under the ongoing session's standard Multiplayer tier rule, each would have signed starting variants **-1%, -6%, and -11%**. The observed values listed above must remain distinct from rule-derived variants; upgraded visible percentages must not be rejected solely for differing from starting tiers.

## Still pending: Invading Guerrilla Hitpoints

This batch contains:
- `Invading Guernlla Hitpomnts -6%`
- `Invading Guernlla Hitpoints -6%`

Both suggest **Invading Guerrilla Hitpoints**, previously proposed in batch one. Neither is a clean spelling of the full name. It remains pending name confirmation and must not be collapsed into friendly Guerrilla Hitpoints or another invading unit.

## Spelling suggestions are now present

Current scanner source includes close-name matching, and the export explicitly records these two assumptions:

| Suggested canonical name | Raw sample | Review status |
|---|---|---|
| Machine Gun Infantry Damage | Mache Gun Infantry Damage +11% | Existing stat, assumed spelling |
| Invading Tactical Helicopter Healing | Invading Tactical Hehcopter Healing -6% | Existing stat, assumed spelling |

Both names already exist. They are not additional catalogue gaps. Suggestions retain raw OCR, preserve Enemy/Invading qualifiers, and require review before scoring; percentages are not repaired.

The collector's per-label flags come from the first occurrence of a label. Machine Gun Infantry Damage's label summary stays `assumed: true` and `known: false` even though a later sample has the clean spelling `Machine Gun Infantry Damage +1%`. Therefore label-summary unknown totals are not counts of raw lines that failed exact matching throughout the session.

Other spelling variants include `Enemy Siper Tower Hitpomts`, `Guernlla Damage`, `Bazooka Hitpomts`, `Defender Hitpomts`, and `Heavy Tank Hitpomts`. Their likely intended identities already exist. Conservative fuzzy matching may leave multi-error names unresolved, which is appropriate when a unique safe match cannot be established.

## Value and panel limits

The raw row `Invading Paratrooper Hitpomts 11%` has **no sign** and a null value. The clean `Invading Paratrooper Hitpoints -6%` supplies usable name evidence, but does not establish whether the malformed 11% row was positive or negative.

Recognised names can still have unusable percentages. Examples are `Vault Interest +69` and `Library Tech Oil Cost -1%            [§`; their values are null in the export. Do not convert these into expected tier values. This explains why broader name coverage does not guarantee a validated full panel.

## Changes made by this review

Saved the review only. No third-batch names, guessed aliases, rating weights, mode availability, or tier rules were activated or changed. The existing 32 added stats remain active. The five clean names above and the typo-only Guerrilla proposal are explicitly separated for the next catalogue update.

