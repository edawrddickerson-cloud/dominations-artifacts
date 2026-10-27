# Profile 3: confirmed corrections applied

Authority: the user's follow-up confirms adding all six missing Mythicals if no equivalent exists, replacing older stats with the newly recorded names/values, 1,000 tokens each, and Leonidas Bust's deployment effect as +1 Spartan unit rather than 1%.

## Applied

- Added 10th Mountain Division War Kit, ASDIC Type 113X, Demarcation Stone, Norden Bombsight, Red Baron's Engine and Tizona Sword as War / Mythical, six perks each, 1,000 Legendary Tokens each.
- Compared normalized names and alternate names against every existing Mythical. No equivalent found; fuzzy nearest-name similarity was at most 0.572. Existing Legendary editions remain distinct and unchanged.
- Replaced Maori War Club row 5 with Invading Recon Scan Duration −10%, maximum −19%, following the user's confirmation of one percentage point per upgrade level.
- Recorded Leonidas Bust row 2 as +1 Spartan deployed when Mercenary Camp is destroyed. It is a count, not a percentage. Count formatting is shared by Collection, comparison, Showcase choices, rankings and Active Totals. Generic range inference no longer adds nine to deployment counts, including legacy in-memory ranges.
- Filled all 35 percentage maxima on the six new Mythicals using the user-confirmed nine-point magnitude increase from L1 to L10. Deployment effects remain fixed +1 counts without percentage upgrade extrapolation. Existing unconfirmed image mappings were not invented or copied from Legendary editions.
- Preserved repeated perk slots, including Norden's two Invading Fighter Damage rows and Tizona's two Ranged Siege Damage rows. The newly confirmed Red Baron values supersede the historical sign/stat-kind conflicts.

The canonical CSV/JSON and served JSON agree. Across the complete resolution, six canonical rows were added and five existing rows changed; all other canonical entries are unchanged. The durable source is [user_verified_artifact_overrides.json](../data/raw/user_verified_artifact_overrides.json), applied by the canonical builder after historical sources. Reapplying overrides is idempotent. The [original review](profile3-war-mythical-review-2026-10-27.md) and JSON remain historical snapshots of the pre-correction comparison; do not rerun its old assertions against corrected canonical data.

## Remaining questions resolved by the user

1. Arm Reliquary of Charlemagne (Mythical): Transport Cooldown **−11%**. Maximum corrected to −20%, retaining its existing nine-point upgrade span. Authority is the user's confirmation, not an independent Mythical scan.
2. Gemini 8 Helmet (Mythical): **Factory Troop Damage first**, followed by Attack Helicopter Damage, Armored Car Damage, Bazooka Damage, Heavy Tank Damage and Barracks Troop Damage. Existing signed values and maxima travel with their perks.
3. T-34 Tank Engine (Mythical): **Invading Barracks Troop Damage first**, followed by Heavy Tank Damage, Heavy Tank Hitpoints, Invading Heavy Tank Damage, Invading Heavy Tank Hitpoints and Invading Heavy Cavalry Damage. Existing signed values and maxima travel with their perks.
4. The six new Mythicals' percentage perks and Maori's revised perk: **one percentage point in magnitude per level, nine total from L1 to L10**, confirmed and applied. Negative debuffs become nine points more negative.
5. Norden Bombsight's APC Deploys Marines On Death: **+1 Marine unit**, confirmed. This remains distinct from Leonidas Bust's **+1 Spartan unit**; neither is a percentage.

No further stat, ordering, price or effect-unit confirmations are pending from this review. Missing artwork evidence remains a separate limitation; no unsupported images were added.

## Validation

- Passed design ownership, verified-artifact values/IDs, served-data parity, fixed count formatting/ranges, stored-artifact regressions, storage inference, artifact scoring parity, and the isolated Collection/strategy browser suite (34 checks).
- After the final confirmations, revalidated all override values, 35 new percentage maxima, Maori's −19 maximum, Arm Reliquary's −11/−20 range, both complete perk orders, count semantics, CSV/JSON/UI parity and override idempotence. Artifact scoring parity passed all 3,816 configurations. This follow-up changes dataset/provenance only; earlier UI checks are recorded below.
- The broad design run completed 210 checks; four failed on side-menu navigation in Crafting Statistics and Config at desktop/phone sizes. These routes were not edited in this task. Reviewed Collection desktop and Active Totals phone screenshots in `data/temp/design-review/`.
- `test_artifact_stat_catalog.js` fails at its unrelated Invading Ranged Siege Damage default-rating assertion: existing data says defensive 2, test expects 1. Rating data was not changed.
- No hosted workspace, user inventory, profile references, publication or deployment was changed. Count corrections apply during local loading/rendering; no destructive migration was performed.
