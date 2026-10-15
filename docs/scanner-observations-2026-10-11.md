# Main Hall perk observation review — 2026-10-11

Authority: User-supplied OCR export, user-confirmed Main Hall (multiplayer) context, and subsequent explicit confirmation of all 23 complete names and their 1/6/11 starting tiers.
Ownership: Scanner catalogue review.
Invariants: Raw OCR observations do not verify themselves. User confirmation establishes the 23 complete names and Multiplayer starting tiers. Main Hall evidence does not establish War Hall availability. Observed percentages are not minimums, maximums, or rating defaults.
Constraints: Text-only export; verification comes from the user's explicit confirmation, with no screenshots for an independent visual check.
History: Initial OCR review followed by activation of 23 names and mode/tier storage after user confirmation on 2026-10-11.

Source: `C:\Users\edwar\Downloads\artifact-perk-observations-2026-10-11.json`, exported at 2026-10-11T17:53:11.152Z. The user confirms all artifacts in this collection are Main Hall (multiplayer) artifacts. War Hall availability remains unknown for every candidate below.

The export contains 60 distinct OCR reads and 149 unique labels: 56 recognised labels and 93 unknown labels. These are not counts of distinct artifacts: changing OCR noise produces additional reads of the same artifact. Only one full read passed the recognition gate; individual useful names are still retained in failed reads.

The initial review identified the following 23 complete-looking labels missing from perk settings. The user subsequently confirmed all 23 names and their complete 1/6/11 Multiplayer starting tiers; they are now active catalogue entries. Read counts measure repetition, not independent visual confirmation.

| Main Hall candidate | Reads | Observed percentages |
|---|---:|---|
| Enemy Sniper Tower Hitpoints | 29 | -1% |
| Enemy Missile Silo Hitpoints | 24 | -11% |
| Supply Vehicle Hitpoints | 1 | +1% |
| Enemy Air Defense Hitpoints | 1 | -1% |
| Invading Raider Damage | 1 | -1% |
| Invading Tactical Helicopter Healing | 2 | -6%, -1% |
| Invading Ranged Infantry Hitpoints | 1 | -6% |
| Invading Heavy Infantry Damage | 1 | -6% |
| Food from Fruit Trees | 2 | +1% |
| Invading Heavy Cavalry Hitpoints | 1 | -1% |
| Invading Attack Helicopter Hitpoints | 2 | -6% |
| Invading Armored Car Damage | 1 | -6% |
| Invading Heavy Infantry Hitpoints | 1 | -6% |
| Invading Supply Vehicle Healing | 1 | -6% |
| Invading Supply Vehicle Hitpoints | 1 | -6% |
| Invading MRL Hitpoints | 1 | -6% |
| Invading Bazooka Hitpoints | 1 | -6% |
| Anti-Tank Gun Hitpoints | 1 | +1% |
| Missile Silo Hitpoints | 1 | +1% |
| Invading Machine Gun Infantry Hitpoints | 1 | -1% |
| Invading APC Hitpoints | 1 | -6% |
| Invading MRL Damage | 1 | -1% |
| Invading Assault Vehicle Hitpoints | 1 | -1% |

Other labels contain likely OCR substitutions, including `Ant-Tank`, `Hitpomts`, `Guernlla`, and `Vault Capacnt`. Their original text must remain available for review; a guessed correction must not establish a new perk or its hall availability.

The remaining unknown labels include clipped names, punctuation, and sale-confirmation text such as `you want to sell Caterina` and `moved from your Museum.` The scanner continued reading after the benefits panel disappeared. These are not new attributes.

For catalogue expansion, preserve a shared canonical identity where names truly match, with hall availability supported separately by evidence. These Main Hall candidates were subsequently confirmed by the user; absence from this session establishes nothing about War Hall. Group-level default inheritance operates over confirmed identities without inferring hall availability from a name or group.

The initial review did not change settings. After user confirmation, the follow-up activated these names in the canonical mapping, rating settings, rating groups, and army metadata, with separate mode/tier provenance in the catalogue JSON.

## Recommendation and database recording

All 23 complete labels in the table are **user-confirmed Multiplayer stats** and are now active. Before this update all 23 were missing from factory rating settings; 21 were also missing from the canonical name mapping. Invading Raider Damage and Invading Bazooka Hitpoints already existed in the mapping but were not scanner-recognised because the scanner uses factory-rating keys as its name list. The update adds 21 mappings and 23 settings entries, preserving friendly, Enemy, and Invading distinctions. It does not establish an exhaustive roll pool.

**Enemy Sniper Tower Hitpoints** (29 reads) and **Enemy Missile Silo Hitpoints** (24 reads) were the clearest repeated scanner coverage gaps and are included in the activated set. Reads can repeat the same artifact; the user's explicit confirmation is recorded separately.

The candidates divide into the existing rating sections as follows. Suggested sections classify the effect; they do not establish a rating or game-mode availability.

| Suggested section | Candidates |
|---|---:|
| Enemy defensive buildings | 3 |
| Single units: Supply Vehicle Hitpoints | 1 |
| Defensive buildings: Anti-Tank Gun Hitpoints, Missile Silo Hitpoints | 2 |
| Invading single units: damage and hitpoints | 14 |
| Enemy utility: Invading Tactical Helicopter Healing, Invading Supply Vehicle Healing | 2 |
| Resource production: Food from Fruit Trees | 1 |

`data/possible_artifact_stats.json` stores the 23 active, user-confirmed entries with stable stat IDs, canonical names, signed observed values, raw OCR samples, read counts, source references, and confirmation provenance. Every entry records `observed_mode: Multiplayer` and `observed_hall: Main`. Multiplayer availability is `confirmed`, with all three signed `starting_values`; War availability is `unknown`. No entry from this source is assigned War availability. Unknown means untested, not unavailable. The browser copy at `ui/data/possible_artifact_stats.json` is synchronized, and canonical builds preserve it.

Keep one canonical identity per stat, with separate availability evidence for each mode. If a future War scan confirms the same stat, extend that stat's War availability rather than creating another identity. Stat identity must also preserve the Enemy/Invading qualifiers: Missile Silo Hitpoints and Enemy Missile Silo Hitpoints are different stats.

## Name corrections requiring review

Two additional potential gaps appear only with OCR spelling errors and remain outside the 23 recommended entries:

| Raw OCR label | Proposed name | Observed value | Decision |
|---|---|---|---|
| Invading Guernlla Hitpoints | Invading Guerrilla Hitpoints | -6% | Confirm full name before adding |
| Invading Ranged Siege Hitpomts | Invading Ranged Siege Hitpoints | -6% | Confirm full name before adding |

Both are retained in `pending_name_reviews` in the JSON dataset, labelled as Multiplayer observations with War availability unknown. Other misspellings such as Enemy Ant-Tank Gun Damage, Sniper Tower Hitpomts, and Guernlla Hitpoints suggest corrections to existing identities rather than additional stats. Invading Bazooka Hitpomts likely duplicates the clean Invading Bazooka Hitpoints candidate already in the table. Do not add sale-dialog text, clipped labels, or punctuation as stats, and do not automatically activate guessed aliases.

## Starting percentage tiers

Store a stat's identity separately from its starting percentage tiers. Enemy Sniper Tower Hitpoints remains one stat with three confirmed Multiplayer starting values, -1%, -6%, and -11%; these are not three stat names. The observed -1% comes from this session; the other magnitudes come from the user's explicit confirmation of all tiers. Each entry preserves its sign across all three variants.

| Mode | Database hall | User-supplied starting magnitudes | Status |
|---|---|---|---|
| Multiplayer | Main | 1%, 6%, 11% | Explicitly confirmed by user for all 23 stats |
| War | War | 1%, 3%, 5% | Provisional; reconcile conflicting official evidence |

The [official Week Ahead post dated September 15, 2025](https://www.dominationsworld.com/blog/week-ahead-91525/) describes Main Hall rerolls starting at 11% and War Hall rerolls starting at 6%, with fully upgraded values of 20% and 15%. Its War value conflicts with the supplied 5% upper tier. The JSON preserves the user's 1/3/5 rule as `pending_reconciliation`, records the official 6% evidence separately, and must not be used to reject a 6% War read. The dated post alone does not verify the full current War tier set.

These tier profiles concern standard crafted percentage benefits. They do not set allowed visible OCR values for upgraded benefits, overwrite fixed Legendary/Mythical bonuses, establish artifact categories, or determine a stat's mode. A 1% value shared by both modes cannot identify the hall. Keep observed values, starting tiers, upgrade level, and fixed-artifact values separate.

## Effect on the next scanner run

The 23 names are now integrated into the active canonical mapping, factory-rating keys, rating sections, and army scope metadata. The scanner recognises these exact names and no longer rejects them solely for being absent from its catalogue. Reload the local Scanner page to load the updated data. Scanner catalogue fetches bypass the cache and shared metadata asset versions are updated. These changes are local and have not been deployed.

New settings entries start with neutral factory weights of 0 on both axes because names and availability were confirmed, not strategic rating weights. They inherit existing group defaults and support individual/global/profile exceptions. Supply Vehicle Hitpoints uses the player's Supply Vehicle army scope; Enemy/Invading, defensive building, and resource effects remain independent of the player's army. Existing stat weights and artifact records are preserved.

Catalogue coverage improves; pixel readability and OCR confidence do not change. Clipped names, incorrect signs, conflicting percentages, and weak reads still need correction. The two typo-only proposed names remain pending.

Validation: `node scripts/test_artifact_stat_catalog.js` checks all 23 names and 69 signed starting variants, the previously unknown five-row panel, mode provenance, strict OCR gates, upgraded values, browser data synchronization, and rating inheritance. Existing army, grouping, scoring, scanner-recognition, and scanner-reading checks also run after the update.
