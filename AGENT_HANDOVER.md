# DomiNations Artifacts — Agent Handover

**Date:** 2026-09-05  
**Status:** Canonical merge **done** (v1). Large legendary perk gaps remain. Do **not** rebuild UI yet.  
**Mode:** Auto — do not ask for approval; execute; checkpoint to disk often.

---

## Objective (one line)

Canonical dataset of all **fixed named** Legendary Main / Legendary War / Mythical artifacts → `data/artifacts.csv` + `.json`, with perks, costs, release evidence, provenance. Then HTML tracker later.

---

## What the previous agent finished

1. **`scripts/build_canonical.py`** — merge pipeline (drafts + wiki overlay + official extras)
2. **Official DominationsWorld sweep** (Week Ahead + Marco's Wares + anniversary)
3. **Wrote deliverables:**
   - `data/artifacts.csv` / `data/artifacts.json` — **150** rows (118 Legendary + 32 Mythical)
   - `data/perk_name_mapping.csv`
   - `data/artifact_release_reconciliation.csv`
   - `data/temp/conflicts.json` (70 draft-vs-wiki; draft preferred)
   - `reports/completeness_report.md`, `reports/discrepancies.md`
4. Halls set for prior TBD: Analytical Engine/DomiNations Army Helmet/Mahiole → **War**; First Strike Star → **Main**
5. British Kettle Drum Mythical: **6 perks** from wiki statistic_table
6. Added 3 official mythicals missing from draft (June 2026 Marco): Pershing Bas-Relief, Joyeuse Sword, Silla Gold Crown

### Counts (after build)

| Set | Rows | With ≥1 perk |
|-----|------|--------------|
| Legendary | 118 | 64 |
| Mythical | 32 | 32 (all) |
| Total | 150 | 96 |

---

## Folder layout

```text
/
  AGENT_HANDOVER.md
  dominations_*_DRAFT.csv          # preserved research drafts

data/
  artifacts.csv / artifacts.json   # CANONICAL TARGET (built)
  perk_name_mapping.csv
  artifact_release_reconciliation.csv
  raw/                             # wiki + drafts + dominations_info notes
  temp/                            # conflicts, build_summary, official_sweep_*

reports/
  completeness_report.md
  discrepancies.md

scripts/
  build_canonical.py               # re-run after source updates
  batch_fetch_wiki_pages.py
  _summarize_wiki_batch.py
```

---

## Required schema (implemented)

```text
artifact_id, name, alternate_name, hall, museum_hall, grade, release_status, release_date,
perk_count, perk_1_name, perk_1_base, perk_1_max, ... perk_6_*,
cost, cost_currency, acquisition_method, availability_notes,
source_primary, source_secondary, source_checked_date, confidence, notes
```

- `hall`: Main | War | Mythical | Unknown  
- Mythicals: `hall=Mythical`, Main/War affiliation in `museum_hall`
- Legendary max: `|base|+9` (skip `|base|==1`); noted in `notes`
- Mythical max: **left blank** (do not blind +9)

---

## Critical source status

### dominations-info.com — still BROKEN (404 API)
Do not block on it. Notes in `data/raw/dominations_info/NOTES.md`.

### Official sweep takeaway
- Wiki-only legendaries still **Uncertain** (no DW hits)
- June 2026 Marco extras were the important draft gap

---

## Next agent — ordered tasks

1. **Fill legendary perk gaps** (~54 roster-only with empty perks): prefer BHG/DominationsWorld, then wiki statistic_table; never overwrite stronger draft numbers with weak quick_view.
2. **Re-verify Uncertain wiki-only legendaries** (Cake, Dilophosaurus, Tutankhamun, Benin, Lyre, Mona Lisa, Dodecahedron, Dung-Dkar) — deeper official/social search; flip to Released only with evidence.
3. **Cost / acquisition** pass for legendaries (many blank); do not put sale prices in `cost`.
4. **Optional:** fetch missing wiki pages for nav-only names; refresh `wiki_perk_extract.json`; re-run `python scripts/build_canonical.py`.
5. **QC** after fills; update reports; commit.
6. Only after perk coverage is strong: consider HTML tracker (out of scope until then).

### Do not

- Start HTML UI while large perk gaps remain
- Overwrite draft/official perks with weaker wiki quick_view
- Mark project complete with ~54 empty legendary perk sets
- Blind +9 mythical values
- Put sale prices in main `cost`

---

## Known quirks

- Duplicate perk names on one artifact can be real
- Wiki Mythical War quick_view often copies Legendary 5-perk sets (wrong)
- `Looted Resource Refunt` → mapped toward Refund in perk mapping
- Shell on this Windows machine: use `required_permissions: ["all"]` (sandbox helper lacks FS isolation)

---

## Commands

```powershell
cd "c:\Projects\Dominations Artifacts"
python scripts/build_canonical.py
python scripts/_summarize_wiki_batch.py
```

---

## Good clear-context point

**NOW** after this handover:

- Canonical v1 exists and is committed (or ready to commit)
- Official June mythical gap closed
- Next work = fill legendary perks + resolve Uncertain wiki-only names
