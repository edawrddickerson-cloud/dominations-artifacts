# Collection Museum Layout — Design

**Date:** 2026-10-10  
**Status:** Approved for implementation  
**Scope:** Artifacts Collection page (`ui/collection.html` + `collection.js` + shared loadout)

## Goal

Add a Structured museum board view alongside the existing List view, align Hall/Showcase naming and slot caps with in-game Museum layout, and support Hermitage as a full-perk slot.

## Decisions

| Topic | Decision |
|-------|----------|
| Architecture | Dual view, shared loadout model |
| Mode rename | UI: Main → **Hall**, Single → **Showcase** (storage keys `mains`/`singles` kept) |
| Hall caps | 3 Mythical + 3 Legendary per Main/War hall |
| Cap migration | Keep first 3 Hall per grade; demote extras to Showcase |
| Hermitage | 1 slot per hall; **full perks**; Legendary only (no Mythical); displaces prior Hermitage to Showcase |
| Type exhibits | Empty labeled placeholders (not pickable this pass) |
| Priority L/M eligibility | Hall, Hermitage (Legendary only), Showcase — never type exhibits |
| Views | Toggle **List** \| **Structured**; both editable; Active totals on the right in both |
| List | Cards with stats + slot-type badge + Hall/Showcase/Hermitage controls |
| Structured | Compact tiles, no perk stats; click slot to assign/clear |
| Out of scope | Common/rare data, filling type exhibits, drag-and-drop |

## Exhibit counts (wiki)

**Main hall:** 2 Weapon, 2 Armor, 2 Jewelry, 2 Pottery, 3 Legendary, + Hermitage, + 3 Mythical Hall (app convention).  
**War hall:** 2 War Weapon, 2 War Armor, 4 War Equipment, 3 Legendary, + Hermitage, + 3 Mythical Hall.

## Data model

Per museum hall (`Main` | `War`):

```js
{
  mains: string[],              // Hall full-perk artifact ids (≤3 Mythical + ≤3 Legendary)
  singles: Record<string, number>, // Showcase: artifact id → perk index
  hermitage: string | null      // full-perk Legendary id, or null
}
```

Rules:

- An id appears in at most one of: `mains`, `hermitage`, `singles`.
- Owned L/M not in Hall or Hermitage are Showcase (auto-default first perk).
- Totals: Hall + Hermitage → all perks; Showcase → chosen perk.

## UI

- Persist `viewMode: "list" | "structured"` in collection UI prefs.
- Structured board sections: Hermitage, Mythical Hall (3), Legendary Hall (3), type placeholder groups, Showcase grid.
- Empty Hall/Hermitage slot → picker of eligible owned artifacts; filled → clear/demote to Showcase.
- Type placeholders non-interactive.

## Files

- `ui/shared.js` — loadout normalize (`hermitage`), collection UI `viewMode`, cap helpers if shared
- `ui/collection.html` — view toggle, structured board mount
- `ui/collection.js` — modes, caps, Hermitage, both views, totals
- `ui/styles.css` — structured tiles / board
