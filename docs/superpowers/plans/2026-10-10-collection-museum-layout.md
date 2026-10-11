# Collection Museum Layout Implementation Plan

> **For agentic workers:** Execute inline in this session (user requested build). Checkbox steps for tracking.

**Goal:** List + Structured Collection views with Hall/Showcase rename, 3+3 Hall caps, Hermitage full-perk slot, and empty type-exhibit placeholders.

**Architecture:** Shared loadout (`mains` / `singles` / `hermitage`) drives both views; UI labels Hall/Showcase; Main/War museum hall selector unchanged.

**Tech Stack:** Vanilla HTML/CSS/JS (`ui/collection.*`, `ui/shared.js`), localStorage via existing DN helpers.

## Global Constraints

- Hall cap: 3 Mythical + 3 Legendary per museum hall
- Hermitage: Legendary only, full perks, one per museum hall
- Type exhibits: labeled empty placeholders only
- No new npm deps; bump `?v=` cache query on touched UI assets
- Do not commit unless user asks

---

### Task 1: Loadout + collection UI prefs

**Files:**
- Modify: `ui/shared.js` (`emptyHallLoadout`, `normalizeLoadout`, `loadCollectionUi` / `saveCollectionUi`)

- [x] **Step 1:** Extend hall loadout with `hermitage: string | null`; strip hermitage from mains/singles on normalize
- [x] **Step 2:** Persist `viewMode: "list" | "structured"` in collection UI

### Task 2: Collection logic + List view rename

**Files:**
- Modify: `ui/collection.js`, `ui/collection.html`

- [x] **Step 1:** `HALL_CAP = 3`; migrate over-cap mains → showcase; Hermitage set/clear; mode labels Hall/Showcase/Hermitage; slot badges; totals include hermitage
- [x] **Step 2:** List/Structured toggle in HTML controls

### Task 3: Structured board + styles

**Files:**
- Modify: `ui/collection.html`, `ui/collection.js`, `ui/styles.css`

- [x] **Step 1:** Render board (Hermitage, Mythical×3, Legendary×3, type placeholders, Showcase grid) with click-to-assign picker
- [x] **Step 2:** Styles for compact tiles; keep totals panel; bump cache versions

### Task 4: Manual verify

- [x] Open Collection, toggle views; Structured board shows Hermitage / 3 Mythical / 3 Legendary / type placeholders (Main vs War) / Showcase; List rename + chips confirmed empty-state
