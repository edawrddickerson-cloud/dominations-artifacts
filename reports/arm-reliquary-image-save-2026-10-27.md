# Arm Reliquary personal image persistence

The user confirmed that the new scan's artwork appears in Storage Scanner's preview but is missing in Collection. The saved account workspace contains no Arm Reliquary scan record. The controller previously marked a matching catalog title Collected before full stat validation, while saving the artwork only as part of a complete stat snapshot. An incomplete scan could therefore produce a collected catalog row with no personal image. With the old catalog images removed, this row displays a placeholder.

Storage Scanner now persists the current uniquely matched Legendary/Mythical crop independently of stat completeness. Image-only records are stored in profile-scoped IndexedDB records and do not create or modify scanned stats. Collection reads these images before its saved scan/shared-reference/catalog fallbacks. Removing an artifact removes its personal crop; a later scan can save it again. Local backups validate and round-trip these records. Cloud planner serialization excludes them; same-account reconciliation retains them for existing profiles and account changes do not transfer them.

The public artifact image map remains the same 18 verified game captures. This fix does not publish Arm Reliquary's image, restore old wiki mappings, change user stats, or write to the user's cloud workspace.

Passed checks:

- Real scanner/catalog browser fixture: 26 checks, including Arm Reliquary preview crop with incomplete stats, unchanged stat records, Collection rendering/reload, backup inclusion, profile isolation, deletion and rescan. Zero external requests or browser errors.
- Linked-artifact browser fixture: 23 checks; zero external requests or browser errors.
- Local backup JSON validation and round trip, stored-artifact merge, storage inference, backend serialization, metadata reads, cloud-choice concurrency, local artwork recovery, artwork assets and design ownership checks.
- JavaScript syntax checks for the scanner controller, Collection and shared persistence.

The existing passive-scanner browser fixture times out at its six-row fixture (`Read all 5 stats`). It fails identically when the new image-saving hook is disabled in the served JavaScript; that comparison does not modify workspace files. The image-only and linked-artifact fixtures pass.

No deployment was performed. After this fix is deployed, a new read of Arm Reliquary can save its image without deleting the artifact or waiting for all six stats to be complete.
