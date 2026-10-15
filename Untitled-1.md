# DomiNations Planner — Museum Artifact Auto Scanner
## Full Project Brief — Phase 1: Investigation and Architecture

### 1. Objective

Extend the existing DomiNations Planner website with an automatic museum artifact scanner.

The website is already live, working correctly and has an established perk-rating system. That rating system is the authoritative basis for assessing newly crafted artifacts.

The new feature should allow a user to share the browser tab, window or screen displaying their DomiNations game. The planner should recognise the currently visible museum artifact, extract its perks and values, and automatically calculate its rating using the existing scoring logic.

As the user moves between artifacts in the game, the rating should update automatically.

**The goal is to eliminate manual perk entry while keeping the existing application intact.**

This is an independent, passive, read-only visual analysis tool. It must never interact with or control the game.

### 2. Desired user experience

The ideal workflow:

1. User opens DomiNations.
2. User opens DomiNations Planner in another tab or window.
3. User opens the Artifact Scanner section.
4. User clicks **Connect Game**.
5. The browser presents its standard screen-sharing permission dialog.
6. The user chooses the game tab, window or screen.
7. The scanner finds the museum artifact currently displayed.
8. It recognises the perks and percentages.
9. It validates the extracted data.
10. It sends the recognised data through the existing rating system.
11. The planner displays the artifact's rating and relevant perk information.
12. When the player views another artifact, the rating updates automatically.

The user should not need to click Scan repeatedly, manually crop screenshots, or configure the scanner for every artifact.

A one-time calibration step per session is acceptable if necessary for reliable recognition.

The scanner should work while the user actively plays the game, ideally using a second monitor, split-screen arrangement or compact planner window.

### 3. Existing application protection — critical

The existing application is already live and working as intended.

Before doing anything, inspect:

- Repository structure and project instructions.
- Existing architecture and frameworks.
- Artifact and perk data models.
- Existing perk-rating methodology.
- Current UI patterns and components.
- Existing dependencies.
- Current testing infrastructure.
- Cloudflare Workers deployment configuration.
- Relevant source files and their authority/context headers.

**Do not refactor unrelated code.**

Additional constraints:

- Preserve existing functionality.
- Do not redesign existing screens.
- Do not replace the existing rating engine.
- Do not introduce competing rating calculations.
- Do not change established perk definitions or scores.
- Reuse existing code wherever practical.
- Avoid unnecessary architectural abstractions.
- Prefer simple solutions with clear ownership.
- Do not add paid dependencies or services without approval.
- Do not modify production configuration unnecessarily.
- Do not deploy anything without my approval.

Respect existing `AGENTS.md` instructions and file-level context headers.

For new or substantially edited files, include structured file-level headers documenting authority, ownership, invariants, constraints and relevant historical context. Preserve existing headers rather than replacing them indiscriminately.

### 4. Browser screen capture

Investigate using the standard browser Screen Capture API:

`navigator.mediaDevices.getDisplayMedia()`

The scanner should capture pixels from a user-authorised game tab, window or screen.

Requirements:

- Explicit user permission before screen capture.
- Never bypass browser permission dialogs.
- Prefer game-tab or game-window capture where supported.
- Support full-screen capture as an alternative.
- No audio recording.
- No persistent video recording.
- Capture individual frames for local analysis.
- Release resources when scanning stops.
- Handle permission rejection and sharing termination.
- Handle browser incompatibilities gracefully.
- Avoid capturing the planner itself where practical.
- Handle unavailable, frozen or interrupted capture streams.

The scanner must not require access to the game's DOM, private APIs, network traffic or internal memory.

Investigate whether supported browsers expose useful information about capture dimensions, frame resolution and capture state.

Do not assume browser background-tab throttling is harmless. Test whether continuous scanning remains reliable when the game is foregrounded and the planner runs in the background.

Determine whether a separate planner window offers a more reliable experience.

### 5. Cross-device and resolution-independent recognition

Users will have different:

- Monitor resolutions.
- Browser window sizes.
- Browser zoom levels.
- Operating-system scaling.
- Game display sizes.
- Screen aspect ratios.
- Browser versions.
- Potentially different game interfaces or platforms.

**The scanner must not depend on hardcoded screen coordinates.**

Investigate an approach that detects the artifact panel using stable visual features.

Possible anchors include:

- Artifact panel borders.
- Museum headings.
- Recognisable icons.
- Perk row layout.
- Artifact artwork.
- Text labels.
- Other consistent UI elements.

Do not assume these anchors exist until real screenshots have been inspected.

Proposed recognition pipeline:

1. Capture a frame.
2. Detect the game region if necessary.
3. Locate the artifact panel.
4. Determine the relevant crop.
5. Normalise scale and image quality.
6. Identify perk rows and other required fields.
7. Extract the visible information.
8. Validate the extracted data.
9. Calculate the rating.
10. Display the result.

Prefer relative coordinates within a recognised panel rather than absolute screen coordinates.

Provide a fallback that lets the user manually select the artifact region if automatic detection fails.

Investigate whether calibration can be remembered during the current session and invalidated when the game window or panel layout changes.

Normalisation cannot restore information that is genuinely unreadable. Detect and report insufficient image quality instead of guessing.

### 6. Artifact recognition

The recognition system should identify the exact information required by the existing rating engine.

Likely information includes:

- Artifact category or type.
- Perk names.
- Perk percentages or values.
- Any additional fields required by the existing application.

Determine the actual requirements by inspecting the existing data models.

Do not assume every artifact has the same structure.

Evaluate these techniques:

- Local OCR.
- Image preprocessing.
- Template matching.
- Layout-specific recognition.
- Known-label matching.
- Lightweight browser-based computer vision.

Prefer deterministic, locally executable solutions where possible.

Do not introduce cloud AI vision as the default approach.

Assess suitable libraries by recognition performance, bundle size, browser compatibility, CPU usage and maintenance burden.

Do not install multiple competing recognition libraries without justification.

### 7. Recognition validation

The existing application should provide authoritative knowledge of perk names and valid scoring inputs.

Use this knowledge to validate OCR output.

Validation should include, where applicable:

- Recognised perk name exists in the catalogue.
- Recognised artifact category is valid.
- Percentage format is correct.
- Values are consistent with game constraints.
- Required fields are present.
- The expected number of perk rows is recognised.
- No contradictions between recognised fields.

If a perk is recognised ambiguously, do not silently choose a different perk merely because it produces a valid result.

Represent uncertain fields explicitly.

Distinguish:

- Fully recognised artifact.
- Partially recognised artifact.
- Ambiguous recognition.
- No artifact visible.
- Unsupported layout.
- Insufficient capture quality.

Provide a manual correction route.

A displayed confidence value must be based on meaningful recognition evidence and calibration, not an invented percentage.

**An incorrect confident rating is worse than reporting that an artifact could not be recognised.**

### 8. Rating-system integration

The existing perk-rating system must remain authoritative.

Recognised artifacts should be transformed into the same internal data structure already used by manual entry.

The scanner should call the existing calculation logic.

Do not create a second implementation of the rating methodology.

Where existing rating calculations are coupled to UI components, identify the smallest safe change needed to make them reusable.

Test identical inputs through:

- Manual entry.
- Scanner recognition.

Both must produce exactly the same rating.

Do not change how ratings are calculated as part of this feature.

### 9. Continuous Auto Scan

Once screen sharing is active, the scanner should recognise changes in the artifact being displayed.

Avoid repeatedly running expensive OCR against an unchanged screen.

Investigate this processing model:

1. Capture at an appropriate interval.
2. Detect whether an artifact panel is present.
3. Compare relevant regions against previous frames.
4. If unchanged, avoid full recognition.
5. If changed, wait for animations or transitions to finish.
6. Confirm the panel is stable.
7. Run recognition and validation.
8. Calculate and display the rating.
9. Resume monitoring.

Ensure old recognition tasks cannot overwrite newer results.

Avoid processing overlapping frames unnecessarily.

Use suitable cancellation, request identifiers or equivalent mechanisms to prevent stale results.

If the displayed artifact changes but recognition has not completed, make it clear that the previous result is no longer confirmed to represent the current artifact.

Handle cases where:

- A user changes artifacts rapidly.
- The game panel closes.
- The game enters another menu.
- The game window is resized.
- The browser capture freezes.
- The user stops sharing.
- The planner is backgrounded.
- Recognition fails intermittently.

### 10. Performance requirements

The intended experience is to show a new rating approximately 1–2 seconds after the artifact becomes stable, where practical.

This is a target, not a hard guarantee.

Optimise for:

- Low CPU usage.
- Modest memory consumption.
- Minimal unnecessary OCR.
- Responsive interface.
- Fast detection of artifact changes.
- Proper resource cleanup.
- No growing memory usage over long sessions.

Investigate Web Workers for CPU-intensive recognition if appropriate.

Measure performance before introducing additional complexity.

Do not build a high-frequency video processing pipeline when periodic screenshot analysis is sufficient.

### 11. User interface

Add the scanner as a natural extension of the existing website.

Avoid redesigning unrelated components.

Core features:

- Connect Game.
- Stop Scanning.
- Current scanning status.
- Last successfully detected artifact.
- Recognised perks and values.
- Existing artifact rating.
- Recognition warnings.
- Retry Scan.
- Correct Recognition.

Support clear states:

- Disconnected.
- Waiting for browser permission.
- Connected.
- Looking for artifact.
- Reading artifact.
- Artifact recognised.
- Recognition uncertain.
- Capture interrupted.
- Capture ended.
- Unsupported browser.

The scanner should make it easy to understand whether its displayed rating is current.

Consider a compact display suitable for viewing beside the game.

A separate, small rating window may be useful but is not required for the first version.

Do not attempt to overlay controls inside the game or inject anything into the game's interface.

### 12. Privacy and security

The scanner should process captured images locally within the user's browser by default.

Requirements:

- Explicit permission before capture.
- No capturing without user authorisation.
- No audio capture.
- No persistent screen recording.
- No automatic uploading of screenshots.
- No server-side screenshot processing by default.
- No storing images in analytics or error reports.
- No accidental logging of screenshot contents.
- No third-party vision or telemetry service receiving frames without separate approval.
- Clear Stop Scanning control.
- Proper stream and processing cleanup.

Any future use of cloud-based vision must require a separate design review addressing privacy, costs, authentication, API keys and usage limits.

Cloudflare Web Analytics, if installed, must not receive captured image contents or sensitive scan data.

### 13. DomiNations Terms of Service and account safety

This is a critical project constraint.

The scanner is intended to be a passive visual calculator, not a bot, cheat, game modification or automation system.

Big Huge Games' terms raise potential concerns regarding automated extraction, gameplay automation, unauthorised software and reverse engineering.

The precise permissibility of continuous OCR is not established.

Do not assume that technical invisibility means contractual permission.

The implementation must:

- Analyse only pixels voluntarily shared by the user.
- Remain independent of the game client.
- Never automate gameplay.
- Never click or control the game.
- Never craft, upgrade, equip, sell or manipulate artifacts.
- Never read process memory.
- Never intercept network traffic.
- Never inspect private game APIs.
- Never inject scripts into the game.
- Never modify game files.
- Never bypass anti-cheat protections.
- Never attempt to conceal activity from security systems.
- Never harvest hidden game information.
- Never perform unattended bulk collection.
- Never associate extracted information with game account identifiers unless separately authorised and justified.

Only analyse the artifact the player has chosen to display.

The player must remain in control of every in-game action and decision.

Keep Auto Scan separable from the existing manual rating functionality, so it can be disabled independently if necessary.

Document the unresolved Terms of Service question.

Do not claim the feature is officially approved, affiliated with or endorsed by Big Huge Games.

Do not enable it in production until I explicitly approve deployment.

### 14. Testing and reliability

The eventual goal is at least 99% fully correct artifact recognition across a representative, manually verified test dataset for supported layouts.

This is an acceptance target, not an expectation for the first prototype.

Measure:

- Artifact panel detection accuracy.
- Perk recognition accuracy.
- Percentage recognition accuracy.
- Complete artifact recognition accuracy.
- False-positive ratings.
- Recognition latency.
- CPU and memory usage.
- Reliability across display configurations.

Create a local test harness capable of analysing saved screenshots without requiring an active game session.

Use real game screenshots as test fixtures wherever possible.

Ask me for screenshots if they are required.

Do not invent game UI details or fabricate recognition test results.

Include tests for invalid values, partially visible artifacts, transitions and ambiguous OCR.

Use the current rating engine in end-to-end tests.

### 15. Platform and hosting constraints

The existing website is deployed using Cloudflare Workers.

Preserve that deployment model.

Prefer client-side processing.

Do not create a backend service merely to process screenshots unless it is technically necessary and approved.

Avoid introducing new infrastructure, recurring costs or account requirements.

Do not change production domains, deployment commands or environment configuration without approval.

### 16. Implementation phases

**Phase 1 — Architecture assessment**

Inspect the existing repository, identify integration points, investigate recognition approaches and propose an implementation architecture.

No code changes.

**Phase 2 — Capture and panel detection**

Implement browser screen capture, artifact panel detection, a debug crop preview and manual calibration fallback.

**Phase 3 — Recognition and rating**

Extract artifact details, validate recognised data and pass it through the existing rating engine.

**Phase 4 — Continuous scanning**

Implement change detection, stable-frame processing, automatic rating updates and background-tab handling.

**Phase 5 — Reliability and usability**

Improve recognition across screen resolutions, browser scaling, artifact types and failure conditions. Refine the correction interface and performance.

**Phase 6 — Production readiness**

Run tests, review privacy/security, confirm deployment compatibility, document limitations and prepare for a separately approved release.

Do not skip phases without explaining why.

### 17. Out of scope

Unless separately approved, do not implement:

- Browser extensions.
- Game-client modifications.
- Network interception.
- Game memory inspection.
- Automated in-game interactions.
- Gameplay bots.
- Server-side video processing.
- Paid AI vision services.
- Screenshot collection services.
- Cloud image storage.
- New perk-rating algorithms.
- User registration systems.
- Extensive application refactoring.
- Unrelated UI redesigns.

### 18. Engineering expectations

Act as a technical lead, not just an implementation agent.

Challenge weak assumptions.

Investigate root causes rather than introducing superficial workarounds.

Prefer measured evidence over speculation.

Avoid unnecessary dependencies and layers of abstraction.

Preserve existing architecture unless a change is essential and justified.

Use existing project conventions and instructions.

Do not overwrite existing file-level context or project history.

If substantial uncertainty exists, identify it and ask targeted questions.

Use subagents for bounded, independent research or code reviews where beneficial, but do not allow multiple agents to make conflicting changes to the same files.

### 19. Immediate instruction — START HERE

**Perform Phase 1 only. Do not modify application code yet.**

Inspect the actual codebase and deliver:

1. Summary of the existing architecture and framework.
2. Location and structure of the perk-rating engine.
3. Existing artifact data model and validation rules.
4. How the scanner should integrate without duplicating logic.
5. Recommended browser capture implementation.
6. Recommended artifact panel recognition approach.
7. Recommended OCR and validation approach.
8. How automatic scanning would function when the planner is backgrounded.
9. Privacy, security and Terms of Service considerations.
10. Expected performance challenges.
11. Required dependencies, with justification.
12. Proposed new files and any necessary existing-file changes.
13. Testing strategy and screenshot requirements.
14. The simplest useful end-to-end prototype.
15. Risks, unknowns and questions requiring my decision.

Compare realistic alternatives before selecting an approach.

Distinguish verified findings from assumptions.

Explain any aspects that cannot be reliably determined without real screenshots.

Finish with a clear implementation recommendation and a proposed Phase 2 task breakdown.

**Stop after presenting Phase 1. Wait for my approval before modifying code.**
