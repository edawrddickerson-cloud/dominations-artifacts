# Shared artifact artwork

The planner matches artwork locally against 153 approved display images and 307 reviewed capture examples. It syncs only the selected `artworkId`. Approved images take priority in the scanner, Collection, scanned inventory and crafting history. Unmatched items use their local captured image; items without either image use a placeholder.

There is no user image upload endpoint, image bucket, server matching call or automatic reference contribution. Visual matching does not read item names and does not establish physical identity, ownership or stats. Reference approval is by the site maintainer, not the game publisher.

## Matching and storage

`ui/artwork-matcher.js` compares compact spatial colour and normalized luminance descriptors. Each approved example has a conservative acceptance radius bounded by its nearest competing artwork. The best identity must also beat the next identity by a minimum margin. Multiple examples of one identity do not compete with one another. No model or paid inference service is used.

`ui/artwork.js` loads the published descriptors, computes query descriptors in the browser and resolves approved asset URLs. It never submits captures or query descriptors. Approved asset failures fall back locally and retry after reconnect. Existing local artwork and full local backups remain intact.

`ui/stored-artifacts.js` backfills the active profile and scanned inventory in the background. Writes recheck the originating profile, account, item existence and unchanged capture before adding an ID. `ui/scanner-collection.js` updates the same canonical log records, preserving encounter IDs and statistics. Unknown captures remain local and can be retried with a future catalog release.

The public catalog is `ui/data/artwork_catalog.json`; `ui/data/artwork_ids.js` contains its valid IDs. Shared JPEG assets are under `ui/assets/artwork/`. These files contain no export filenames, account IDs, OCR labels or capture provenance. Initial display assets total 1,069,862 bytes; descriptors are approximately 1.7 MB before delivery compression.

## Account compatibility

Workspace serialization includes `artworkSchema: 1` and approved artwork IDs. History serialization projects those IDs without images or matching diagnostics. The additive migration `202610240007_shared_artwork.sql` installs a read-only approved-ID registry and workspace validation trigger. It rejects unknown IDs, embedded images, raw captures and artwork descriptors, including nested records.

Once an account saves the new artwork schema, an older client cannot overwrite it without the schema marker. That client must reload the planner. Existing records with no artwork ID remain readable, and accounts that have not adopted the schema retain legacy write compatibility.

On a fresh device, matched items display shared images from synced IDs. Unmatched images are unavailable there unless that browser has its own capture or imports a local backup. No name-based substitution fills that gap.

## Reference maintenance

1. Run `node scripts/review_artwork_catalog.cjs FILE...` against owner-selected backups or scanner exports. The tool writes private candidates and contact sheets under ignored `data/temp/artwork-review/` and leaves source files unchanged.
2. Visually inspect candidates and prepare `approved.json` there with `reviewed: true` and `groups` of candidate numbers. The first candidate of each group supplies its preferred display image; group members must depict the same intended artwork. Exclude unrelated, obscured or personal material. Names are review aids only.
3. Run `node scripts/build_artwork_catalog.cjs`, then `node scripts/test_artwork.js` and `node scripts/test_artwork_browser.cjs`. Query images and captions stay local to the tooling. Matching references are calibrated against competing approved examples.
4. For later catalog changes, preserve existing IDs and assets and create an additive registry migration for new IDs. The initial generator, `scripts/generate_artwork_registry.cjs`, describes the initial migration only; do not rewrite an applied migration to update production. Update asset versions and rerun validation before publishing.

The initial build used 316 unique candidate captures from the owner's October 21 backup and October 22 scanner export. Visual review excluded nine dark, obscured or dialog-covered captures. All 307 approved examples are reference data in the released catalog.

## Validation and limits

The browser regression checks approved-image priority, local fallback, asset-load recovery, ID-only restore, invalid references, preservation of separate physical copies, delayed deletion and profile-switch races, and absence of uploads. It tests all 153 display assets and compression, scaling and crop shifts for a subset. The initial run accepted 144 display assets; nine stayed unknown or ambiguous. Of 81 synthetic variations, 54 matched their expected identity and 27 stayed unknown. No wrong identity was accepted in that run. See `reports/artwork-browser.json` for current measurements.

These are regression checks against reviewed reference material and synthetic variants, not an independent live-game accuracy estimate. An early sparse-reference trial showed poor coverage across layout and colour changes; it informed conservative rejection and additional reviewed reference examples. Real captures can remain unmatched, especially at unfamiliar layouts or resolutions. Local fallback is the intended outcome in that case.

Pure tests also remove each query's identity while retaining calibrated competitor limits and verify rejection for all 307 reference descriptors. This is a known-reference exclusion check, not proof of rejection for arbitrary unseen content. Blank and notification-like synthetic images are tested separately. Content safety comes from serving approved assets and never receiving user pixels, rather than treating visual similarity as an illegal-content detector. OCR text services retain their separate privacy contracts.

Scanner recognition, reading, comparison, Keep on desktop and mobile, storage saving, history statistics, backend synchronization and database isolation regressions passed. The old `--inventory` fixture times out at its nested same-URL iframe on both the unchanged baseline and this branch; its later card-editor assertions also predate the current table layout. Direct browser checks exercise approved and local artwork in the current Collection list instead. Live gameplay accuracy at other resolutions remains unmeasured.

## Release and rollback

Run the existing verified database backup and local restore drill before the additive migration. `scripts/deploy_shared_artwork.cjs --apply --backup=PATH/manifest.json` verifies the backup, rehearses the DDL transactionally, applies it with bounded locks, and checks that existing account rows remain unchanged. Publish assets, registry and client changes in that order. The user authorized release on October 24.

The initial registry and validation trigger were applied on October 24 at 16:09 UTC following a verified 49-table backup and local restore drill. Transactional rehearsal passed and existing account rows were unchanged. The registry contains 153 approved IDs, denies direct user writes and has row security enabled. `scripts/check_artwork_release.cjs --commit=HASH` verifies deployed frontend files and image checksums, registry agreement and denial of anonymous workspace access.

Disable `artworkMatchingEnabled` to stop new matching and backfill while retaining rendering of existing IDs. Keep referenced approved assets and the registry. Roll back to a client that understands artwork IDs; an older client intentionally fails the schema guard rather than silently removing references. Removing database objects or existing captures requires a separate recovery decision.
