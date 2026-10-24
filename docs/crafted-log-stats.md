# Crafted item log statistics

V2 account-history reconciliation and separately opted-in aggregate reporting are described in [crafting statistics v2](crafting-statistics-v2.md). Live research remains disabled pending acceptance; the local observed-statistics workflow below remains unchanged.

**Crafting Stats** contains personal observations, community observations, the crafted item log and scanner diagnostics. The Crafting Scanner retains its seven headline totals and a Crafting Stats link. Both pages use the same canonical saved log; there is no separate history store. Every canonical logged item participates automatically, and Keep adds an item to Collection. Not collected does not mean rejected.

The collector remains authoritative for encounter identity, duplicate prevention, strongest OCR candidates, corrections, artwork, persistence, exports and clearing. Statistics read a lightweight projection of those same records and subscribe to log changes. They never write Collection, upload data, or request capture permissions. A retry updates the existing ID; independently encountered items with identical stats remain separate. Crafting logging and local saving are automatic, with no log/save checkboxes. Obsolete saving preferences are ignored. Existing exports, clearing and planner backups cover the data; storage failures remain visible.

**Crafted since last kept** counts new canonical log items since the last successful Keep action. Retries and corrections do not increment it; repeated Keep updates do not reset it again. It persists through reopening, exports and clearing detailed history. Legacy logs seed the count from their available item order.

**Scanner diagnostics** lists missing artifact names and unknown perk labels, linked to the existing log's name field. Resolving a name removes its review entry without creating an item or changing inventory. Future title reads retain rejected OCR text and confidence alongside the canonical item, and both full-log and evidence exports include the unresolved-name references. Older unnamed items appear automatically even when no title OCR evidence was saved. Separately opted-in remote evidence is described in [OCR feedback](ocr-feedback.md); the release gate remains off.

New log metadata includes capture session ID, live/image/unknown capture source and unknown crafting event ID/source. Existing records remain readable and their capture source stays unknown. Game-version identification is permanently outside scope. Event identification is deferred to a local dataset; there are no required event or session inputs.

Eligibility is fixed in the page: complete records after inference count, including image captures and records with unknown source. Records still missing a recognized stat or percentage are excluded. Any manually entered stat name/value or manually corrected stat record excludes the whole artifact. Artifact-title changes alone do not exclude it. Source and Evidence controls are removed. Hall, category and position remain user filters.

Personal and Community are two views of one page, selected by a top-level toggle. Both show the same headline dashboard and perk columns: Perk, Rating, Items, Item frequency, Rows, three tier frequencies and Copies per artifact. Main tier headers are 1%, 6%, 11%; War headers are 1%, 3%, 6%. Each tier cell contains only its row frequency, including 0% for unobserved tiers. Negative perks use magnitude. Main is the initial Hall selection. All halls uses Low/Mid/High headers and normalizes each row against its own hall before aggregation, so Main 6% is mid while War 6% is high. The three tier columns support header sorting. Counts and raw signed values remain in the data for analysis. A shared Collection Target filter narrows perk rows using saved target membership, including linked stat sources and exclusions. Ratings use the existing shared profile values and target axis mapping, with factory inheritance. Click Rating to sort by importance; search and other sortable headers retain their behavior.

The top dashboard shows exact counts and frequencies for zero through five top-value rolls. Main uses magnitude 11; War uses magnitude 6 and never enters the Main denominator. Each perk row contains exact two-, three-, four- and five-copy counts over the complete eligible-artifact sample. Repetition always uses all positions. The previous cumulative frequency column and largest-group table are removed.

The UI no longer includes the separate threshold estimator or redundant selected-perk value table. The pure analysis helper retains its threshold/projection API for compatibility; these estimates are not presented as established game probabilities.

Validation:

- `node scripts/test_crafted_log_stats.cjs`
- `node scripts/test_crafting_stats_page.cjs`
- `node scripts/test_crafting_v2_database.cjs`
- `node scripts/test_scanner_collection.js`
- `node scripts/test_scanner_reading.js`
- `node scripts/run_scanner_ocr_fixture.js --crafting-stats --summary --report`
- `node scripts/run_scanner_ocr_fixture.js --crafting-stats --summary --report --viewport=390x844`

The browser check exercises real OCR, automatic logging and retries, source metadata, corrections, Keep status and restoration through the existing saved log. Preview files are written to `data/temp/crafted-log-stats-previews/`.
