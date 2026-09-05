# DomiNations Artifacts — Agent Handover

**Date:** 2026-09-05  
**Status:** Canonical v2 — legendary perk fill largely done. Do **not** rebuild HTML UI yet (cost sparsity + 6 perk gaps + Uncertain names remain).  
**Mode:** Auto — do not ask for approval; execute; checkpoint to disk often.

---

## Objective (one line)

Canonical dataset of all **fixed named** Legendary Main / Legendary War / Mythical artifacts → `data/artifacts.csv` + `.json`, with perks, costs, release evidence, provenance. Then HTML tracker later.

---

## What this agent finished

1. **Fixed wiki `statistic_table` parser** (`scripts/batch_fetch_wiki_pages.py`):
   - Same-line `| Name || +12%` cells
   - `rowspan` value inheritance
   - Row split no longer breaks on `||-8%` negatives
2. **Fixed `guess_grade`** so historical prose (“mythical king/creatures”) no longer mis-tags Legendary pages as Mythical
3. **Re-extracted** `data/raw/wiki_perk_extract.json` (249 records; 113 legendary statistic_table)
4. **Rebuilt canonical** via `python scripts/build_canonical.py`
5. **Re-verified Uncertain wiki-only names** → `data/temp/uncertain_reverify.json` (still Uncertain; no DW/BHG hits)
6. **Cost/acquisition pass** from wiki prose (token costs only; no IAP sale prices in `cost`)

### Counts (after rebuild)

| Set | Rows | With ≥1 perk |
|-----|------|--------------|
| Legendary | 118 | **112** (was 64) |
| Mythical | 32 | 32 (all) |
| Total | 150 | **144** |

Remaining legendary perk gaps (6):
- **Leftwich Trophy** — Released; wiki table empty; no DW hit
- **Benin Royal Ivory Mask, Golden Lyre of Ur, Mona Lisa, Roman Dodecahedron, Tibetan Dung-Dkar** — Uncertain nav phantoms (no Fandom page)

Uncertain with perks (wiki only, no DW): 11th Anniversary Cake, Dilophosaurus Skull, Mask of Tutankhamun

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
  raw/                             # wiki + drafts
  temp/                            # conflicts, build_summary, uncertain_reverify, official_sweep_*

reports/
  completeness_report.md
  discrepancies.md

scripts/
  build_canonical.py
  batch_fetch_wiki_pages.py
  _reextract_wiki_perks.py         # re-parse cached wiki pages (no network)
  _reverify_uncertain.py           # Fandom + DW check for Uncertain names
  _summarize_wiki_batch.py
```

---

## Required schema (unchanged)

```text
artifact_id, name, alternate_name, hall, museum_hall, grade, release_status, release_date,
perk_count, perk_1_name, perk_1_base, perk_1_max, ... perk_6_*,
cost, cost_currency, acquisition_method, availability_notes,
source_primary, source_secondary, source_checked_date, confidence, notes
```

- Legendary max: `|base|+9` (skip `|base|==1`)
- Mythical max: **left blank** (do not blind +9)
- Never put real-money sale prices in `cost` (tokens/legendary coins only)

---

## Next agent — ordered tasks

1. **Leftwich Trophy perks** — deeper BHG/DW/social search; wiki table is blank
2. **Decide fate of 5 nav phantoms** (remove vs keep Uncertain) once product owner rules
3. **Optional:** flip Cake / Dilophosaurus / Tutankhamun to Released **only** with BHG/DominationsWorld evidence
4. Broader **cost** sourcing (Marco posts, patch notes) — wiki only had ~4 token costs
5. Only after perk coverage + release decisions: consider HTML tracker

### Do not

- Start HTML UI while Uncertain phantoms / Leftwich gap unresolved (or get explicit OK)
- Overwrite draft/official perks with weaker wiki quick_view
- Blind +9 mythical values
- Put sale prices in main `cost`

---

## Known quirks

- Duplicate perk names on one artifact can be real
- Wiki Mythical War quick_view often copies Legendary 5-perk sets (wrong)
- Historical text containing “mythical” must not drive grade (parser fixed)
- `Looted Resource Refunt` → Refund via perk mapping
- Shell on this Windows machine: use `required_permissions: ["all"]`

---

## Commands

```powershell
cd "c:\Projects\Dominations Artifacts"
python scripts/_reextract_wiki_perks.py
python scripts/build_canonical.py
python scripts/_summarize_wiki_batch.py
python scripts/_reverify_uncertain.py
```

---

## Good clear-context point

**NOW** after this handover:

- Legendary with perks: **112 / 118**
- Parser + grade bugs fixed; re-extract path documented
- Uncertain reverify recorded; none flipped to Released without evidence
- Next work = Leftwich + phantom policy + richer costs — **not** HTML yet
