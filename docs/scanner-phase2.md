# Artifact scanner capture prototype

Authority: `Untitled-1.md` and the user's approval of Phase 2.
Ownership: Scanner capture/calibration only; ratings, game state, and production hosting remain unchanged.
Invariants: User-authorised video capture, no audio, no recording, no image uploads or persistence.
History: No real game screenshots were provided during Phase 2. Automatic panel anchors remain unverified.

Historical Phase 2 record: subsequent screenshot-backed recognition is now implemented. See `scanner-recognition.md` for current behavior and evidence; the limitations below describe the earlier capture-only milestone.

Open `scanner.html` through the existing local HTTP server. Use Connect Game to choose a source in the browser picker. Select Region and drag around the full artifact panel, or enter percentages in the expandable region controls. The crop retains native source resolution; its on-page display scales to fit.

Stop Scanning stops every stream track, clears previews, and discards calibration. Browser-ended sharing performs the same cleanup. A late permission or image-decode result cannot restart a stopped session. Local PNG/JPEG/WebP screenshots can exercise calibration without sharing a screen and never leave browser memory.

## Current limits

- This phase does not perform OCR, artifact recognition, or rating calculations.
- Region selection is manual until real screenshots establish reliable panel anchors.
- Source-resolution changes invalidate calibration. Moving/resizing the game panel within a source of unchanged dimensions cannot yet be detected. Reselect the region in that case.
- Native crop size and readability are shown for inspection; there is no calibrated OCR quality threshold yet.
- Video timeline progress and recent sampling do not prove that source pixels are current. Capture may present stale pixels without a mute event.
- Hidden, suspended, occluded, and minimized pages/sources require real browser/OS testing. A visible planner window is the recommended first arrangement.
- The capture picker cannot be dismissed programmatically. Stop during a pending picker discards/stops any stream returned later.
- Game terms remain unresolved as documented in Phase 1. No production deployment has been performed.

## Verification

Run `node scripts/test_scanner_capture.js`, `node scripts/test_perk_groups.js`, and `node scripts/test_army_catalog.js` from the repository root. Lifecycle tests use mocks and do not establish actual browser permission behavior, capture performance, or game recognition accuracy.

Before accepting live capture, manually check Chrome/Edge on the intended game platform:

1. Connect a window, tab, and screen where available; decline permission and retry.
2. Select a region by dragging in either direction and by keyboard-accessible percentage inputs. Check the native crop against the original source.
3. Resize the capture source; verify calibration clears. Move the panel without changing source size; reselect manually.
4. Stop from the planner and from browser sharing controls; verify blank previews and ended tracks.
5. Stop while the permission picker or local image load is pending; verify no late restart.
6. Minimize/restore the shared source and observe interruption or stale-source behavior.
7. Keep the planner visible but unfocused, then hidden for over five minutes, occluded, minimized, and resumed. Record sample gaps, preview delays, and any frozen frames.
8. Load local screenshots at different sizes and reopen/stop repeatedly. Inspect memory for retained streams or images.
9. Inspect network requests: no captured pixels or recognition content should be transmitted.

Real screenshots are needed for the remaining Phase 2 panel detector and subsequent Phase 3 OCR. Keep fixtures outside `ui/` so they are excluded from the public static site.
