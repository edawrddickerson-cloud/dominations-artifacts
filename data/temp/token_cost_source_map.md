# Where legendary token costs come from (research map)

**Updated:** 2026-09-05

## Primary sources (use these)

| Source type | URL pattern | What you get | Typical amounts |
|-------------|-------------|--------------|-----------------|
| **Legendary Token Calendars** | `https://www.dominationsworld.com/blog/legendary-calendar-{month}-{year}` | Monthly Marco Polo legendary rotation with **100 Tokens** / **300 Tokens** columns (often a 2-col HTML table + image) | **100** or **300** Legendary Tokens |
| Older calendar slug | `.../blog/august-legendary-token-calendar` (2023) | Same idea; inline `Name - N tokens` lines | 100 / 300 |
| **Anniversary vault** | e.g. `.../blog/9th-anniversary` | Timed vault: one legendary every 48h | **300** tokens (shared price) |
| Wiki sale notes | Fandom artifact pages | Occasional “X Legendary Tokens” in acquisition text | mixed; prefer DW |

### Confirmed calendar posts mined this pass

- https://www.dominationsworld.com/blog/legendary-calendar-may-2025
- https://www.dominationsworld.com/blog/legendary-calendar-june-2025
- https://www.dominationsworld.com/blog/legendary-calendar-july-2025
- https://www.dominationsworld.com/blog/legendary-calendar-august-2025
- https://www.dominationsworld.com/blog/august-legendary-token-calendar
- https://www.dominationsworld.com/blog/9th-anniversary

URL probe for other months/years (`legendary-calendar-{month}-{2024,2025,2026}`, `{month}-legendary-token-calendar`, etc.) found **no additional** dedicated calendar posts beyond the five above.

## Do NOT use for Legendary `cost`

| Source | Why |
|--------|-----|
| **Marco's Wares monthly** (`marcos-wares-*` / Mythical & Councilor posts) | Mythical artifacts at **1000** Legendary Tokens; Legendary Councilors at **500**. Never copy onto Legendary artifact rows. |
| Gem / crown / IAP / step-up sales | Real-money or gem prices — out of scope for `cost` |
| DW site search `?s=` | Unreliable JS shell; always paginate `/blog/?page=N` |

## Player-facing pattern (confirmed)

- **Legendary (Marco Polo calendars):** almost always **100** or **300** Legendary Tokens.
- **Mythical (Marco's Wares):** **1000** Legendary Tokens (or gem/chest alternatives).
- Rotation: calendars list which legendaries are offered that month; the same artifact can appear at 100 in one month and 300 in another (or vault 300). Canonical stores one representative token amount (fill blanks only; do not overwrite existing wiki/draft costs).

## How to extend blanks next

1. Paginate `https://www.dominationsworld.com/blog/?page=N` (currently ~16 pages / ~154 posts).
2. Open any post titled like “Legendary Calendar …”.
3. Prefer HTML **table** columns (`300 Tokens` \| `100 Tokens`); images alone need OCR.
4. Merge into `data/raw/dw_legendary_token_costs.json` then rebuild.
5. Scripts: `scripts/_mine_dw_token_costs.py`, `scripts/_parse_dw_calendars_v2.py`, `scripts/_build_dw_cost_json.py`.

## Machine dumps

- `data/raw/dw_legendary_token_costs.json` — merged cost map loaded by `build_canonical.py`
- `data/temp/dw_calendar_final_mine.json` — parsed hits
- `data/temp/dw_blog_index.json` — blog index
- `data/temp/dw_deep_mine.json` — full-post needle search
