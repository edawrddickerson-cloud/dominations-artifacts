# Shared artifact artwork matching plan

Date: 2026-10-24

## Image recovery correction — 25 October 2026

An explicit first account link now preserves local captures when the selected account contains the same record/item identity. Choosing a different previously bound account does not carry its predecessor's images. Same-account application and startup can restore missing pixels from account-scoped local safety snapshots. Recovery fills only missing valid captures; it never replaces current captures, stats, ownership, settings, deleted items or another profile's same-named item.

Collection has **Recover images**, accepting a full planner backup. It imports only matching missing image pixels for already-existing records. This is distinct from replacing planner data with Import Backup. Recovery uses stable record/item IDs, not names or equal perk rows. Source images remain local and the existing cloud sanitizer continues excluding pixels. `DNStoredArtifacts.recoverArtwork` updates only the image field in a guarded transaction, so a stale read cannot overwrite concurrent stat edits or recreate a deleted item.

The live approved-ID registry and static assets remain the source for shared fallbacks. Historical backup captures can be matched locally against that reviewed catalog; only confidently matched approved IDs may be attached to existing account records. Ambiguous captures are retained for local recovery and never assigned a guessed shared image.

`202610250007_workspace_read_serialization.sql` preserves the existing invoker/RLS read contract while constructing the response directly, avoiding repeated whole-document serialization on large histories. Its deployment rehearses response parity and account isolation and changes no account data or execute grants.

Focused checks: `test_local_artwork_recovery.cjs`, `test_collection_image_recovery.cjs`, `test_cloud_choice_concurrency.cjs`, `run_backend_browser.js --summary`, `test_backend_database.cjs`, and the existing artwork/browser release checks.

Status: Implemented. See [Shared artifact artwork](shared-artwork.md) for implementation, release checks, maintenance and validation results. The October 24 user correction supersedes the original display-priority requirement: always preserve and show the player's local capture first; shared artwork is a fallback for a missing or unloadable capture.

The planner will match captured artifact artwork against an owner-maintained collection of approved game images entirely in the browser. Saved items will sync an approved artwork ID and display that reference image on every device. User captures, fingerprints and image embeddings will remain on the device.

This replaces per-user cloud image sync. It requires a reference collection, but does not require recognizing or maintaining artifact names for visual matching. The initial collection will come from the site owner's existing captures and exports; approval means reviewed by the site owner, not supplied or endorsed by the game publisher.

## User experience

Scanning, editing, Keep and Collection import retain their existing behaviour. Artwork matching runs separately and never prevents saving an item's stats.

When a capture has a confident, unambiguous visual match, the planner shows the approved reference image and saves its artwork ID with the item. Another device obtains that ID through existing account sync and downloads the reference image as needed. Separate physical items may share an artwork ID while retaining different item IDs, stats, ownership and slots.

An unmatched or ambiguous capture receives no artwork ID. The scanner, Collection, staged inventory and history use the user's locally captured image when available. Show a category placeholder only when neither an approved image nor a local capture is available. Matching retries when a stronger crop or a newer reference catalog becomes available. Unknown artwork does not trigger an upload, a contribution prompt or a manual review queue on the server.

Display priority is the player's local captured image, then approved artwork, then an existing catalog image, then category placeholder. A successful match stores an artwork ID alongside the preserved local capture and continues to display the capture. Shared artwork supplies the image on another browser without the capture, or when the capture cannot load.

Local fallback images remain specific to the browser holding them. Another device can show the approved image from a synced artwork ID, but an unmatched item has no image there unless that browser already has a capture or obtains one through scanning or an explicit local backup import.

UI changes use concise labels, statuses and necessary actions. Matching algorithms, distance values and catalog versions belong in local diagnostics, not ordinary item cards.

## Data boundaries

| Data | Location | Account sync |
| --- | --- | --- |
| Approved display images | Site assets or controlled object storage | Shared asset delivery |
| Approved matching examples and descriptors | Published catalog, cached in browser | Shared asset delivery |
| Catalog version and valid artwork IDs | Published manifest and server validation registry | Reference data |
| Item artwork ID | Existing Collection, inventory and history records | Yes |
| Captured artwork and intermediate canvases | Browser only | No |
| User capture fingerprints and match diagnostics | Browser only | No |

Do not introduce image upload endpoints, temporary transfer buckets, server matching requests or user-supplied image URLs. Existing full local backups may continue to contain captured images. Add artwork IDs to those backups without removing existing images.

This boundary addresses captured image content. Existing OCR text feedback and structured text synchronization have separate privacy contracts; this work must not expand either contract or claim to eliminate personal information from those channels.

## Existing evidence and initial uncertainty

The October 21 exported backup contained 61 owned-item images totalling 433,004 bytes. The October 22 log export contained 255 images totalling 2,343,175 bytes; 116 entries lacked names. This supports visual matching without a name dependency and confirms that repeated history captures need not become separate shared assets.

Across the reviewed exports, grouping named items by normalized name, hall and category produced 108 groups. Selecting the smallest image in each group would total about 854 KB. This is only a sizing estimate: OCR errors split some groups, unnamed images are excluded, and different artwork variants require visual review. Different JPEG bytes do not establish different artwork.

The existing `ui/data/artifact_images.json` is an ID-to-image map for catalog artifacts, largely using external image URLs. It is not yet a reviewed visual matching dataset for ordinary crafted items. Reuse suitable approved assets where possible, but publish controlled image files for the new matching collection so browser pixel access and availability do not depend on third-party image hosts.

## Phase 1 Build the approved reference collection

Create a local extraction tool for the owner's selected backups and scanner exports. It must leave source files unchanged and produce a contact sheet plus candidate image files for review. No candidate becomes public automatically.

Review and group candidates by visual artwork. Names may help the owner inspect the candidates, but must not determine automatic matches. Exclude personal information, clipped art, unrelated content and unusable crops. Inspect whether animations, backgrounds, stars, hall banners or tier effects alter the artwork crop enough to require more than one matching example.

Assign each approved visual identity a stable opaque ID, such as `art-000001`. Each identity has one preferred display image and may have several approved matching examples. Identical artwork can serve multiple artifact identities; distinct visual variants receive separate artwork IDs when needed. Do not derive physical item identity or ownership from this ID.

Prepare normalized, metadata-free raster assets, descriptors, a versioned manifest and integrity checksums. Keep source exports and private review notes outside public assets. The manifest contains only approved asset paths, descriptor versions and optional known context such as hall or category. Never publish original logs, account IDs or source filenames containing personal details.

Only the maintainer's existing repository or administrative publication workflow can change this collection. Users can select existing artwork IDs through their data, but cannot create new reference assets.

## Phase 2 Prove visual matching locally

Implement a standalone trial before integrating matching into saving or sync. Begin with inexpensive perceptual hashes and compare them with a second visual measure, such as normalized image structure or colour. A shared card background must not dominate the decision. If these measures cannot separate the artwork reliably, report the result before considering a browser model or a larger dependency.

Use deterministic crop normalization and version the preprocessing with the descriptors. Test standard crop alignment and a small bounded set of alternate alignments if necessary. Do not use artifact titles, perk combinations or account data as hidden matching shortcuts. Known hall and category may narrow candidates when reliable; visual matching must still function when the title is absent.

Accept a match only when its distance passes a calibrated limit and it is sufficiently separated from the next distinct artwork ID. Multiple examples for one identity must not count as competing identities. Repeated evidence may stabilize an encounter, but repeated identical frames do not establish independent accuracy.

Separate reference images, threshold tuning data and held-out evaluation captures. Split by capture encounter or session so copies of the same frame do not inflate accuracy. Include:

- Genuine captures across supported crafting and storage layouts, resolutions, scaling, compression, animation and background variation.
- Similar-looking artifacts and distinct artwork variants.
- Artifacts deliberately omitted from the reference collection, proving that unknowns remain unknown.
- Benign non-game images, blank crops, notifications, partial crops and altered artwork as rejection tests. Do not collect illegal material for testing.

Report correct matches, wrong accepted matches, ambiguous results and unmatched results separately, with actual sample counts. Measure reference coverage separately from matching accuracy. A distance threshold is not a probability or a percentage guarantee of safety.

The trial passes only with zero wrong accepted matches in the held-out acceptance set and explicit reporting of its size and limits. Set a useful coverage target after the baseline shows what the collection contains; do not loosen rejection thresholds solely to improve coverage. Measure cold initialization, warm matching time, memory and asset transfer size. Target warm matching below 150 ms on this laptop as an initial performance goal, subject to measurement on a slower supported device.

Deliver the trial report, reviewed manifest and recommended thresholds before proceeding to production integration. A failed trial leaves ordinary local scanning unchanged.

## Phase 3 Add local matching to the scanner

Add a dedicated browser matching module and a catalog loader. Load compact descriptors first and fetch display images only when needed. Use same-origin assets or correctly configured controlled delivery, with versioned caching. Run matching outside the OCR critical path, preferably in a worker if measured processing warrants it.

Reuse the established artwork crop from Crafting and Storage Scanner. Bind work to the originating profile, capture session and encounter, rejecting stale results after navigation, editing, Stop or an item transition. Do not let weaker retries erase a stable accepted match within an unchanged encounter; invalidate it when the artwork materially changes or contradictory evidence appears.

Persist the selected `artworkId` on the canonical record and carry it through Keep, inventory transfer and Collection updates. Store matcher version, distances and candidate IDs locally only when diagnostics need them. For history, artwork updates must use the existing canonical log update and reconciliation path, without inventing encounters or changing statistics.

Display approved reference images for matched records even when a local capture exists. Preserve existing local captures and backup behaviour during rollout; any later cleanup of user captures is a separate decision.

## Phase 4 Sync approved artwork IDs

Extend `ui/integration-core.js` and `ui/crafting-history.js` to serialize the optional `artworkId`. Update the workspace and crafting-history validators together, retaining all existing exclusions for images, raw OCR, diagnostics and credentials.

Add backend validation against a small approved artwork ID registry. A bounded string format alone is insufficient: no arbitrary URLs, data URLs or unknown IDs may become remote artwork references. The registry is maintained only through the administrative catalog publication process. Client matching is not trusted proof that the selected image corresponds to the item; the server's guarantee is that every accepted ID resolves to an approved image.

Publish the registry and assets before clients can submit their IDs. New clients must accept older records with no ID. Check old-client read and save behaviour before rollout; if old clients would discard IDs, implement a compatible version strategy rather than silently losing them. Preserve existing conflict detection and recovery snapshots.

Use stable IDs and versioned image paths. Retain retired IDs as aliases or resolvable entries when artwork is replaced. Unknown or temporarily unavailable references fall back to the local captured image, then a category placeholder, without blocking account sync or corrupting item data. Client catalog updates must recover missing assets without requiring the user to scan again.

## Phase 5 Render and migrate existing items

Create one shared resolver across the scanner, Collection, staged inventory and crafting history. Resolve the player's local captured image first, then an approved artwork ID; retain existing Legendary/Mythical catalog images as further fallbacks where already available. Use a category placeholder when none can load. An invalid or unavailable ID must never become a user-controlled remote image URL. Local captured images retain the existing local image validation and never enter cloud serialization.

Run local backfill against existing captured images in small batches after the catalog is available. Save only confident results, preserve item IDs and local images, and use ordinary account sync to publish the new artwork IDs. Check the current record before each write so a delayed backfill cannot overwrite newer edits, resurrect deleted items or cross account boundaries.

A fresh device can render existing synced artwork IDs immediately. An older cloud record with neither an ID nor a locally available capture cannot be visually backfilled there; it needs a device holding the capture or a future scan. Do not silently substitute name matching to conceal that limitation.

## Validation and release gates

| Area | Required evidence |
| --- | --- |
| Matching | Held-out report with correct, incorrect, ambiguous and unknown counts; similar-artifact and missing-reference cases |
| Privacy | Network checks confirm that captures, user descriptors and diagnostics never leave the browser through this feature |
| Sync validation | Approved IDs round-trip; unknown IDs and image payloads are rejected; older records remain readable |
| Scanner lifecycle | Stale results cannot change a later artifact, another profile or a stopped session |
| Item identity | Shared artwork never merges physical copies, changes ownership or modifies stats and slots |
| Migration | Backfill is resumable and preserves edits, local images, backups, history counts and deletions |
| Rendering | Checks verify local-capture priority even for matched items, shared fallback when local images are missing or broken, placeholders only when no image loads, recovery after image failure, and fresh-device behaviour across scanner, Collection, inventory and history |
| Performance | Matching and catalog loading do not delay OCR, Keep, editing or account recovery |

Extend the existing scanner collection, stored-artifact, history, workspace and backend checks where their contracts change. Run the existing focused scanner recognition, reading and capture checks plus browser fixtures for Keep, storage saving and log rendering. Test a fresh browser restoring account data and displaying reference artwork without importing any captured image.

Release behind a feature flag after local acceptance. Publish approved assets and backend validation first, then the browser feature. Perform a real-game check before broad enablement. Implementation does not authorize production deployment or publication by itself.

Rollback disables new matching and keeps local captured images first, then approved shared images, then category placeholders. Keep stored artwork IDs and existing local captures intact; do not remove approved assets still referenced by accounts.

## Definition of done

A supported capture can acquire an approved artwork ID without reading its title. That ID survives Keep, Collection transfer, history reconciliation, backup and account restore. A fresh browser displays the approved image using only structured account data and shared assets. Every item prefers its preserved local captured image, including after matching. Items without a local capture use shared artwork when available, and a category placeholder otherwise. No user-captured image or visual descriptor is uploaded, and the shared collection changes only through the maintainer's publication workflow.
