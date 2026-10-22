# Crafted item log statistics

Statistics expand **Crafted item log → Observed stats** in the existing Crafting Scanner. There is no separate history store or workflow. Every canonical logged item participates automatically; no session start, finish, per-item confirmation or keep/reject tagging is required. The only item action remains **Keep**, which adds it to Collection. Not collected does not mean rejected.

The collector remains authoritative for encounter identity, duplicate prevention, strongest OCR candidates, corrections, artwork, persistence, exports and clearing. Statistics read a lightweight projection of those same records and subscribe to log changes. They never write Collection, upload data, or request capture permissions. A retry updates the existing ID; independently encountered items with identical stats remain separate. Crafting logging and local saving are automatic, with no log/save checkboxes. Obsolete saving preferences are ignored. Existing exports, clearing and planner backups cover the data; storage failures remain visible.

**Crafted since last kept** counts new canonical log items since the last successful Keep action. Retries and corrections do not increment it; repeated Keep updates do not reset it again. It persists through reopening, exports and clearing detailed history. Legacy logs seed the count from their available item order.

**Scanner diagnostics** lists missing artifact names and unknown perk labels, linked to the existing log's name field. Resolving a name removes its review entry without creating an item or changing inventory. Future title reads retain rejected OCR text and confidence alongside the canonical item, and both full-log and evidence exports include the unresolved-name references. Older unnamed items appear automatically even when no title OCR evidence was saved. Separately opted-in remote evidence is described in [OCR feedback](ocr-feedback.md); the release gate remains off.

New log metadata includes capture session ID, live/image/unknown capture source and unknown crafting event ID/source. Existing records remain readable and their capture source stays unknown. Game version is not collected. Event identification is deferred to a local dataset; there are no event or game-version inputs.

The default evidence filter uses the best available complete canonical names/values, including inferred readings. Direct/corrected evidence is an optional stricter filter. Incomplete and conflicting results remain in the log and are counted separately. Perk positions and repeated perk rows are preserved; item frequency counts a perk once per item, while row/value distributions retain duplicates.

The perk/value threshold estimator counts matching eligible items directly and displays a 95% Wilson interval. Zero observed matches do not establish impossibility. Future-craft projections use `1 - (1 - p)^n`, require a sample consisting entirely of live capture in one hall/category/event context, and assume independent crafts under the same conditions. Unknown event context remains unknown. These are estimates from OCR log records; the scanner cannot establish that every encounter was newly crafted or that no crafts were missed. Public/community probability reporting is deferred.

Validation:

- `node scripts/test_crafted_log_stats.cjs`
- `node scripts/test_scanner_collection.js`
- `node scripts/test_scanner_reading.js`
- `node scripts/run_scanner_ocr_fixture.js --crafting-stats --summary --report`
- `node scripts/run_scanner_ocr_fixture.js --crafting-stats --summary --report --viewport=390x844`

The browser check exercises real OCR, automatic logging and retries, source metadata, corrections, Keep status and restoration through the existing saved log. Preview files are written to `data/temp/crafted-log-stats-previews/`.
