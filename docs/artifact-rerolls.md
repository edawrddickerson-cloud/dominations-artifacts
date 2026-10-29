# Artifact reroll availability

## Protected potential formula

Potential = sum of the card's actual level-10 row scores + ONE best eligible
reroll gain. Each candidate gain is max(0, best legal level-10 replacement score
minus that row's actual level-10 score). Never substitute the best possible
stat for every row. Scanned cards, owned cards, target scores and Collection
comparison ordering must use this same formula.

Hand-calculated War examples with a best legal replacement worth 150 points
and all rows rerollable:

| Actual level-10 row scores | Upgraded sum | Best single gain | Potential |
| --- | ---: | ---: | ---: |
| 150, 30, 15, 0, 0 | 195 | 150 | **345** |
| 150, 60, 15, 0, 0 | 225 | 150 | **375** |

Neither card scores 750. A reroll adds only its improvement and does not erase
the other four rows. These examples are locked in
scripts/test_crafting_score_contract.js and the mandatory scanner gate.

Each scanned perk stores `rerollEligible` as true, false, or null. Blue dice button backgrounds indicate true; grey backgrounds indicate false; missing or ambiguous dice indicate null. Dice are independent of the unlocked star and upgrade level. Storage uses original source pixels before OCR processing. A change between the latest frame and the noise-filtered frame produces an unknown observation rather than a guessed mask.

Fresh crafts default to all five perks available. Optional calibrated dice observations override this per row, including explicit unknown observations. Legendary and Mythical perks are unavailable. Existing storage records without dice data stay unknown. Manual dice controls cycle available, unavailable, unknown; unknown controls have amber borders. Eligibility survives Keep, export, import, Collection edits, and rescans. Different confirmed masks do not merge as duplicates.

Collection and Crafting comparisons use the same scoring helper. Start with the factual fully upgraded sum under the selected rating axes. The replacement ceiling is the highest effective rating of a legal benefit in the item's hall/category times its upgraded magnitude (20 Main, 15 War). Ratings come from the same strategy, group/global overrides, army exclusions and selected axes as the existing rows. When both axes are enabled, use the higher rating once. Evaluate eligible rows, then select the single largest nonnegative replacement gain. Gain is the ceiling minus that row's existing contribution, never the entire ceiling added on top. Only ONE row may be replaced. Keep the other four actual stats and their own level-10 values. An unknown hall/category grants no assumed bonus and remains provisional when rerolls are possible. Negative ratings can favor the fully upgraded low tier (10%).

With the repository's factory ratings and the scanner's category axes:

| Hall | Category | Highest rated legal benefit | Replacement ceiling |
| --- | --- | --- | ---: |
| Main | Weapon | Enemy Defender Spawn Time (Off 5), or Defender Spawn Time (Def 5) | 100 |
| Main | Armor | Defender Damage / Hitpoints (Def 3) | 60 |
| Main | Jewelry | Individual enemy building damage / hitpoints (Off 2) | 40 |
| Main | Pottery | Individual own building damage / hitpoints (Def 2) | 40 |
| War | Weapon | Supply Vehicle Healing (Off 2); normal unit damage is 1 | 30, or 15 when healing is excluded by the army |
| War | Armor | Individual own troop hitpoints (Off 1) | 15 |
| War | Equipment | All Enemy Defensive Towers Damage / Hitpoints, Enemy Defender Spawn Time (Off 5) | 75 |

These are factory examples, not fixed caps. For example a Jewelry loot stat rated 4 gives an 80-point ceiling. Legendary/Mythical multi-troop buffs, attack speed, combined stats and research-time benefits never enter an ordinary roll pool merely because they exist in the catalogue. The scorer exposes the selected legal stat and magnitude; the scanner's gain tooltip identifies the replacement behind the points.

Pool review (2026-10-17): Main [Weapon](https://dominations.fandom.com/wiki/Weapon_Artifacts), [Armor](https://dominations.fandom.com/wiki/Armour_Artifacts), [Jewelry](https://dominations.fandom.com/wiki/Jewelry_Artifacts) and [Pottery](https://dominations.fandom.com/wiki/Pottery_Artifacts) benefit lists; War families in the [American Hawks museum guide](https://americanhawks.wordpress.com/2019/04/) and [community benefit-pool reference](https://www.reddit.com/r/Dominations/comments/mvo1mp/); Assault Vehicle additions and both halls' starting tiers in [official Update 12.19](https://www.dominationsworld.com/blog/dominations-update-1219/). War Weapons contain troop damage/healing and invading troop HP; War Armor contains troop HP and invading damage/healing; generals, buildings and spawn modifiers belong to War Equipment. This models an ideal legal replacement, not its drop probability, crown cost or expected return. It does not model the two-identical-starting-percentage restriction described in [official Update 12.20](https://www.dominationsworld.com/blog/dominations-update-1220/); ceilings remain upper bounds when an existing artifact has saturated identical lines.

Unknown eligibility contributes no guaranteed bonus. If an unknown row could improve the potential beyond known eligible rows, show the comparison as provisional. Captured percentages, rating values, ordinary scores and loadout totals remain factual. Fresh craft defaults are semantic information and do not increase the capture meter; explicitly sampled dice do count as capture fields.

Collection's **All rows** comparison displays the fully upgraded factual score plus the gain from one best eligible reroll, followed by the potential total: `150 score + 75 possible = 225 total`. Per-stat names, percentages and scores remain factual; replacement targets are not inserted into the rows. Candidate ordering and swap differences use the potential totals. **Unlocked rows** uses factual upgraded scores without a reroll bonus. Unknown dice grant no assumed gain and retain a visible uncertainty note.

Verification: `node scripts/test_reroll_potential.js`, `node scripts/test_scanner_reroll_recognition.js`, and browser fixture modes `--reroll-pools`, `--reroll-ui`, `--crafting-edits`, `--storage-layout`, and `--collection-comparison`. The pool check covers all seven categories, actual scanner totals, factual row scores, the selected single-row gain and its target tooltip. The Collection browser check covers factual stat rows, the one-reroll limit, zero and unknown eligibility, and manual eligibility edits.
