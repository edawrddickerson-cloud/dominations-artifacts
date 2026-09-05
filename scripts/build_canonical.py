# -*- coding: utf-8 -*-
"""Merge draft CSVs + wiki perk extracts into canonical artifact dataset."""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(r"c:\Projects\Dominations Artifacts")
RAW = ROOT / "data" / "raw"
DATA = ROOT / "data"
TEMP = DATA / "temp"
REPORTS = ROOT / "reports"
CHECKED = "2026-09-05"

HALL_OVERRIDES = {
    "analytical-engine": ("War", "wiki Legendary_War_Artifacts list"),
    "dominations-army-helmet": ("War", "wiki Legendary_War_Artifacts list"),
    "mahiole": ("War", "wiki Legendary_War_Artifacts list"),
    "first-strike-star": ("Main", "wiki Legendary_Artifacts list"),
}

# Official Marco's Wares mythicals confirmed on DominationsWorld but missing from draft.
# Source: https://www.dominationsworld.com/blog/marcos-wares-june-2026/
OFFICIAL_EXTRA_MYTHICALS = [
    {
        "name": "General Pershing's Bas-Relief",
        "museum_hall": "War",
        "cost": "1000",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco / official release",
        "source_primary": "https://www.dominationsworld.com/blog/marcos-wares-june-2026/",
        "perks": [
            ("Barracks Troop Damage", "9"),
            ("Heavy Infantry Hitpoints", "9"),
            ("Ranged Infantry Hitpoints", "9"),
            ("Heavy Cavalry Hitpoints", "9"),
            ("Ranged Siege Damage", "9"),
            ("Raider Damage", "9"),
        ],
        "notes": "Added from official June 2026 Marco's Wares; was missing from 29-row mythical draft.",
    },
    {
        "name": "Joyeuse Sword",
        "museum_hall": "War",
        "cost": "1000",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco / official release",
        "source_primary": "https://www.dominationsworld.com/blog/marcos-wares-june-2026/",
        "perks": [
            ("Heavy Tank Damage", "11"),
            ("Factory Troop Damage", "11"),
            ("Heavy Tank Damage", "11"),
            ("Bomber Damage", "11"),
            ("Generals' Damage", "11"),
            ("Defender Damage", "11"),
        ],
        "notes": "Added from official June 2026 Marco's Wares; duplicate Heavy Tank Damage perk is real per BHG post.",
    },
    {
        "name": "Silla Gold Crown",
        "museum_hall": "Main",
        "cost": "1000",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco / official release",
        "source_primary": "https://www.dominationsworld.com/blog/marcos-wares-june-2026/",
        "perks": [
            ("Library Tech Resource Cost", "15"),
            ("Gold Looted", "15"),
            ("Gold from Gold Mines", "15"),
            ("Gold from Caravans", "15"),
            ("Ranged Infantry Damage", "15"),
            ("Library Tech Resource Cost", "15"),
        ],
        "notes": "Added from official June 2026 Marco's Wares; duplicate Library Tech Resource Cost perk is real per BHG post. No wiki perk extract in batch.",
    },
]

# Wiki-listed legendary candidates not in the 110-row draft.
# Re-verified 2026-09-05: DominationsWorld search + prior official sweep had no hits.
# Cake / Dilophosaurus / Tutankhamun have real Fandom pages + statistic_table perks.
# Benin / Lyre / Mona Lisa / Dodecahedron / Dung-Dkar: no Fandom page (parse miss) — nav phantoms.
WIKI_ONLY_LEGENDARY = [
    {
        "name": "11th Anniversary Cake",
        "hall": "War",
        "alternate_name": "",
        "notes": "Fandom legendary war page + perks exist; no DominationsWorld/BHG hit in 2026-09-05 reverify — remain Uncertain.",
    },
    {
        "name": "Dilophosaurus Skull",
        "hall": "Main",
        "alternate_name": "",
        "notes": "Fandom legendary main page + perks exist; no DominationsWorld/BHG hit in 2026-09-05 reverify — remain Uncertain.",
    },
    {
        "name": "Mask of Tutankhamun",
        "hall": "Main",
        "alternate_name": "",
        "notes": "Fandom legendary main page + perks exist; no DominationsWorld/BHG hit in 2026-09-05 reverify — remain Uncertain.",
    },
    {
        "name": "Benin Royal Ivory Mask",
        "hall": "Main",
        "alternate_name": "",
        "notes": "No Fandom page (API miss); no DominationsWorld hit — nav/menu phantom; remain Uncertain.",
    },
    {
        "name": "Golden Lyre of Ur",
        "hall": "Main",
        "alternate_name": "",
        "notes": "No Fandom page (API miss); no DominationsWorld hit — nav/menu phantom; remain Uncertain.",
    },
    {
        "name": "Mona Lisa",
        "hall": "Main",
        "alternate_name": "",
        "notes": "No Fandom page (API miss); no DominationsWorld hit — nav/menu phantom; remain Uncertain.",
    },
    {
        "name": "Roman Dodecahedron",
        "hall": "Main",
        "alternate_name": "Roman Dodechedron",
        "notes": "No Fandom page for Dodecahedron/Dodechedron; no DominationsWorld hit — nav phantom; remain Uncertain.",
    },
    {
        "name": "Tibetan Dung-Dkar",
        "hall": "Main",
        "alternate_name": "",
        "notes": "No Fandom page (API miss); no DominationsWorld hit — nav/menu phantom; remain Uncertain.",
    },
]

SKIP_TITLES = {
    "legendary artifacts",
    "legendary war artifacts",
    "mythical artifacts",
    "mythical war artifacts",
    "library",
    "technology",
    "museum",
    "archaeology capstone",
}

CANONICAL_FIELDS = [
    "artifact_id",
    "name",
    "alternate_name",
    "hall",
    "museum_hall",
    "grade",
    "release_status",
    "release_date",
    "perk_count",
    "perk_1_name",
    "perk_1_base",
    "perk_1_max",
    "perk_2_name",
    "perk_2_base",
    "perk_2_max",
    "perk_3_name",
    "perk_3_base",
    "perk_3_max",
    "perk_4_name",
    "perk_4_base",
    "perk_4_max",
    "perk_5_name",
    "perk_5_base",
    "perk_5_max",
    "perk_6_name",
    "perk_6_base",
    "perk_6_max",
    "cost",
    "cost_currency",
    "acquisition_method",
    "availability_notes",
    "source_primary",
    "source_secondary",
    "source_checked_date",
    "confidence",
    "notes",
]


def fix_mojibake(s: str) -> str:
    if not s:
        return ""
    # Common UTF-8 curly apostrophe misread as cp1252 / replacement
    s = s.replace("\ufffd", "\u2019")
    return s


def display_name(s: str) -> str:
    s = fix_mojibake(s).strip()
    # Prefer typographic apostrophe already in drafts; keep as-is
    return s


def norm_key(s: str) -> str:
    s = fix_mojibake(s).casefold()
    for a, b in [
        ("\u2019", "'"),
        ("\u2018", "'"),
        ("\u2032", "'"),
        ("\u201c", '"'),
        ("\u201d", '"'),
        ("\u2013", "-"),
        ("\u2014", "-"),
        ("\ufffd", "'"),
    ]:
        s = s.replace(a, b)
    s = s.replace("dominations army helmet", "dominations army helmet")
    s = s.replace("domi nations army helmet", "dominations army helmet")
    s = re.sub(r"^dominations\s+army\s+helmet$", "dominations army helmet", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    # Alias nav typo
    if s == "roman-dodechedron":
        s = "roman-dodecahedron"
    if s == "dominations-army-helmet":
        s = "dominations-army-helmet"
    return s


def slug_id(name: str, grade: str) -> str:
    base = norm_key(name)
    g = grade.casefold()
    return f"{base}-{g}"


def parse_value(raw: str) -> tuple[str, bool]:
    """Return (signed numeric string without %, is_percent_like). Blank if unparsable."""
    if raw is None:
        return "", False
    s = str(raw).strip()
    if not s:
        return "", False
    is_pct = "%" in s
    s2 = s.replace("%", "").replace(",", "").strip()
    s2 = s2.replace("\u2212", "-")
    m = re.fullmatch(r"[+-]?\d+(?:\.\d+)?", s2)
    if not m:
        return "", False
    # Normalize integers when whole
    num = float(s2)
    if num.is_integer():
        out = str(int(num))
    else:
        out = str(num)
    if not out.startswith(("+", "-")) and s2.startswith("+"):
        out = "+" + out.lstrip("+")
    # Keep sign only if negative or explicit; store plain number like drafts
    if out.startswith("+"):
        out = out[1:]
    return out, is_pct or True  # draft bases are percent magnitudes without %


def derive_max(base: str, grade: str, apply: bool) -> str:
    if not apply or not base or grade.casefold() != "legendary":
        return ""
    try:
        n = int(base)
    except ValueError:
        try:
            n = float(base)
        except ValueError:
            return ""
    # Non-% special ints like 1: do not upgrade (documented rule)
    if abs(n) == 1:
        return ""
    sign = -1 if n < 0 else 1
    return str(sign * (abs(n) + 9))


def load_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def choose_wiki_extracts(records: list[dict]) -> dict[tuple[str, str], dict]:
    """Key: (norm_name, grade) -> best extract. Prefer statistic_table > quick_view."""
    buckets: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for rec in records:
        name = display_name(rec.get("artifact_name") or "")
        if not name or name.casefold() in SKIP_TITLES:
            continue
        grade = (rec.get("grade_guess") or "Unknown").strip()
        key = (norm_key(name), grade.casefold())
        buckets[key].append(rec)

    chosen: dict[tuple[str, str], dict] = {}
    for key, items in buckets.items():
        items_sorted = sorted(
            items,
            key=lambda x: (
                0 if x.get("source") == "statistic_table" else 1,
                0 if "(Mythical" in (x.get("page_title") or "") else 1,
                -len(x.get("perks") or []),
                len(x.get("page_title") or ""),
            ),
        )
        chosen[key] = items_sorted[0]
    return chosen


def perk_pairs_from_draft_legendary(row: dict) -> list[tuple[str, str]]:
    out = []
    for i in range(1, 6):
        name = (row.get(f"perk_{i}") or "").strip()
        base = (row.get(f"perk_{i}_base") or "").strip()
        if name or base:
            out.append((name, base))
    return out


def perk_pairs_from_draft_mythical(row: dict) -> list[tuple[str, str]]:
    out = []
    for i in range(1, 7):
        name = (row.get(f"perk_{i}") or "").strip()
        base = (row.get(f"perk_{i}_value") or "").strip()
        if name or base:
            out.append((name, base))
    return out


def perk_pairs_from_wiki(extract: dict | None) -> list[tuple[str, str]]:
    if not extract:
        return []
    out = []
    for p in extract.get("perks") or []:
        name = (p.get("name") or "").strip()
        raw = p.get("base_value_raw") or ""
        val, _ = parse_value(raw)
        if name or val:
            out.append((name, val))
    return out


def merge_perks(
    draft_pairs: list[tuple[str, str]],
    wiki_pairs: list[tuple[str, str]],
    *,
    artifact_name: str,
    grade: str,
    conflicts: list[dict],
) -> tuple[list[tuple[str, str]], str]:
    """Prefer draft values when present; fill gaps from wiki; log conflicts."""
    note_bits = []
    if draft_pairs and wiki_pairs:
        # Compare slot-wise where both exist
        for i, ((dn, db), (wn, wb)) in enumerate(
            zip(draft_pairs, wiki_pairs), start=1
        ):
            dnb, _ = parse_value(db)
            wnb, _ = parse_value(wb)
            name_mismatch = (
                dn
                and wn
                and norm_key(dn) != norm_key(wn)
            )
            val_mismatch = dnb and wnb and dnb != wnb
            if name_mismatch or val_mismatch:
                conflicts.append(
                    {
                        "artifact": artifact_name,
                        "grade": grade,
                        "slot": i,
                        "draft_name": dn,
                        "draft_base": db,
                        "wiki_name": wn,
                        "wiki_base": wb,
                        "resolution": "prefer_draft",
                    }
                )
        # Prefer draft entirely when draft has any perks
        note_bits.append("perks_prefer_draft_over_wiki")
        return draft_pairs, ";".join(note_bits)

    if draft_pairs:
        return draft_pairs, ""
    if wiki_pairs:
        note_bits.append("perks_from_wiki")
        return wiki_pairs, ";".join(note_bits)
    return [], ""


def confidence_for(row: dict, perk_count: int, hall_source: str) -> str:
    hc = (row.get("hall_confidence") or "").strip()
    status = (row.get("data_status") or "").strip().casefold()
    if perk_count >= 5 and hc.lower() == "high":
        return "High"
    if perk_count > 0:
        return "Medium"
    if "roster" in status:
        return "Low"
    if hall_source.startswith("wiki"):
        return "Medium"
    return "Low"


def empty_row() -> dict:
    return {k: "" for k in CANONICAL_FIELDS}


def load_wiki_page_index() -> dict[str, Path]:
    """Map normalized artifact name -> preferred legendary (non-Mythical) wiki page path."""
    pages = RAW / "wiki_pages"
    index: dict[str, Path] = {}
    if not pages.exists():
        return index
    for fpath in pages.glob("*.txt"):
        stem = fpath.stem
        if "(Mythical" in stem:
            continue
        if stem in (
            "Legendary_Artifacts",
            "Legendary_War_Artifacts",
            "Mythical_Artifacts",
            "Mythical_War_Artifacts",
            "Library",
            "Technology",
            "Archaeology_Capstone",
        ):
            continue
        name = stem.replace("_", " ")
        key = norm_key(name)
        # Prefer shorter / exact pages; first wins unless overwritten by cleaner match
        if key not in index:
            index[key] = fpath
    return index


def extract_cost_acquisition(text: str) -> dict[str, str]:
    """Pull token cost + acquisition method from wiki prose.

    Never puts IAP/sale dollar prices into ``cost`` — only Legendary Token / coin counts.
    """
    out = {
        "cost": "",
        "cost_currency": "",
        "acquisition_method": "",
        "availability_notes": "",
    }
    if not text:
        return out
    methods: list[str] = []
    notes: list[str] = []
    low = text.casefold()

    # Token / legendary coin costs (not real-money sale prices)
    m = re.search(
        r"(?:legendary\s+coin\s+cost|legendary\s+tokens?\s+cost)\s*:\s*(\d+)",
        text,
        flags=re.I,
    )
    if not m:
        m = re.search(
            r"(?:purchased|purchase|buy|bought)\s+for\s+(\d+)\s+legendary\s+tokens?",
            text,
            flags=re.I,
        )
    if not m:
        m = re.search(r"cost\s+(\d+)\s+tokens?\b", text, flags=re.I)
    if m:
        out["cost"] = m.group(1)
        out["cost_currency"] = "Legendary Tokens"

    if "marco polo" in low:
        methods.append("Marco Polo")
    if re.search(r"limited\s+time\s+sale", text, re.I):
        methods.append("limited time sale")
    if re.search(r"legendary\s+sale", text, re.I):
        methods.append("Legendary sale")
    if re.search(r"chest", text, re.I) and re.search(r"purchas", text, re.I):
        methods.append("Chest sale")
    if re.search(r"real\s+money", text, re.I):
        notes.append("also offered via real-money sale (price not stored in cost)")
        if "Legendary sale" not in methods and "limited time sale" not in methods:
            methods.append("real-money sale")
    elif re.search(r"purchased\s+from\s+sale", text, re.I) or re.search(
        r"purchased\s+from\s+.*sale", text, re.I
    ):
        methods.append("sale")

    # Dedupe preserve order
    seen: set[str] = set()
    uniq = []
    for x in methods:
        if x not in seen:
            seen.add(x)
            uniq.append(x)
    out["acquisition_method"] = "; ".join(uniq)
    out["availability_notes"] = "; ".join(notes)
    return out


def apply_wiki_cost(out: dict, wiki_meta: dict[str, str], *, prefer_existing: bool) -> None:
    """Fill blank cost/acquisition from wiki; never overwrite stronger draft cost."""
    if not wiki_meta:
        return
    if wiki_meta.get("cost") and (not prefer_existing or not (out.get("cost") or "").strip()):
        out["cost"] = wiki_meta["cost"]
        out["cost_currency"] = wiki_meta.get("cost_currency") or "Legendary Tokens"
    if wiki_meta.get("acquisition_method") and (
        not prefer_existing or not (out.get("acquisition_method") or "").strip()
    ):
        out["acquisition_method"] = wiki_meta["acquisition_method"]
    if wiki_meta.get("availability_notes"):
        existing = (out.get("availability_notes") or "").strip()
        note = wiki_meta["availability_notes"]
        if note and note not in existing:
            out["availability_notes"] = f"{existing}; {note}".strip("; ").strip()


def apply_perks_to_row(
    out: dict,
    pairs: list[tuple[str, str]],
    *,
    grade: str,
    derive: bool,
) -> None:
    out["perk_count"] = str(len(pairs))
    for i in range(1, 7):
        if i <= len(pairs):
            name, base = pairs[i - 1]
            b, _ = parse_value(base)
            if not b and base:
                b = base.strip().replace("%", "")
            out[f"perk_{i}_name"] = name
            out[f"perk_{i}_base"] = b
            out[f"perk_{i}_max"] = derive_max(b, grade, derive)
        else:
            out[f"perk_{i}_name"] = ""
            out[f"perk_{i}_base"] = ""
            out[f"perk_{i}_max"] = ""


def build() -> None:
    TEMP.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)

    leg_path = ROOT / "dominations_legendary_snapshot_DRAFT.csv"
    myth_path = ROOT / "dominations_mythicals_verified_partial_DRAFT.csv"
    if not leg_path.exists():
        leg_path = RAW / "dominations_legendary_snapshot_DRAFT.csv"
    if not myth_path.exists():
        myth_path = RAW / "dominations_mythicals_verified_partial_DRAFT.csv"

    legendary = load_csv(leg_path)
    mythical = load_csv(myth_path)
    wiki_raw = json.loads((RAW / "wiki_perk_extract.json").read_text(encoding="utf-8"))
    wiki = choose_wiki_extracts(wiki_raw)
    wiki_pages = load_wiki_page_index()

    conflicts: list[dict] = []
    rows: list[dict] = []
    name_variants: dict[str, set[str]] = defaultdict(set)

    # --- Legendary from draft ---
    for row in legendary:
        name = display_name(row.get("name") or "")
        grade = "Legendary"
        key = (norm_key(name), "legendary")
        out = empty_row()
        out["artifact_id"] = (row.get("artifact_id") or slug_id(name, grade)).lstrip("\ufeff")
        out["name"] = name
        out["alternate_name"] = ""
        hall = (row.get("hall") or "").strip()
        hall_note = ""
        nk = norm_key(name)
        if hall in ("", "TBD", "Unknown") or nk in HALL_OVERRIDES:
            if nk in HALL_OVERRIDES:
                hall, hall_note = HALL_OVERRIDES[nk]
        out["hall"] = hall if hall not in ("TBD",) else "Unknown"
        out["museum_hall"] = ""
        out["grade"] = grade
        out["release_status"] = (row.get("release_status") or "Uncertain").strip()
        out["release_date"] = (row.get("release_date") or "").strip()
        out["cost"] = (row.get("cost") or "").strip()
        out["cost_currency"] = (row.get("currency") or "").strip()
        out["acquisition_method"] = (row.get("acquisition_method") or "").strip()
        out["availability_notes"] = (row.get("data_status") or "").strip()
        out["source_primary"] = (row.get("source") or "").strip()
        wiki_ex = wiki.get(key)
        out["source_secondary"] = (
            f"wiki:{wiki_ex.get('source')}:{wiki_ex.get('page_title')}"
            if wiki_ex
            else ""
        )
        out["source_checked_date"] = CHECKED

        draft_pairs = perk_pairs_from_draft_legendary(row)
        wiki_pairs = perk_pairs_from_wiki(wiki_ex)
        pairs, perk_note = merge_perks(
            draft_pairs,
            wiki_pairs,
            artifact_name=name,
            grade=grade,
            conflicts=conflicts,
        )
        apply_perks_to_row(out, pairs, grade=grade, derive=True)

        wiki_path = wiki_pages.get(nk)
        wiki_meta = {}
        if wiki_path and wiki_path.exists():
            wiki_meta = extract_cost_acquisition(
                wiki_path.read_text(encoding="utf-8", errors="replace")
            )
            apply_wiki_cost(out, wiki_meta, prefer_existing=True)

        notes = []
        if (row.get("notes") or "").strip():
            notes.append(row["notes"].strip())
        if hall_note:
            notes.append(f"hall_set_from={hall_note}")
        if perk_note:
            notes.append(perk_note)
        if any(out[f"perk_{i}_max"] for i in range(1, 7)):
            notes.append("perk_max_derived_base_plus_9")
        if not pairs:
            notes.append("perks_missing")
        if wiki_meta.get("cost") and "cost_from_wiki" not in ";".join(notes):
            if out.get("cost") == wiki_meta.get("cost"):
                notes.append("cost_from_wiki_tokens")
        out["notes"] = "; ".join(notes)
        out["confidence"] = confidence_for(row, len(pairs), hall_note)
        rows.append(out)
        name_variants[norm_key(name)].add(name)

    # --- Mythical from draft ---
    for row in mythical:
        name = display_name(row.get("name") or "")
        grade = "Mythical"
        key = (norm_key(name), "mythical")
        out = empty_row()
        out["artifact_id"] = (row.get("artifact_id") or slug_id(name, grade)).lstrip("\ufeff")
        out["name"] = name
        out["alternate_name"] = ""
        museum = (row.get("hall") or "").strip()
        out["hall"] = "Mythical"
        out["museum_hall"] = museum if museum in ("Main", "War") else museum
        out["grade"] = grade
        out["release_status"] = (row.get("release_status") or "Uncertain").strip()
        out["release_date"] = (row.get("release_date") or "").strip()
        out["cost"] = (row.get("cost") or "").strip()
        out["cost_currency"] = (row.get("currency") or "").strip()
        out["acquisition_method"] = (row.get("acquisition_method") or "").strip()
        out["availability_notes"] = (row.get("data_status") or "").strip()
        out["source_primary"] = (row.get("source") or "").strip()
        wiki_ex = wiki.get(key)
        # Prefer mythical individual page extract
        out["source_secondary"] = (
            f"wiki:{wiki_ex.get('source')}:{wiki_ex.get('page_title')}"
            if wiki_ex
            else ""
        )
        out["source_checked_date"] = CHECKED

        draft_pairs = perk_pairs_from_draft_mythical(row)
        wiki_pairs = perk_pairs_from_wiki(wiki_ex)
        pairs, perk_note = merge_perks(
            draft_pairs,
            wiki_pairs,
            artifact_name=name,
            grade=grade,
            conflicts=conflicts,
        )
        # Mythical: do NOT derive max (+9)
        apply_perks_to_row(out, pairs, grade=grade, derive=False)

        notes = []
        if perk_note:
            notes.append(perk_note)
        if name.casefold() == "british kettle drum" and pairs:
            notes.append("kettle_drum_mythical_from_wiki_statistic_table")
        notes.append("mythical_max_left_blank_not_plus9")
        if not pairs:
            notes.append("perks_missing")
        out["notes"] = "; ".join(notes)
        out["confidence"] = confidence_for(row, len(pairs), "")
        rows.append(out)
        name_variants[norm_key(name)].add(name)

    existing = {(norm_key(r["name"]), r["grade"].casefold()) for r in rows}

    # --- Official mythical extras missing from draft ---
    for cand in OFFICIAL_EXTRA_MYTHICALS:
        name = cand["name"]
        key = (norm_key(name), "mythical")
        if key in existing:
            continue
        out = empty_row()
        out["artifact_id"] = slug_id(name, "Mythical")
        out["name"] = name
        out["hall"] = "Mythical"
        out["museum_hall"] = cand["museum_hall"]
        out["grade"] = "Mythical"
        out["release_status"] = "Released"
        out["cost"] = cand["cost"]
        out["cost_currency"] = cand["cost_currency"]
        out["acquisition_method"] = cand["acquisition_method"]
        out["availability_notes"] = "Official Marco release; missing from verified partial draft"
        out["source_primary"] = cand["source_primary"]
        wiki_ex = wiki.get(key)
        out["source_secondary"] = (
            f"wiki:{wiki_ex.get('source')}:{wiki_ex.get('page_title')}"
            if wiki_ex
            else ""
        )
        out["source_checked_date"] = CHECKED
        # Prefer official perk list from Marco post
        pairs = list(cand["perks"])
        apply_perks_to_row(out, pairs, grade="Mythical", derive=False)
        notes = [cand["notes"], "mythical_max_left_blank_not_plus9", "perks_from_official_bhg"]
        out["notes"] = "; ".join(notes)
        out["confidence"] = "High"
        rows.append(out)
        existing.add(key)
        name_variants[norm_key(name)].add(name)

    # --- Wiki-only legendary candidates ---
    for cand in WIKI_ONLY_LEGENDARY:
        name = cand["name"]
        key = (norm_key(name), "legendary")
        if key in existing:
            continue
        # Also skip if only alternate matches
        out = empty_row()
        out["artifact_id"] = slug_id(name, "Legendary")
        out["name"] = name
        out["alternate_name"] = cand.get("alternate_name") or ""
        out["hall"] = cand["hall"]
        out["museum_hall"] = ""
        out["grade"] = "Legendary"
        out["release_status"] = "Uncertain"
        out["source_checked_date"] = CHECKED
        wiki_ex = wiki.get(key)
        # Try alternate name key
        if not wiki_ex and cand.get("alternate_name"):
            wiki_ex = wiki.get((norm_key(cand["alternate_name"]), "legendary"))
        pairs = perk_pairs_from_wiki(wiki_ex)
        apply_perks_to_row(out, pairs, grade="Legendary", derive=bool(pairs))
        out["source_primary"] = "wiki_candidate"
        out["source_secondary"] = (
            f"wiki:{wiki_ex.get('source')}:{wiki_ex.get('page_title')}"
            if wiki_ex
            else "wiki_nav_or_menu"
        )
        wiki_path = wiki_pages.get(norm_key(name))
        if wiki_path and wiki_path.exists():
            wiki_meta = extract_cost_acquisition(
                wiki_path.read_text(encoding="utf-8", errors="replace")
            )
            apply_wiki_cost(out, wiki_meta, prefer_existing=False)
        notes = [cand["notes"]]
        if pairs:
            notes.append("perks_from_wiki")
            notes.append("perk_max_derived_base_plus_9")
        else:
            notes.append("perks_missing")
        notes.append("uncertain_reverify_2026-09-05_no_dw_hit")
        out["notes"] = "; ".join(notes)
        out["confidence"] = "Low"
        out["availability_notes"] = (
            (out.get("availability_notes") + "; " if out.get("availability_notes") else "")
            + "Wiki-listed candidate; not in verified 110 legendary draft"
        ).strip("; ")
        rows.append(out)
        existing.add(key)

    # Sort: grade Legendary first then Mythical; name
    rows.sort(key=lambda r: (0 if r["grade"] == "Legendary" else 1, r["name"].casefold()))

    # --- perk_name_mapping ---
    raw_names: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        for i in range(1, 7):
            n = r.get(f"perk_{i}_name") or ""
            if n:
                raw_names[norm_key(n)].add(n)

    def canonical_perk_name(variants: set[str]) -> str:
        # Prefer Hitpoints over HP; expand common short forms
        prefs = sorted(variants, key=lambda s: (-len(s), s))
        best = prefs[0]
        repl = [
            (r"\bHP\b", "Hitpoints"),
            (r"\bHit Points\b", "Hitpoints"),
            (r"General's", "Generals'"),
            (r"Generals Hitpoints", "Generals' Hitpoints"),
            (r"Refunt", "Refund"),  # wiki typo seen on Mask of Tutankhamun
        ]
        out = best
        for pat, rep in repl:
            out = re.sub(pat, rep, out)
        return out

    mapping_rows = []
    for nk, variants in sorted(raw_names.items(), key=lambda x: x[0]):
        canon = canonical_perk_name(variants)
        for v in sorted(variants):
            mapping_rows.append(
                {
                    "raw_perk_name": v,
                    "canonical_perk_name": canon,
                    "norm_key": nk,
                }
            )

    # Apply mapping to canonical rows
    map_lookup = {m["raw_perk_name"]: m["canonical_perk_name"] for m in mapping_rows}
    for r in rows:
        for i in range(1, 7):
            n = r.get(f"perk_{i}_name") or ""
            if n in map_lookup:
                r[f"perk_{i}_name"] = map_lookup[n]

    # --- release reconciliation ---
    recon = []
    draft_leg_names = {norm_key(r["name"]) for r in legendary}
    draft_myth_names = {norm_key(r["name"]) for r in mythical}
    for r in rows:
        nk = norm_key(r["name"])
        in_draft = (
            nk in draft_leg_names
            if r["grade"] == "Legendary"
            else nk in draft_myth_names
        )
        wiki_hit = wiki.get((nk, r["grade"].casefold())) is not None
        recon.append(
            {
                "artifact_id": r["artifact_id"],
                "name": r["name"],
                "grade": r["grade"],
                "hall": r["hall"],
                "museum_hall": r["museum_hall"],
                "in_verified_draft": "yes" if in_draft else "no",
                "wiki_perk_extract": "yes" if wiki_hit else "no",
                "release_status": r["release_status"],
                "perk_count": r["perk_count"],
                "evidence_notes": r["notes"],
            }
        )

    # Write conflicts
    (TEMP / "conflicts.json").write_text(
        json.dumps(conflicts, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # Write artifacts.csv
    with (DATA / "artifacts.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CANONICAL_FIELDS)
        w.writeheader()
        w.writerows(rows)

    # Write artifacts.json
    (DATA / "artifacts.json").write_text(
        json.dumps(rows, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    with (DATA / "perk_name_mapping.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(
            fh, fieldnames=["raw_perk_name", "canonical_perk_name", "norm_key"]
        )
        w.writeheader()
        w.writerows(mapping_rows)

    with (DATA / "artifact_release_reconciliation.csv").open(
        "w", encoding="utf-8", newline=""
    ) as fh:
        fields = [
            "artifact_id",
            "name",
            "grade",
            "hall",
            "museum_hall",
            "in_verified_draft",
            "wiki_perk_extract",
            "release_status",
            "perk_count",
            "evidence_notes",
        ]
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(recon)

    # QC summary numbers for reports
    leg_rows = [r for r in rows if r["grade"] == "Legendary"]
    myth_rows = [r for r in rows if r["grade"] == "Mythical"]
    leg_with = sum(1 for r in leg_rows if int(r["perk_count"] or 0) > 0)
    myth_with = sum(1 for r in myth_rows if int(r["perk_count"] or 0) > 0)
    kettle = next(
        (
            r
            for r in myth_rows
            if norm_key(r["name"]) == "british-kettle-drum"
        ),
        None,
    )
    tbd_fixed = [
        r
        for r in leg_rows
        if norm_key(r["name"])
        in HALL_OVERRIDES
    ]

    completeness = f"""# Completeness report

**Generated:** {CHECKED}  
**Builder:** `scripts/build_canonical.py`

## Counts

| Set | Rows | With ≥1 perk | Full expected slots |
|-----|------|--------------|---------------------|
| Legendary | {len(leg_rows)} | {leg_with} | 5 perks ideal; {sum(1 for r in leg_rows if int(r['perk_count'] or 0) >= 5)} have ≥5 |
| Mythical | {len(myth_rows)} | {myth_with} | 6 perks ideal; {sum(1 for r in myth_rows if int(r['perk_count'] or 0) >= 6)} have ≥6 |
| **Total** | **{len(rows)}** | **{leg_with + myth_with}** | |

## Draft vs canonical

- Legendary draft base: 110 → canonical legendary: {len(leg_rows)} (includes wiki-only Uncertain candidates)
- Mythical draft base: 29 → canonical mythical: {len(myth_rows)} (includes official June 2026 Marco extras if missing from draft)

## Official sweep (DominationsWorld, 2026-09-05)

- Confirmed on official posts: British Kettle Drum, Analytical Engine, First Strike Star, Mahiole, DomiNations Army Helmet
- June 2026 Marco's Wares mythicals **General Pershing's Bas-Relief**, **Joyeuse Sword**, **Silla Gold Crown** were missing from draft → added as Released
- Wiki-only legendaries re-verified 2026-09-05 (Fandom API + DW `?s=` + prior sweep): **no** DominationsWorld/BHG hits → remain Uncertain
- Cake / Dilophosaurus / Tutankhamun: Fandom pages + statistic_table perks exist
- Benin / Lyre / Mona Lisa / Dodecahedron / Dung-Dkar: **no Fandom page** (nav phantoms)
- See `data/temp/official_sweep_posts.json`, `data/temp/uncertain_reverify.json`

## Targeted fixes this build

- British Kettle Drum mythical perks: {"OK " + kettle['perk_count'] if kettle else "MISSING"}
- Hall overrides for prior TBD: {", ".join(f"{r['name']}={r['hall']}" for r in tbd_fixed)}
- Wiki statistic_table parser fixed (same-line `||` cells, rowspan, `||-N%` row split) → filled most legendary perk gaps
- `guess_grade` no longer treats historical prose "mythical" as Mythical grade
- Token costs / acquisition filled from wiki when present (no IAP sale prices in `cost`)

## Gaps (not complete)

- Legendary perk gap remaining: {len(leg_rows) - leg_with} (Leftwich Trophy empty wiki table + 5 nav-phantom Uncertain)
- Legendary token `cost` sparsely documented on wiki ({sum(1 for r in leg_rows if (r.get('cost') or '').strip())} filled); acquisition_method from wiki prose where stated
- Mythical max values intentionally blank (announcement numbers; no blind +9)
- Wiki-only legendaries marked `Uncertain` until BHG/DominationsWorld confirmation
- dominations-info.com API still 404; not used as primary

## Outputs

- `data/artifacts.csv`
- `data/artifacts.json`
- `data/perk_name_mapping.csv`
- `data/artifact_release_reconciliation.csv`
- `data/temp/conflicts.json` ({len(conflicts)} draft-vs-wiki conflicts, draft preferred)
"""

    discrepancies = f"""# Discrepancies

**Generated:** {CHECKED}

## Draft vs wiki perk conflicts

Count: **{len(conflicts)}** (logged in `data/temp/conflicts.json`).  
Resolution rule: **prefer draft/official** over wiki when both present.

"""
    if conflicts:
        discrepancies += "| Artifact | Slot | Draft | Wiki |\n|---|---|---|---|\n"
        for c in conflicts[:40]:
            discrepancies += (
                f"| {c['artifact']} ({c['grade']}) | {c['slot']} | "
                f"{c['draft_name']} {c['draft_base']} | "
                f"{c['wiki_name']} {c['wiki_base']} |\n"
            )
        if len(conflicts) > 40:
            discrepancies += f"\n… and {len(conflicts) - 40} more in conflicts.json\n"
    else:
        discrepancies += "No slot-wise conflicts where both draft and wiki had values.\n"

    discrepancies += """
## Hall assignments (formerly TBD)

| Artifact | Hall | Evidence |
|----------|------|----------|
| Analytical Engine | War | wiki Legendary_War_Artifacts |
| DomiNations Army Helmet | War | wiki Legendary_War_Artifacts |
| Mahiole | War | wiki Legendary_War_Artifacts |
| First Strike Star | Main | wiki Legendary_Artifacts |

Still prefer official BHG confirmation in notes when found.

## Roster / release

- Draft treated all 110 legendaries as Released; wiki-only extras added as Uncertain.
- Mythical wiki lists many more names than the 29 verified draft rows — extras **not** auto-added as released.
- Nav-only names (Benin Royal Ivory Mask, Golden Lyre of Ur, Mona Lisa, Roman Dodecahedron, Tibetan Dung-Dkar): Fandom API miss + no DW hit in 2026-09-05 reverify — kept Uncertain.
- Cake / Dilophosaurus / Tutankhamun: Fandom pages exist; still Uncertain without BHG/DW.
- Leftwich Trophy: roster Released but wiki statistic table empty; perks still missing.
- Ignore meta pages: Archaeology Capstone, Library, Technology.

## Known data quirks

- Mythical draft values may be announcement/display (possibly max); max left blank.
- Legendary `perk_*_max` = |base|+9 (same sign); skipped for |base|==1 specials; noted in `notes`.
- Duplicate perk names on one artifact can be real.
- Hitpoints vs HP normalized via `perk_name_mapping.csv`.
- Mythical War quick_view for British Kettle Drum was wrong (legendary 5-perk set); statistic_table used.
"""

    (REPORTS / "completeness_report.md").write_text(completeness, encoding="utf-8")
    (REPORTS / "discrepancies.md").write_text(discrepancies, encoding="utf-8")

    summary = {
        "legendary": len(leg_rows),
        "mythical": len(myth_rows),
        "total": len(rows),
        "legendary_with_perks": leg_with,
        "mythical_with_perks": myth_with,
        "conflicts": len(conflicts),
        "kettle_drum_perks": int(kettle["perk_count"]) if kettle else 0,
        "mapping_rows": len(mapping_rows),
    }
    (TEMP / "build_summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    build()
