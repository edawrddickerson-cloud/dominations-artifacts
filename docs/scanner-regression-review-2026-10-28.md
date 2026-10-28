# Crafting scanner regression review

28 October 2026. Baseline: `df8ae12`, before the collection/recent-items and OCR
corrections in the accompanying change. This review inspected repository history
and ran isolated reproductions of the committed production functions. It does
not establish how often a fault occurs during live game capture.

## Confirmed faults and gaps

| Behaviour | Confirmed cause | History and evidence |
| --- | --- | --- |
| Add to Collection disabled despite five complete stats | The main action additionally required every field in `identification().missing` to be empty. This includes individual stars, Hall provenance and, where requested, dice evidence. Logged Keep used a different prerequisite: complete stat rows, Hall, category and the correct profile. | `612e045` added the full-identification gate on 17 October. Running the baseline Keep controller with complete stats and `missing: ['Row 1 star']` disables the button; changing only `missing` to `[]` enables it. This predates the latest latency work. |
| A failed save has no visible message | The error was assigned only to the button's `title`; the visible status element and its renderer were removed. | `cca5745`, 22 October. A retry could remain available while the reason for the failure was only discoverable by hovering. This is an observability fault, not evidence that the IndexedDB transaction itself is faulty. |
| The button is unavailable while the previous capture remains visible | Reading deliberately retained the old display during an artifact transition, but passed the new acquisition's `current` flag and encounter ID to Keep. | At the baseline, `score()` has separate retained display/capture state but always calls `Keep.update(result, {current, encounterId: currentItem})`. A safe retained action must use both the displayed snapshot and its original encounter ID; enabling the button alone would risk saving the wrong item. |
| An exact stat name can be replaced by a fuzzy match | Retention ranked row conflict status, whole-row confidence and numeric completeness without making exact name identity an independent invariant. | A baseline `retainCraftRead` reproduction replaces an exact name with a suggested name when the original row has `tierConflict`. It also replaces an exact name with a higher-confidence `nameMatch.method: 'ocr-glyphs'` row even without conflict. `automatic: true` is insufficient to identify an exact match: glyph and catalogue corrections can also be automatic. |
| A blue War row can keep an unknown percentage | Colour inference ran inside recognition before same-encounter retention. The colour read could arrive with an unreadable name, so inference could not determine polarity. Retention then restored the earlier exact name without applying inference to the combined evidence. | A baseline reproduction starts with exact `Invading APC Hitpoints`, `value: null`, then supplies an unreadable retry and blue row colour. The result retains the exact name and blue colour but still has `value: null`. Applying the existing inference function after retention produces `-6`. The ordinary War tier table itself remains `[1, 3, 6]`. |
| Ownership tests no longer exercise the current page contract | The crafting Keep browser fixture still queried the scanner's old full-log list, name inputs, clear button and disclosure after those controls moved to Crafting Stats. | `1f1fdff`, 25 October, moved `scanner-item-log` out of `scanner.html`; the corresponding fixture was not migrated in that commit. The baseline fixture therefore cannot complete its old full-log workflow on the current scanner page. Passing parser, timing or visual checks does not compensate for that broken ownership scenario. |

The row-retention helper was introduced in `3b58271` on 17 October. `612e045`
expanded it to retain disputed or incomplete display candidates, but ranked
conflict state ahead of name certainty. `46d58d5` subsequently protected manual
names, percentages, profile context and geometry refreshes. Those improvements
did not cover exact identity versus automatic fuzzy matching or colour inference
after independent fields were combined.

No isolated same-encounter reproduction replaced a held known name with a
`known: false` raw string: the baseline helper already rejects that direct
replacement. The user's literal nonsense-text symptom may also involve an
encounter reset or an earlier name that the parser had not accepted. A live
frame/context trace would be needed to distinguish those possibilities. Do not
present the reproduced fuzzy-match fault as proof of every reported transition.

## Why checks missed these cases

The relevant checks were split among parser, geometry, display, ownership and
timing fixtures. The general scanner check list did not automatically run the
ownership fixture. The ownership fixture itself had drifted from the page's
structure. Real OCR latency fixtures mostly exercise complete static screenshots;
they do not model a name becoming readable before colour/percentage evidence, or
a correct name being followed by a different fuzzy match.

Existing retention assertions covered weaker confidence, missing names, manual
names, metadata changes and new artifacts. They did not vary name evidence
independently from numeric conflicts, or distinguish exact matches from automatic
glyph/catalogue matches. That omission allowed whole-row confidence to stand in
for certainty about each individual field.

There is no repository `.github` workflow or package test command establishing
these scenarios as a compulsory release gate. The static site builder and the
release byte/header verifier validate packaging and served assets; they are not
scanner behaviour tests. This review cannot determine which checks were run in
earlier development sessions, and does not assert that every prior commit skipped
validation.

## Prevention contract

1. **Keep identity per encounter.** Exact or manually confirmed name evidence
   outranks suggested, glyph-corrected, catalogue-corrected and unknown name
   evidence independently of the percentage or whole-row confidence. Test exact
   names with missing values and numeric conflicts, followed by every weaker name
   class. Allow stronger exact evidence and explicit manual corrections. Reset
   only on the existing new-artifact/profile/capture boundaries.
2. **Combine independent fields before applying dependent inference.** When a
   held exact name and a fresh classified colour jointly supply an ordinary tier
   and canonical sign, produce the signed provisional value. Test War white/green/
   blue as 1/3/6, both signs, Main tiers, the inference toggle, conflict handling,
   direct OCR confirmation and new-encounter isolation. Keep raw observations and
   inferred provenance; inferred display is not verified OCR.
3. **Use one ownership contract.** The current action and the recent/full-log
   actions must share completeness/profile rules and physical-item IDs. Test
   partial reads, missing optional capture fields, saved names/artwork, duplicate
   clicks, a profile switch, a failed durable write and a successful retry. A
   retained action must save the displayed encounter, not the next acquisition.
4. **Exercise the real page structure.** The scanner's latest-three list and the
   Crafting Stats full log need separate browser scenarios. Fail early if required
   nodes are missing. Verify newest-first ordering, three-item limit, profile
   isolation, durable reopening and a button remaining clickable through an OCR
   refresh. Use desktop and narrow viewports; do not reconstruct removed scanner
   controls only to make a stale fixture pass.
5. **Run one scanner contract entry point before scanner releases.** Include the
   recognition/retention/reading checks, current-page ownership workflow,
   comparison and provisional-colour checks. Include speculation and worker
   readiness for reading changes. Treat correctness failures as release failures;
   record latency evidence separately without a hardware-sensitive hard timing
   threshold. Keep the full 220 ms settling and exact input validation contracts.
6. **Report what was actually verified.** A source inspection, deterministic OCR
   ownership fixture, real static screenshot test and live capture test establish
   different things. Record the executed command/result and remaining limitation
   rather than describing a narrower test as end-to-end live accuracy.

The accompanying change implements this gate as
`node scripts/test_crafting_scanner_contract.cjs`, required by `ui/AGENTS.md`.
It includes the current ownership workflow at desktop and narrow widths, exact
identity and inference sequences, live lifecycle rules, comparison/display
checks and real War screenshots at three scales. The old glance test explicitly
allowed a higher-confidence fuzzy suggestion to replace a known name with a
disputed percentage; the user's new identity requirement supersedes that
expectation, and the rendered assertion now rejects the replacement.

This review alone does not certify a deployed release or identify every possible
source of live capture errors.
