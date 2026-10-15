# Local artifact recognition prototype

Authority: `Untitled-1.md`, supplied `pic1.png`, and the user's decision to score all visible perks.
Ownership: Scanner recognition/correction and a minimal extraction of the existing artifact scorer.
Invariants: Include locked rows and duplicates; use current visible percentages; preserve existing Hall/Showcase scoring and rating inheritance. Pixels remain browser-local. No production deployment.
History: Builds on Phase 2 calibration. One real English gold-framed panel is verified; no claim of representative accuracy.

## Review of export (5) and the 22:23–22:24 screenshot pairs

For the subsequent broader review, temporal filtering, structured name matching, selective row retries and displayed-result diagnostics, see [batch (6) review](scanner-review-2026-10-11-batch6.md). Crafting still requires exactly five rows; the separate stored-artifact scanner shares the parser with an explicit five/six-row parameter.

Reviewed all 57 reads in the latest export and three new game/app pairs. Added independently transcribed fixtures `review-222336`, `review-222422`, and `review-222443`. The original pipeline already reads these native screenshots completely, so they do not reproduce the reported live failures. The updated pipeline passes all nine native, 75% size, and loose crop checks; this does not establish live accuracy.

Every physical row now shows its detected White/grey, Green, Blue/cyan, or Colour unclear badge, independently of percentage inference. The badge includes the expected magnitude tier for Main (1/6/11) or War (1/3/5); it does not replace a conflicting OCR value. Colour evidence is also included in exported scans, including unreadable rows. Manual correction retains this evidence.

Coloured row retries now isolate saturated ink of the detected colour instead of admitting blue-grey background texture. A clearly matched name with an unreadable percentage can benefit from that retry and the existing labelled colour inference; weak evidence remains unconfirmed. Additional observed spelling confusions remain suggestions constrained to unique catalogue matches and protected Enemy/Invading prefixes. Signed percentages followed only by bounded tiny noise tokens can count for an exact known name, while the original OCR and a review warning remain available. Other suffixes, extra numeric values and unknown names stay rejected.

Equally complete row retries preserve physical row boundaries when a block read omitted a row, preventing subsequent stats from sliding into the wrong colour/star slot. Invading Guerrilla Hitpoints and Invading Mortar Troop Hitpoints are still absent from current perk defaults: readable complete unknown rows count as collected names, but cannot receive confirmed ratings. Catalogue validation remains separate.

## Using it

Open Scanner through the existing local server and refresh the browser. Connect Game, or load a local screenshot. The detector looks for the verified gold-framed panel. If found, the crop previews the entire panel and OCR uses a relative inner text region that excludes stars and the heading. Otherwise select the region manually.

For another layout, choose Text rows only and select just the perk text, excluding headings/icons. The scanner expects exactly five rows, including locked rows and duplicates.

Auto read waits for a stable changed crop. Read Artifact retries explicitly. The small change/stability gate is included to make the recognition prototype useful without repeated clicks; this overlaps the basic Phase 4 monitoring work, but full live/background reliability and performance acceptance remain pending.

Scores use the active profile's factory/army fallback, group defaults, individual global exceptions, and profile exceptions. The selected Hall/Showcase mode and Off/Def controls apply for this scanner session. Scanner OCR and corrected manual values call `DNArtifactScoring.score`, also used by the priority page. Unknown names, malformed signed percentages, unexpected row count, or weak OCR evidence require correction before a rating is confirmed. The OCR threshold is a conservative review gate, not a calibrated probability or a 99% accuracy claim.

Correct Recognition preserves every visible row separately. Changing a captured artifact invalidates the prior result. Stop, interruptions, background delays, resize/calibration changes, and session cancellation discard stale work/results. User edits cannot be overwritten by an older OCR request. No captured images, recognised text, or corrections are uploaded or persisted.

## Evidence and limits

`tests/scanner/pic1.png` is the actual user screenshot, kept outside the publish root. Independent labels include all five +1% rows, including duplicate Catapult Damage and the four dimmed rows. Reports record browser and machine-specific timings; derived scaled versions are robustness probes of the same image, not independent fixtures.

The actual browser fixture harness verified native automatic detection, manual text calibration, and 0.75x/1.5x resizes through production OCR and the shared scorer. Actual UI testing exercises screenshot selection, detection, automatic reading, displayed results, and Stop cleanup. Source-capture permissions, foreground gameplay transitions, hidden/occluded/minimized sessions, and broad game layouts still require interactive tests. One screenshot does not establish 99% accuracy or a general latency guarantee.

Run:

```text
node scripts/test_artifact_scoring.js
node scripts/test_scanner_recognition.js
node scripts/test_scanner_reading.js
node scripts/test_scanner_capture.js
node scripts/test_perk_groups.js
node scripts/test_army_catalog.js
node scripts/run_scanner_ocr_fixture.js --report
node scripts/run_scanner_ocr_fixture.js --ui --report
```

The fixture harness starts an isolated headless Chrome session and a loopback-only server, then closes both. It can need permission to launch Chrome outside a restricted sandbox. No npm install or test-library dependencies are required.

OCR JS/WASM/model assets are pinned and self-hosted; see `ui/vendor/tesseract/README.md`. No deployment configuration or canonical perk definitions were changed. Terms of Service permissibility remains unresolved as described in Phase 1. Additional real screenshots and live sessions are required before production readiness.

## Difficult-read retry

Unvalidated block reads now receive one bounded pass over individual text rows. Both passes use exact canonical names and signed percentages. Conflicts in known names, values, row count, or Enemy/Invading qualifiers remain unconfirmed. Perk labels absent from the configured catalogue are not converted into similarly named friendly/enemy perks. A supplied failure reported `Enemy Sniper Tower Hitpoints` (not currently configured) and `Er tpoints` (incomplete text); its underlying screen is still needed to distinguish catalogue coverage from cropping/OCR errors.

## Session attribute collection

Enable Collect names while I cycle through artifacts, then manually view artifacts and wait for each read. This enables automatic reading even when Auto read stable changes is off. Current, completed OCR reads feed a separate session collector, including failed validations and both block/single-row passes. Unknown labels remain unverified; collection does not change scoring acceptance or catalogue definitions. Consecutive identical text observations deduplicate; this is not a count of distinct artifacts or proof of exhaustive perk coverage.

Stop retains collected text. Pause by unchecking collection. Export Collected Names downloads a local JSON with unique labels, sample OCR text/values, and scan observations/warnings. No screenshots or profile/account identifiers are included. Reload/close clears session memory. Export before closing. A 5,000-read cap bounds memory; export and clear to continue longer sessions. Test with `node scripts/test_scanner_collection.js`.
# Five-row recognition and spelling suggestions (2026-10-11)

Live-capture review (game/app pairs from Pictures/Screenshots, export `(4).json`): ten independently transcribed game panels already read correctly at native calibration with the current pipeline; the paired app failures therefore do not establish a native-image OCR failure alone. Live crop placement and animation remain material variables. Each panel is now retained as a review fixture and tested with additional calibration margins. Recognition realigns to detected gold borders inside the selected crop, including before star sampling. The matching vocabulary handles observed compound spelling errors while keeping suggestions unconfirmed, retaining qualifiers, and leaving the catalogue unchanged.

The reading controller keeps the prior rows visible during image stabilization, retries, and temporary capture pauses. A pending/paused banner identifies those rows as the last capture, and the rating is unconfirmed until the current read completes. A completed zero-useful-row read with no recognised names clears the previous view. A weaker same-artifact retry cannot replace the best read. Automatic processing is bounded to two fresh-image attempts per artifact; the prominent Finished status reports the best x/5 and whether review is needed. Small animation changes do not restart a finished read; a material text-region change (over 0.3% of sampled pixels with quantized difference above one) starts a new artifact cycle. Manual Read Artifact always starts another cycle. This image gate is heuristic, and fresh live capture is not equivalent to the frozen screenshot tests.

Batch `(3).json` (54 reads, 164 labels) supplies further evidence of misread leading signs (`«`, `»`, or absent signs) and trailing OCR noise. Name extraction now separates the numeric suffix from its validation: a damaged sign does not turn a known name into a new label. Numeric OCR remains strict.

User-confirmed colour fallback: Main/multiplayer neutral/green/blue values are 1/6/11%; War values are 1/3/5%. The scanner exposes an artifact-type selector and an optional colour fallback. Detection samples contrasting text strokes, excluding the smooth blue panel background. Only known names with a known sign and clear colour receive inferred percentages; these are labelled, preserve raw OCR, and require review before rating confirmation. Readable values that conflict with colour are flagged, never silently replaced. A bounded focused percentage retry uses two views and requires agreement plus OCR evidence; unclear results stay unconfirmed. Exports retain hall, star count, and separate inferred-value evidence.

Unlock detection now reads filled yellow star centres rather than text brightness. Only a consistent prefix of 1–3 filled stars yields a count. Text-only crops have no star evidence and show an explicit crop instruction. Real fixtures verify one filled star; copied-star synthetic probes verify counts two and three. Synthetic OCR-sign corruption tests use actual fixture pixels to verify Main colour recovery of both positive values and negative green/blue values. Pure tests verify the War 1/3/5 mapping; no independent War screenshot has been supplied yet.

Follow-up colour evidence: the user's four latest screenshots comprise two game panels and two scanner failure views. `invaders-green.png` contains green rows 2 and 5; `invaders-cyan.png` contains a cyan fifth row. Stronger green/blue/cyan contrast and a bounded coloured-ink retry recover original percentages over the brown background. Each failed row gets at most one additional colour-only OCR pass. No sign, number, or percent glyph is substituted. Improved complete retries display all useful rows even when a name remains outside the catalogue, while ratings remain unconfirmed. Both panels now capture five correct names/values, with duplicates/qualifiers preserved. The green panel's `Invading Ranged Siege Damage` remains a collected candidate pending catalogue work by the other agent.

Faded colour regression: `greenissue.png` independently supplies five labelled rows, with green `Redoubt Hitpoints +6%` and one unlocked row. Preprocessing preserves the strongest channel for saturated green/blue glyphs while retaining weighted grayscale for the panel background. Unlock estimates still use original pixels. Native, text-only, scaled, and forced-row-retry checks pass; a synthetic blue recolouring of the green row also passes. This blue probe is not evidence from an independent real blue screenshot. Complete five-row retries may recover omissions when the initial rows match in order without conflicting names, qualifiers, or values. Run `node scripts/run_scanner_ocr_fixture.js --green --report` for the colour regression.

Latest-batch review: `artifact-perk-observations-2026-10-11 (2).json` contains 53 reads and 120 labels. Observed token confusions (`Hitpomts`, `Hitpomnts`, `Guernlla`, `Tactucal`, `Siper`, `Oll`) now aid unique catalogue suggestions, including combined errors. These remain assumptions requiring review. No catalogue validation or additions are performed here; another agent owns that work.

The prominent enabled-stat badge displays the visual estimate 1, 2, or 3, or ? when unclear. The traffic light counts current rows with readable signed percentages and known, assumed, or plausible new names: red for zero, orange for one to four, green for exactly five rows accounting for all five stats. Extra rows remain orange. Duplicate perks count separately. New-name candidates need complete-looking alphabetic labels with at least two substantial words; fragments and sale-dialog text do not count. Green indicates capture completeness, not a confirmed rating or verified catalogue names. Raw unknown observations remain exportable even when too unclear to count toward completeness.

The scanner now requires exactly five rows with signed numeric percentages to confirm a rating. Unknown text without a percent sign is discarded from parsing and collection; recognisable incomplete rows remain available for correction. Unknown percentage-bearing labels remain collectable for catalogue review.

Name matching normalises spacing and harmless punctuation. Unique edit-distance suggestions allow one character change, or two for names at least 20 characters long, only when the next candidate is at least two edits farther away. Enemy and Invading qualifiers must match. Suggestions are labelled Assumed, require review before scoring, and never repair percentages. Raw OCR text remains in collection evidence.

The rating section has a fixed height with internal scrolling and always renders five row slots. Rows show recognition status and a visual unlock estimate. The estimate compares original text brightness across five equally spaced rows, expecting a bright prefix of one, two, or three rows. If brightness separation is weak or inconsistent, the count remains unclear. All five perks still count toward rating. The real screenshot validates one unlocked row; two and three are covered by synthetic brightness tests, not additional real screenshots.

