# Stat context for uncertain OCR

The scanner now has a generated [stat-context database](../data/artifact_stat_context.json) covering 201 existing canonical identities and their reviewed aliases. It consolidates existing facts rather than creating new stats from OCR output. Both scanner pages load it; ordinary tier inference and stored-item tier handling use its shared profiles where loaded. Every completed controller reading receives a per-row context assessment.

## Available context

- Fixed signs for 200 identities, with the original rule authority retained. `Wall Miner Hitpoints` has no supported sign in the current sources and remains explicitly unknown.
- Ordinary starting tiers, upgrade levels 1–10 and a one-point magnitude increase per level. Main white/green/blue starts at 1/6/11; the saved War profile starts at 1/3/6.
- Positive evidence of ordinary availability for 95 Main and 13 War stats, from earlier reviewed catalogue entries and the manually reviewed video labels. Unknown availability does not mean unavailable; a name absent from this recording is not rejected.
- Existing stat groups/kinds and unit evidence where available. Unknown units are explicit.
- Named Legendary/Mythical base/max examples, kept separate from ordinary crafted tiers and Hall roll pools. No new Mythical maximum or ordinary availability is derived from those examples.

The latest user example says War green starts at 6, which differs from the saved 2026-10-14 correction (War green 3, blue 6). Clarification was requested; the existing profile is preserved while that detail is unresolved. The official [September 2025 reroll notice](https://www.dominationsworld.com/blog/week-ahead-91525/) corroborates the War top starting magnitude of 6 and upgraded 15, but does not identify its text colour.

## What the resolver does

For a known negative stat on a freshly crafted Main green row, the only expected value is `-6%`. Among observed `-5%` and `-6%` candidates, only `-6%` fits. Candidates with the wrong sign are rejected without flipping their raw signs. Without enough context, multiple legal candidates remain ambiguous.

Stored-item text colour does not establish its base tier. Verified level/tier evidence narrows possible values; missing levels retain all possible levels. Legendary/Mythical magnitudes bypass ordinary tier constraints. An assumed or unknown stat identity cannot supply the sign or a numeric expectation.

The resolver records a context-based choice separately from direct OCR. If no observed candidate fits, it can record the expected value while leaving the candidate unresolved. For example, the Bronze Helmet still has observed `-3%`, but its row context now explicitly records expected `-6%` and a tier conflict. This increment annotates original readings and preserves existing review/scoring gates; it does not silently replace that value, mark it directly read, or revise the owned collection.

## Existing browser evidence

The browser's current user session was not directly accessible through a debugging connection. The saved `artifact-perk-observations-2026-10-14.json` export was analysed instead: 345 scans, 128 logged items and 3,406 row observations. These observations contain repeated passes, not 3,406 independent artifacts. Its 221 unknown label strings are review candidates, not 221 new stats.

The [audit JSON](scanner-stat-context-audit-2026-10-16.json) keeps observed distributions separate from authoritative rules. Of its numeric observations with recognised identities, 383 had usable tier context and 2,108 did not. Zero recorded tier conflicts is therefore not proof that the older OCR was correct. Repetition and the scanner's own `validated` flag do not confirm a new rule.

The [subsequent full item export review](scanner-full-item-log-2026-10-16.md) adds 176 historical item records and 489 reads. It also exposed an omission in the summary: final items were not counted when raw scans existed. The current summary now provides separate `itemRecords` evidence, making inferred final values visible without adding them to raw-pass counts.

Both scanner pages now offer **Labels needing review → Export Stat Evidence**. It summarises the current tab, saved crafting history and owned artifacts from the app's own IndexedDB. Saved and current logs are combined without counting identical saved scans twice. The audit uses read-only inventory transactions, creates no database, and exports no profile/item IDs, artwork or unrelated settings. It produces a local diagnostic summary, not a full backup or a global catalogue update.

Both scanner pages also offer **Export Full Item Log** beside the clear-log button. This downloads the collector's complete `items`, `scans` and `labels` in the existing version-2 `unverified-artifact-perk-observations` format, named `artifact-perk-observations-YYYY-MM-DD.json`. It preserves whole encounters, duplicate rows, signed values, Hall/category, unlock and tier/level evidence, correction/inference flags, raw OCR passes and recorded read metadata. The Crafting Scanner includes history restored from its saved log; the Storage Scanner exports its current tab's item/read log. It does not clear either log. The separate stat-evidence export remains a summary; the full item log is the useful file for inspecting complete artifact encounters.

## Verification

- Node checks cover fixed signs, aliases/qualifiers, Hall/category disagreement, fresh versus upgraded values, stored colour exclusion, special-item scope, candidate ambiguity, raw-value preservation, missing metadata, synchronized generated files and read-only browser access.
- Real browser checks exercise the export control on both scanner pages with seeded localStorage and IndexedDB, and verify neither is changed. These use isolated test profiles, not the user's current browser data.
- The [34-frame production-controller check](scanner-video-stat-context-after.json) retains the previous results: crafting 23/24 direct complete stat sets, 9/24 row-reader-valid, and zero valid incorrect stat sets; storage 10/10 direct complete stat sets and 9/10 all labelled visible fields. Every result has per-row context attached. This is development evidence, not an additional OCR accuracy gain or held-out evaluation.
- The existing screenshot/scale audit passes all 66 cases (22 source screenshots at three scales): every stat set is complete and direct, 65 are confirmed and none is confidently incorrect. Parser, controller, stored-item, catalogue, comparison and video-evidence checks also pass. No external requests or browser errors occur in either export check or the screenshot audit.

```powershell
node scripts/build_artifact_stat_context.js --check
node scripts/build_artifact_stat_context.js --check '--observations=C:\Users\edwar\Downloads\artifact-perk-observations-2026-10-14.json' --report=reports/scanner-stat-context-audit-2026-10-16.json
node scripts/test_artifact_stat_context.js
node scripts/run_scanner_ocr_fixture.js --stat-context --summary
node scripts/run_scanner_ocr_fixture.js --storage --stat-context --summary
node scripts/run_scanner_ocr_fixture.js --crafting-audit --summary
```

Regenerate the database with `node scripts/build_artifact_stat_context.js` after changing its reviewed sources. The canonical JSON, browser JSON and browser script are checked for exact synchronization. New observation exports remain audit input until their facts are reviewed.
