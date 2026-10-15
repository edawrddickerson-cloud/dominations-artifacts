# Fixed-sign rule and capture audit — 2026-10-11

Authority: User instruction that all Invading stats are negative and every stat has one fixed polarity.
Ownership: Canonical sign metadata, scanner validation, fuzzy suggestion eligibility, and capture audit.
Invariants: Preserve source OCR; no automatic sign flips or missing-sign repair. Sign belongs to a stat identity, not to a percentage tier, game mode, or rating weight.
Constraints: Uncatalogued names remain pending; spelling normalisation groups audit evidence without verifying new identities. No deployment.
History: Audited all three supplied exports and corrected pre-existing fixed-artifact data inconsistencies.

## Capture findings

`node scripts/audit_artifact_signs.js` audited all three original exports: 1,269 OCR rows across 150 distinct reads, including 1,147 numeric values. Repeated reads and block/row retry passes are counted separately; these are not artifact counts or accuracy measurements.

- No captured numeric value violates its configured stat sign.
- No captured Invading stat has a positive or zero numeric value.
- No stat has both positive and negative captured values after canonical alias and observed spelling normalisation.
- Two Invading rows remain incomplete: `Invading Supply Vehicle Hitpoints 6% eo        oo` in batch two, and `Invading Paratrooper Hitpomts 11%` in batch three. Their values remain null. The user's rule establishes that these effects are negative; the OCR has not supplied a readable signed value, so the scanner does not fabricate one.

The full audit is in `reports/artifact-sign-audit-2026-10-11.json`. All original exports are preserved.

## Canonical database corrections

The fixed-artifact database contained conflicting signs for six canonical stat names. The update changes 14 base/max fields across six artifacts, preserving each magnitude:

| Artifact | Stat | Correct polarity |
|---|---|---|
| Heads of Hevajra, Legendary | All Enemy Defensive Towers Damage | Negative |
| Fengguan Phoenix Crown, Mythical | All Defensive Towers Damage | Positive |
| Li Vessel, Mythical | APC Deploy Time | Negative |
| Silla Gold Crown, Mythical, two benefit rows | Library Tech Resource Cost | Negative |
| Mold Gold Cape, Legendary | Invading Bomber Damage | Negative |
| Gemini 8 Gloves, Mythical | Enemy Missile Silo Damage | Negative |

These corrections apply the user-authorised fixed-polarity invariant and consistent same-stat evidence; they do not claim the underlying cited sources were reverified. Changed rows record `sign_corrected_per_user_rule_2026-10-11` in their notes. `reports/artifact-sign-corrections-2026-10-11.json` retains every original and replacement value. JSON, CSV, and browser artifact copies are synchronized. The post-correction audit finds no mixed-sign artifact stats or sign violations.

## Scanner behaviour

The canonical army metadata now contains explicit `perk_signs` for 194 known identities. `DN.expectedPerkSign` always returns negative for any Invading name, including new names; other effects use the registry and unknown signs remain unknown. Enemy Defender Spawn Time stays positive while Defender Spawn Time stays negative: the Enemy prefix alone does not determine polarity.

- Exact recognised names with wrong signs cannot confirm a rating.
- Fuzzy suggestions preserve Enemy/Invading qualifiers and exclude candidates whose fixed polarity conflicts with a readable value.
- Spelling suggestions remain assumptions requiring review; no fuzzy match changes a percentage.
- Positive and negative duplicates of one identity produce a mixed-sign warning, including plausible new names.
- A retry cannot silently invert an earlier readable sign.
- Manual correction enforces the same fixed-sign rules.
- Wrong-sign rows do not produce a green completeness indicator.

The exporter validates configured signs and rejects conflicting artifact data. The canonical builder applies the registry before writing regenerated artifacts and records corrections, so a rebuild cannot restore these inconsistent signs. Existing stat weights and pending new names are preserved.

Refresh the local Scanner to load updated asset versions. Checks cover exact names, fuzzy sign filtering, negative Invading values, mixed duplicates, missing signs, retry conflicts, manual corrections, all 96 configured starting variants, rating inheritance, and scorer parity.
