# Cost tier multi-select filter

## Goal

Add a multi-select **Cost** filter to the DomiNations Artifacts tracker UI so users can show artifacts by Legendary Token cost bucket: **1000**, **300**, **100**, or **Unknown**.

## Context

- Filter bar today: Search, Hall, Grade, Release (single-select), Perks (multi-select panel), Clear.
- `tokenCount(row)` already parses `row.cost` to a number or `null`.
- Current data has exactly four cost values: `1000`, `300`, `100`, and blank.

## Behavior

| Selection | Result |
|-----------|--------|
| None checked | No cost filtering (same idea as Hall/Grade/Release “All”) |
| One or more checked | Row matches if its cost bucket is **any** of the selected options (OR) |

### Bucket mapping

| Option | Match when |
|--------|------------|
| `1000` | `tokenCount(row) === 1000` |
| `300` | `tokenCount(row) === 300` |
| `100` | `tokenCount(row) === 100` |
| `Unknown` | `tokenCount(row) == null` (blank or non-numeric cost) |

Exact numeric match only — no ranges. Unknown covers blanks and any future non-numeric cost strings.

### Clear

The main **Clear** control unchecks all cost options (with Search, Hall, Grade, Release, and Perks).

## UI

- Placement: filter bar, after **Release**, before **Perks**.
- Label: **Cost** (same uppercase micro-label style as other filters).
- Control: horizontal inline checkboxes — `1000` · `300` · `100` · `Unknown` (fixed order).
- No dropdown panel; four fixed options do not need search or a perk-style popover.
- Light CSS only: stack label above a wrapped checkbox row that aligns with existing filter height.

## Implementation touch points

| File | Change |
|------|--------|
| `ui/index.html` | Cost filter markup (fieldset/group + four checkboxes) |
| `ui/styles.css` | Checkbox row layout under `.filters` |
| `ui/app.js` | Selected-set state; `costBucket(row)` (or equivalent); gate in `matches()`; wire change → `render`; reset in Clear |

No changes to `data/artifacts.json`, build scripts, or public data shape.

## Out of scope

- Persisting cost filter in `localStorage`
- AND mode across cost buckets
- Filtering by `cost_currency`
- Changing cost sort behavior

## Acceptance

1. With no cost boxes checked, the table matches current behavior for cost.
2. Checking `300` alone shows only rows with cost `300`.
3. Checking `1000` and `100` shows the union of those two buckets.
4. Checking `Unknown` shows rows with blank/non-numeric cost.
5. **Clear** resets cost checkboxes and restores the unfiltered cost view (subject to other filters).
