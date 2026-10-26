# University and Library research

The readable inventory is [reports/research_catalog.md](../../reports/research_catalog.md).

Extracted from wiki references on 25–26 October 2026:

| Research | Lines | Items | Individual research stages |
| --- | ---: | ---: | ---: |
| University | 22 | 304 skills | 8,443 levels |
| Library | 5 | 116 books/capstones | 564 chapters |

University includes 100 Foundational Study skills, 95 Higher Education Study
skills, and 109 Strike Study skills. Library includes the four Robotics Age
books absent from the older Fandom index.

## Files

- `catalog.json`: full structured catalogue; source links, prerequisites,
  building gates, age names and ordering, effects, and individual levels.
- `university.csv`: one row per skill, with study, leader/research line, grid
  position, effect, age, maximum level, first/maximum bonus, and prerequisites.
- `university_levels.csv`: one row per research level, including costs and time.
- `library.csv`: one row per chapter, with bookcase, book, effect, age,
  prerequisites, costs, time and source links.
- `coverage.json`: counts and completeness checks.
- `issues.json`: source disagreements and derived capstone gates.

## Sources and confidence

Primary Fandom references:
[University](https://dominations.fandom.com/wiki/University),
[Great Leaders](https://dominations.fandom.com/wiki/Great_Leaders),
[Technology](https://dominations.fandom.com/wiki/Technology),
and individual research pages recorded in `fandom_evidence`.
Direct Fandom HTML/API requests failed; available search-index table facts were
captured in `data/raw/research/fandom_index_extract.json`.

Supplemental reference:
[DomiAtlas University](https://domiatlas.top/en/systems/university/) and
[Library](https://domiatlas.top/en/systems/library/), from its
[published download](https://domiatlas.top/downloads/catalog.json), generated
23 October 2026, release 0.9.15. Relevant English factual records are preserved
in `data/raw/research/domiatlas_research.json`. Each output stage retains table
and evidence IDs and versions. This is a player-maintained client reference,
**not live-server verification**. Effects/costs generally use International
13.1603.1603; prerequisite/detail tables retain their earlier version separately.

Official update notes confirm the newer research exists:
[13.5: Strike Study](https://www.dominationsworld.com/article/dominations-update-135/),
[13.7: Defenders](https://www.dominationsworld.com/blog/dominations-update-137/),
[13.8: Airstrip and four new Library books](https://www.dominationsworld.com/article/dominations-update-138/).

## Age and effect interpretation

`minimum_age` means the earliest age supported by the research/building gate,
with explicit University prerequisite age bounds and Library capstone completion
accounted for. It does not say the player has completed those prerequisites,
owns the affected troop, has the currency, or has finished the research.
Player XP level and age are different; the future filter should ask for age.

`building_gate_age` preserves the supplemental table's original building gate.
Library capstones require the entire bookcase, so their effective age is higher
than the raw Library 1 value. Their `building_level_required` remains the raw
minimum; use `minimum_age` plus `completion_requirement` for availability.

Eight State of Defense topics have conflicting gates: Protector, Safeguard,
Disruption, Stronghold, Battle Stations, Fortify, Early Preparation and Blackout.
Fandom's index requires Library 6/13, while the supplement treats the research
tier 2/3 as the Library requirement. The conservative Fandom age is shown;
`age_status: conflicting_sources` marks these eight topics and their capstone.
**Exclude these nine topics from automatic availability recommendations until
their in-game gates are checked.** The alternatives remain in the source fields.

Other recorded discrepancies: Hannibal's initial skills require University 1
in Fandom versus 2 in the supplemental reference (both Gunpowder Age); Tesla's
Recon Deployment Cooldown lists five levels in Fandom but three in the newer
reference. Both claims are retained in `issues.json`.

University `bonus_at_level` is the reported value at that level, not an increment
to sum across levels. Direction comes from `effect` (for example a cost reduction).
`null` means the reference has no reviewed unit for that number; original
`source_growth_value` remains available. Do not turn every raw number into a
percentage. Library chapter effects are separate; no cumulative totals are
inferred. Costs and times exclude account discounts and temporary events.

Stable IDs distinguish repeated skill names; grid positions distinguish repeated
branches within a leader. `source_target_links` are the supplement's partial
effect links, not a complete or reviewed unit grouping. The requested grouping
by APC and other goals is a separate next step.

## Rebuild

```powershell
python scripts/build_research_catalog.py
```

Add `--fetch` to refresh the supplemental capture. This requires `requests`.
The builder checks unique IDs, contiguous level coverage, prerequisites,
age mappings, effects and research times. No UI or artifact datasets are changed.
