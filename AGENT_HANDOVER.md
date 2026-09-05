# DomiNations Artifacts — Agent Handover

**Date:** 2026-09-05  
**Status:** Canonical v3 — DW deep pass done (Cake/Dilophosaurus Released; costs filled; Leftwich/phantoms documented). Do **not** rebuild HTML UI yet (cost still sparse; Leftwich perk gap; 6 Uncertain).  
**Mode:** Auto — do not ask for approval; execute; checkpoint to disk often.

---

## Objective (one line)

Canonical dataset of all **fixed named** Legendary Main / Legendary War / Mythical artifacts → `data/artifacts.csv` + `.json`, with perks, costs, release evidence, provenance. Then HTML tracker later.

---

## What this agent finished

1. **Leftwich Trophy perk hunt** (no invent): Fandom page empty stats since create; no DW mention in 151 blog posts; no Fandom image files; mythical Leftwich pages missing → still `perk_count=0`. Notes + `data/temp/leftwich_and_phantom_research.md`.
2. **5 nav phantoms:** Benin Royal Ivory Mask, Golden Lyre of Ur, Mona Lisa, Roman Dodecahedron, Tibetan Dung-Dkar — **kept Uncertain** (redlinks only; no proof never shipped → do not remove).
3. **Release flips (DW evidence):**
   - **11th Anniversary Cake** → Released (`week-ahead-33026`)
   - **Dilophosaurus Skull** → Released (`dominations-update-133`, `week-ahead-2926`)
   - **Mask of Tutankhamun** → stay Uncertain (DW Tutankhamun text = King Tut event flavor, not artifact)
4. **Legendary token costs** from DW August calendar + 9th Anniversary vault → **21 / 118** legendaries now have `cost` (was ~4). Never applied Marco mythical 1000-token prices to Legendary rows. No IAP prices in `cost`.
5. Rebuilt canonical + reports via `python scripts/build_canonical.py`.

### Counts (after rebuild)

| Set | Rows | With ≥1 perk |
|-----|------|--------------|
| Legendary | 118 | **112** |
| Mythical | 32 | 32 (all) |
| Total | 150 | **144** |

Legendary with `cost`: **21 / 118**

Remaining legendary perk gaps (6):
- **Leftwich Trophy** — Released; empty wiki table; no DW/perk source
- **Benin Royal Ivory Mask, Golden Lyre of Ur, Mona Lisa, Roman Dodecahedron, Tibetan Dung-Dkar** — Uncertain nav phantoms

Uncertain with perks (wiki only): **Mask of Tutankhamun** only

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
  temp/                            # conflicts, build_summary, DW mines, research notes

reports/
  completeness_report.md
  discrepancies.md

scripts/
  build_canonical.py               # DW costs + release overrides live here
  batch_fetch_wiki_pages.py
  _reextract_wiki_perks.py
  _reverify_uncertain.py
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
- Marco's Wares **1000** prices are Mythical — do not copy onto Legendary `cost`

---

## Next agent — ordered tasks

1. **Leftwich Trophy perks** — still open (in-game screenshot / BHG Discord / patch notes / social); wiki+DW exhausted
2. **More legendary token calendars** on DominationsWorld (paginate older blog; other month calendars) — 97 still blank
3. **Mask of Tutankhamun** — need artifact-named DW/BHG hit before Released
4. **Nav phantoms** — remove only with explicit “never shipped” / cleanup evidence; else leave Uncertain
5. Only after perk coverage + release decisions: consider HTML tracker

### Do not

- Start HTML UI while Leftwich gap / Uncertain phantoms unresolved (or get explicit OK)
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

Useful temp artifacts from this pass:
- `data/temp/dw_cost_mine.json` — 151 DW posts mined
- `data/temp/dw_legendary_costs.json` — calendar/vault parse
- `data/temp/dw_key_posts.json` — Cake / Dilophosaurus / Antikythera / vault excerpts
- `data/temp/leftwich_and_phantom_research.md`

---

## Good clear-context point

**NOW** after this handover:

- Legendary with perks: **112 / 118**
- Cake + Dilophosaurus: **Released** (DW)
- Legendary costs: **21 / 118** (DW calendars + prior wiki)
- Phantoms kept Uncertain with documented rationale
- Leftwich still the hard perk gap — **not** HTML yet
