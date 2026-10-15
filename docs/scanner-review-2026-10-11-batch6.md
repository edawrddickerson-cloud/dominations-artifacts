# Scanner review: batch (6) and five new screenshot pairs

Authority: User-requested broader review of approximately 80% complete reads, moving stars and name matching.
Ownership: Crafting scanner recognition, capture filtering and diagnostics. Catalogue additions remain outside this change.
Invariants: Preserve qualifiers, duplicate/locked rows and raw percentages; assumptions or conflicting evidence never confirm a rating; pixels stay local.
Constraints: Still images cannot establish animation causality or a live success rate. Synthetic moving stars are a robustness probe.
History: Reviewed the 22:54–22:57 screenshots and `artifact-perk-observations-2026-10-11 (6).json`.

The export contains 37 distinct reads and 113 labels. Only three reads were marked validated, which is a different measure from the user's approximately 80% five-row capture rate. Inferred percentages, close name matches and catalogue gaps can produce a complete capture while keeping a rating unconfirmed. Reads are also deduplicated observations, not an unbiased count of game artifacts.

Five rows compound small errors: if each row succeeds independently with probability 0.96, the probability of all five succeeding is about 0.815. Independence is an illustration, not a measured property of these captures. Improvement should be measured per row and per completed artifact, separating exact, assumed, inferred and new names.

## Findings from the pairs

The colour badges match the visible game text in all five pairs. Failures include a green Vault Interest displayed as +5%, a garbled Missile Silo name, a dropped Assault Vehicle fifth row, `Art Tank Gun Damage`, and an MRL row with errors in both the Invading prefix and Hitpoints suffix. The last Redoubt row retains a readable name but loses it during parsing because the sign and digit become `« &%`.

All five native frozen game screenshots already pass before this change. This points toward live timing, overlays, crop variations or OCR pass selection as remaining variables; it does not identify one of them as the proven cause. The 75% and loose crop probes also pass. Moving stars can affect the stability gate as well as OCR, so repeating OCR on a similarly contaminated single frame may repeat the failure.

Repeated clear unknown entries such as Invading Attack Helicopter Damage and Invading Ranged Siege Damage reflect missing perk defaults. They must remain collected candidates; fuzzy matching must not convert them into another unit or into friendly effects.

## Implemented approach

1. Keep a rolling window of three native crops from the current capture. A pixel median removes transient overlays present in one sample and preserves stationary text. The small image signature also uses three-sample filtering, so a moving overlay cannot repeatedly cancel crafting OCR. A broad scene change bypasses the median immediately; smaller changes need a majority of nearby samples. Artifact/session/region changes clear buffered images. Crops larger than 4MP fall back to single-frame reads. Storage retains its immediate invalidation behavior.
2. Match difficult names by qualifier, object and effect. Weighted glyph distance accounts for `rn/m`, `vv/w`, `cl/d`, `i/l`, and transpositions; spaces inside an object or prefix can be ignored. Strongly damaged qualifiers need an exact object anchor. Different Enemy/Invading/friendly classes and numeric signs remain protected; Damage, Hitpoints and Healing are not interchangeable. Close competing candidates remain unknown. This supplements the existing strict matcher rather than increasing its global edit limit.
3. Extract a name independently when percentage glyphs are damaged. `Redoubt Hitpoints « §%` keeps its known name and an unreadable OCR value. Optional colour inference remains explicit and unconfirmed.
4. Combine complementary evidence by physical row within a capture and between the two bounded same-artifact attempts. Never replace a conflicting known name silently. A fresh signed OCR value supported by colour may improve the displayed value, but numeric disagreement remains flagged and unconfirmed.
5. Check colour disagreements before the fast success path. Otherwise a text-valid green +5% read could finish before receiving a targeted retry. Retry only unclear, weak or inconsistent rows; reuse clear rows with strong line evidence.
6. Exports retain the displayed rows, final coverage, attempt/finished status, temporal method and OCR call count alongside raw observations. This makes the next batch useful for analysing actual presented outcomes instead of reconstructing them from different intermediate passes.

Examples recovered from the observed text include `is sile Silo HApoines` → Missile Silo Hitpoints, `Irswadiimg MRL Htpowits` → Invading MRL Hitpoints, `Irv ading Machine Gun infaiiry Hipoints` → Invading Machine Gun Infantry Hitpoints, and `Art Tank Gun Damage` → Anti-Tank Gun Damage. These remain labelled spelling assumptions. No percentage glyph is repaired by matching.

## Verification

All 16 new screenshot probes pass: five independent game panels at native size, 75% size and with added crop margins, plus one synthetic moving-star sequence. The production three-frame helper removes those disjoint overlays pixel-for-pixel; the resulting actual OCR retains five names/values and the two real unlocked stars. This does not prove it will remove a persistent overlay or an overlay covering the same text in two frames.

The four simpler native panels need one OCR call each. The panel containing two missing catalogue entries needs six calls. Difficult reduced-size panels use targeted retries. Existing green/cyan, signed-percentage recovery, unlock, UI, capture lifecycle, correction, collection and deterministic matching tests pass.

The next useful evidence is a new live batch after refreshing, especially failures that show `3-frame noise filtering`. Its export now identifies the rows and counts actually displayed. A recorded, repeatable live capture sequence would distinguish residual capture/animation faults from OCR faults more directly than frozen screenshots. Changing OCR engines is premature while the frozen panels already succeed.
