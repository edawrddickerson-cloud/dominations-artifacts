# DomiNations Artifacts — Agent Handover

**Date:** 2026-09-05  
**Status:** Canonical v4 — BHG Leftwich confirmation; Tutankhamun Released; legendary costs **57/118**; cost source map written. Do **not** rebuild HTML UI yet (cost still sparse; Leftwich/phantoms Uncertain).  
**Mode:** Auto — do not ask for approval; execute; checkpoint to disk often.

---

## Objective (one line)

Canonical dataset of all **fixed named** Main/War artifacts at **Legendary** and **Mythical** grades → `data/artifacts.csv` + `.json`, with perks, costs, release evidence, provenance. Then HTML tracker later.

---

## What this agent finished

1. **Leftwich Trophy:** BHG forum evidence (not inventing perks):
   - **BHGAustin** (Engineer): created years ago but **never sold**; Showcase-only; disabling from Showcase.
   - **Harlems369th**: “There is no Leftwich Trophy in DomiNations.”
   - Demoted **Released → Uncertain**; `perk_count=0` kept. Thread: `forums.bighugegames.com/.../leftwich-trophy.43759`.
2. **Legendary token costs:** mined May–Aug 2025 DW calendars (HTML tables / 100|300 sections) + prior Aug 2023 calendar + 9th Ann vault → **57 / 118** legendaries with `cost` (was 21). Stored in `data/raw/dw_legendary_token_costs.json` (loaded by `build_canonical.py`). Never applied Mythical 1000-token prices.
3. **Mask of Tutankhamun → Released** — July 2025 Legendary Calendar lists “The Mask of Tutankhamun” at **100 tokens** (artifact-named). Cost filled.
4. **5 nav phantoms:** still no never-shipped proof → kept Uncertain.
5. **Cost source map:** `data/temp/token_cost_source_map.md` — where to find 100/300 vs mythical 1000.
6. Rebuilt canonical + reports via `python scripts/build_canonical.py`.

### Counts (after rebuild)

| Set | Rows | With ≥1 perk |
|-----|------|--------------|
| Legendary | 118 | **112** |
| Mythical | 32 | 32 (all) |
| Total | 150 | **144** |

Legendary with `cost`: **57 / 118**

Remaining legendary perk gaps (6):
- **Leftwich Trophy** — Uncertain (never sold); perks never published
- **Benin Royal Ivory Mask, Golden Lyre of Ur, Mona Lisa, Roman Dodecahedron, Tibetan Dung-Dkar** — Uncertain nav phantoms

Uncertain (6): Leftwich + 5 nav phantoms

---

## Folder layout

```text
/
  AGENT_HANDOVER.md
  dominations_*_DRAFT.csv

data/
  artifacts.csv / artifacts.json   # CANONICAL
  perk_name_mapping.csv
  artifact_release_reconciliation.csv
  raw/
    dw_legendary_token_costs.json  # Marco legendary 100/300 map
  temp/                            # mines, research notes, cost source map

reports/
  completeness_report.md
  discrepancies.md

scripts/
  build_canonical.py               # loads dw_legendary_token_costs.json
  _mine_dw_token_costs.py
  _parse_dw_calendars_v2.py
  _build_dw_cost_json.py
  batch_fetch_wiki_pages.py
  _reextract_wiki_perks.py
  ...
```

---

## Required schema (unchanged)

```text
artifact_id, name, alternate_name, hall, museum_hall, grade, release_status, release_date,
perk_count, perk_1_name, perk_1_base, perk_1_max, ... perk_6_*,
cost, cost_currency, acquisition_method, availability_notes,
source_primary, source_secondary, source_checked_date, confidence, notes
```

- **`hall`:** Main or War (museum). Never `Mythical`.
- **`grade`:** Legendary or Mythical (tier).
- Legendary max: `|base|+9` (skip `|base|==1`)
- Mythical max: **left blank** (do not blind +9)
- Never put real-money sale prices in `cost` (tokens/legendary coins only)
- Marco's Wares **1000** prices are Mythical — do not copy onto Legendary `cost`
- Legendary Marco calendars are typically **100 or 300** tokens

---

## Next agent — ordered tasks

1. **More legendary calendars** if BHG publishes newer months; re-probe URL patterns; OCR calendar images only if HTML table missing
2. **Nav phantoms** — remove only with explicit never-shipped / cleanup evidence (Leftwich-level BHG statement)
3. **Leftwich** — leave Uncertain unless BHG publishes stats or confirms permanent deletion; do not invent perks
4. Optional: older pre-2025 calendars / vault posts still on DW (paginate blog; title keywords `legendary calendar` / `token calendar` / `vault`)
5. Only after perk coverage + release decisions: consider HTML tracker

### Do not

- Start HTML UI while Uncertain phantoms / Leftwich unresolved (or get explicit OK)
- Overwrite draft/official perks with weaker wiki quick_view
- Blind +9 mythical values
- Put sale prices in main `cost`
- Apply mythical 1000-token Marco prices to legendary rows

---

## Known quirks

- Duplicate perk names on one artifact can be real
- Wiki Mythical War quick_view often copies Legendary 5-perk sets (wrong)
- Historical text containing “mythical” must not drive grade (parser fixed)
- `Looted Resource Refunt` → Refund via perk mapping
- DW site search `?s=` is unreliable (JS shell; always mine `/blog/?page=N` posts)
- 2025 legendary calendars use **table columns** (300 | 100), not `Name - N tokens` lines
- Shell on this Windows machine: use `required_permissions: ["all"]`

---

## Commands

```powershell
cd "c:\Projects\Dominations Artifacts"
python scripts/_build_dw_cost_json.py   # if extending cost JSON
python scripts/build_canonical.py
python scripts/_reextract_wiki_perks.py  # only if wiki caches change
```

Useful temp artifacts:
- `data/temp/token_cost_source_map.md` — **where costs live**
- `data/temp/dw_calendar_final_mine.json`
- `data/temp/leftwich_and_phantom_research.md`
- `data/temp/leftwich_bhg_namu.json`
- `data/raw/dw_legendary_token_costs.json`

---

## Good clear-context point

**NOW** after this handover:

- Legendary with perks: **112 / 118**
- Legendary costs: **57 / 118**
- Tutankhamun: **Released** (DW calendar)
- Leftwich: **Uncertain** (BHG never-sold)
- Phantoms kept Uncertain
- Cost source map written — **not** HTML yet
