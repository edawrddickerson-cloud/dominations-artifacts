# Profile 3 game artwork

Replaced the catalog images for all 18 War Mythicals with captures in the supplied `dominations-backup-2026-10-27T19-18-14-632Z.json`. This includes all six recently added Mythicals and replaces twelve existing image mappings. The backup SHA-256 is `50169a9160156313b70ab8e631758153b4349ede7e3b9791294f1b4b53b32c5b`.

The files under `ui/assets/artifact-scans/` retain the exact original image bytes (168,838 bytes total), without cropping, re-encoding or generated artwork. Only the selected profile's War Mythical collection images were imported. The backup, settings, account identifiers, other profiles and inventory records were not copied into public assets or changed in the account.

`data/raw/user_verified_artifact_images.json` is the durable source manifest. Following the user's instruction to remove all old Legendary and Mythical images, its 18 checksummed entries are now the sole contents of the artifact image map. The artifact refresh no longer queries Fandom, and both refresh and import discard old mappings. The canonical and served maps agree. The normal canonical builder preserves them by copying the raw map, and the site builder versions the local image URLs for deployment.

Import command:

```powershell
python scripts/artifact_scan_images.py "PATH-TO-BACKUP.json" --profile "Profile 3"
```

Five items in the profile's War layout have no scanned image in the supplied backup. Their old mappings have been removed along with all other old Legendary/Mythical image mappings:

- Arm Reliquary of Charlemagne
- Da Vinci's Flying Machine
- Gemini 8 Helmet
- Supermarine Spitfire Engine
- T-34 Tank Engine

Validation passed:

- `python scripts/test_artifact_scan_images.py`: selected-profile isolation, byte preservation, no settings import, idempotence, legacy-image removal during import/refresh, no wiki requests for artifacts, checksum drift and wrong-edition rejection.
- All 18 imported files decoded in an isolated browser; reviewed the labelled contact sheet at `data/temp/profile3-artwork-contact.png`.
- Real Rankings and Collection pages rendered and decoded all 18 mapped images (36 checks), with external services blocked and isolated ownership fixtures.
- `node scripts/test_site_build.cjs`, `node scripts/test_verified_artifacts.cjs` and `node scripts/check_design_system.cjs` passed.
- Built the site to `data/temp/profile3-image-release`; verified all 18 built mappings resolve to release assets byte-identical to the backup. The canonical, served and current release maps contain exactly those 18 entries. Army and council images are unchanged.

The initial wiki-image repair in this conversation was undone before this import. No publication, deployment or cloud workspace write was performed.
