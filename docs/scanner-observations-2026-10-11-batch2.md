# Second batch artifact stat review — 2026-10-11

Authority: User-requested second-batch review, followed by the user's request to plug both lists into the scanner.
Ownership: Catalogue coverage review.
Invariants: The nine clean names are approved for catalogue inclusion; no independent visual verification is claimed. Preserve friendly/Enemy/Invading identities. Multiplayer context continues from the session; this export does not independently identify the hall. War availability remains unknown.
Constraints: Text-only OCR export; no independent screenshots or per-artifact identities. Prior confirmation applies to the first batch's 23 names, not automatically to these new names.
History: Reviewed batch two, then activated its nine clean names when the user requested both lists be plugged in.

Source: `C:/Users/edwar/Downloads/artifact-perk-observations-2026-10-11 (1).json`, exported at 2026-10-11T18:15:39.560Z.

## Findings

The export contains 37 distinct reads, 101 unique labels, and only 1 originally validated read. Its label summary reports 53 known and 48 unknown labels. Distinct reads are not counts of artifacts.

Of the 48 unknown labels, 14 exact names are already recognised by the updated local catalogue, 9 are clean new candidates, 1 is a typo-only proposed new identity, and 24 are other OCR variants, clipped text, or dialog noise. Clean means complete-looking spelling and a signed percentage, not independent visual confirmation.

## Nine new names, now active

The following nine complete names were reviewed as candidates and then activated on the user's request to plug in both lists. Their database mode is Multiplayer/Main Hall under the continuing session context; War availability is unknown. Enemy Redoubt Hitpoints has the strongest repetition in this batch, with three reads.

| Candidate | Reads | Observed values |
|---|---:|---|
| Invading Ranged Infantry Damage | 1 | -1% |
| Invading Ranged Siege Hitpoints | 1 | -1% |
| Invading Tactical Helicopter Hitpoints | 1 | -1% |
| Invading Assault Vehicle Damage | 1 | -6% |
| Invading Armored Car Hitpoints | 1 | -6% |
| Enemy Redoubt Hitpoints | 3 | -6%, -1% |
| Tactical Helicopter Hitpoints | 1 | +1% |
| All Resources from Hunting | 1 | +1% |
| Redoubt Hitpoints | 1 | +1% |

At review time all nine were absent from the canonical mapping and factory-rating keys; they are now present in both. Invading Ranged Siege Hitpoints was previously a typo-only proposal (`Invading Ranged Siege Hitpomts`); this batch supplies a clean spelling and the user's subsequent inclusion request authorises its activation. Its old proposal is retained in the database's resolved-name review history.

Keep Tactical Helicopter Hitpoints separate from Tactical Helicopter Healing and from Invading Tactical Helicopter Hitpoints. Keep Enemy Redoubt Hitpoints separate from Redoubt Hitpoints. Invading and friendly effects must never collapse into one identity.

For any names subsequently confirmed as standard Multiplayer crafted stats, the session's 1/6/11 starting magnitudes apply with the correct sign. One observed tier does not need to become three names. Starting tiers must not reject upgraded visible percentages. War rules and availability must be supported separately.

## One additional typo-only proposal

`Invading Raider Hitpomts -6%` likely means **Invading Raider Hitpoints**. That intended name is not currently configured. Hold it for name confirmation; the malformed spelling must not be added as a canonical identity.

`Invading Tactucal Helicopter Hitpoints -6%` likely repeats the clean Invading Tactical Helicopter Hitpoints candidate above rather than providing another stat.

## Previously added names marked unknown

The following 14 exact names already exist in the updated local scanner catalogue:

- Missile Silo Hitpoints
- Invading Ranged Infantry Hitpoints
- Invading APC Hitpoints
- Invading Heavy Infantry Hitpoints
- Invading Bazooka Hitpoints
- Invading Machine Gun Infantry Hitpoints
- Invading Assault Vehicle Hitpoints
- Enemy Sniper Tower Hitpoints
- Enemy Missile Silo Hitpoints
- Invading Tactical Helicopter Healing
- Invading Supply Vehicle Healing
- Food from Fruit Trees
- Invading Supply Vehicle Hitpoints
- Anti-Tank Gun Hitpoints

All 14 are part of the first confirmed batch, but every one still carries `known: false` in this export. This strongly suggests an older loaded catalogue or a live deployment that lacks the local update. The JSON cannot determine which page/deployment produced it. Reload the updated local Scanner before the next batch; the local changes have not been deployed.

These entries are not further additions. Their new observed percentages supplement existing evidence without changing their identities or mode availability.

## OCR corrections and noise

Examples of probable spelling corrections to configured stats include `Enemy Ant-Tank Gun Damage`, `Enemy Ant-Tank Gun Hitpoints`, `Qil from Oil Wells`, `Oll Looted`, `Mache Gun Infantry Damage`, `Invading Mache Gun Infantry Damage`, and various `Hitpomts`/`Hitpomnts` substitutions. `Anti- Tank Gun Hitpoints` is a spacing variant. These are not new stat identities.

Some samples have malformed or absent percentages, including `Vault Interest +62`, `Vault Interest +69`, `Food Looted +6`, `Bomber Damage +6"`, and `O1l Looted +60`. Do not infer a missing percent sign or correct a value from the expected tier rule.

Sale dialog text again entered the collector, including `u want to sell Wallenstein’s` and `moved from your Museum.`. Stop or pause collection while the benefits panel is hidden to reduce this noise.

## Practical effect and changes

Adding confirmed names would reduce unknown-name errors, but names alone cannot fix incomplete panels, spelling errors, missing signs, malformed percentages, or disagreement between OCR passes. The export's single validated read is not an accuracy measurement: reads may repeat artifacts and include dialogs, and OCR confidence evidence is incomplete.

The initial review saved findings only. On the user's subsequent request to plug in both lists, the nine clean names were activated across the canonical mapping, rating keys, rating groups, army metadata, and synchronized browser copies. The database now has 32 active names with 96 signed 1/6/11 starting variants. First-batch names retain their explicit user confirmation; second-batch names record approval for inclusion and their continuing Multiplayer session context. War availability remains unknown for both sets.

New stat weights are neutral (0/0) and inherit existing group settings and profile overrides. Tactical Helicopter Hitpoints is tied to the player's Tactical Helicopter army scope; Invading effects stay independent. Existing weights are preserved. No guessed OCR aliases were added. Invading Raider Hitpoints remains pending because its only evidence is the typo-only read.

F5 on the updated local Scanner loads both lists. The live website still requires deployment before it contains these local changes. Catalogue fetches bypass the browser cache and shared metadata asset versions were bumped. The integration check `node scripts/test_artifact_stat_catalog.js` covers both sets and all 96 starting variants, plus mode provenance, strict OCR gates, rating inheritance, and browser synchronization.

