# -*- coding: utf-8 -*-
"""Re-extract wiki perk tables from cached pages (no network)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(r"c:\Projects\Dominations Artifacts")
sys.path.insert(0, str(ROOT / "scripts"))
from batch_fetch_wiki_pages import (  # noqa: E402
    clean_artifact_name,
    guess_grade,
    guess_hall,
    parse_quick_view,
    parse_statistic_table,
)

RAW = ROOT / "data" / "raw"
OUT_DIR = RAW / "wiki_pages"
MANIFEST_PATH = RAW / "wiki_pages_manifest.json"
PERK_PATH = RAW / "wiki_perk_extract.json"


def title_from_filename(fname: str) -> str:
    stem = Path(fname).stem
    return stem.replace("_", " ")


def main():
    manifest = []
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    by_file = {e.get("filename"): e for e in manifest if e.get("filename")}

    # Include every cached page (newly fetched files may not be in manifest yet)
    entries: list[dict] = []
    seen_files: set[str] = set()
    for entry in manifest:
        if not entry.get("ok"):
            continue
        fname = entry.get("filename") or ""
        if not fname:
            continue
        fpath = OUT_DIR / fname
        if fpath.exists():
            entries.append(entry)
            seen_files.add(fname)
    for fpath in sorted(OUT_DIR.glob("*.txt")):
        if fpath.name in seen_files:
            continue
        entries.append(
            {
                "title": title_from_filename(fpath.name),
                "filename": fpath.name,
                "ok": True,
            }
        )

    perk_records = []
    seen_keys: set[tuple] = set()

    def add_record(rec: dict):
        key = (
            rec.get("artifact_name"),
            rec.get("grade_guess"),
            rec.get("hall_guess"),
            rec.get("source"),
        )
        perk_sig = tuple(
            (p["name"], p["base_value_raw"]) for p in rec.get("perks") or []
        )
        full = key + (perk_sig,)
        if full in seen_keys:
            return
        seen_keys.add(full)
        perk_records.append(rec)

    for entry in entries:
        fpath = OUT_DIR / entry["filename"]
        if not fpath.exists():
            continue
        text = fpath.read_text(encoding="utf-8", errors="replace")
        title = entry.get("title") or title_from_filename(entry["filename"])
        # Prefer manifest title when filename decoding is lossy
        if entry["filename"] in by_file and by_file[entry["filename"]].get("title"):
            title = by_file[entry["filename"]]["title"]

        if title in (
            "Legendary Artifacts",
            "Legendary War Artifacts",
            "Mythical Artifacts",
            "Mythical War Artifacts",
        ) or "Quick View" in text:
            for qv in parse_quick_view(text, title):
                add_record(qv)

        perks = parse_statistic_table(text)
        if perks:
            add_record(
                {
                    "page_title": title,
                    "artifact_name": clean_artifact_name(title),
                    "grade_guess": guess_grade(title, text),
                    "hall_guess": guess_hall(title, text),
                    "perks": perks,
                    "source": "statistic_table",
                }
            )

    PERK_PATH.write_text(
        json.dumps(perk_records, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    with_perks = sum(1 for r in perk_records if r.get("perks"))
    legendary = [
        r
        for r in perk_records
        if (r.get("grade_guess") or "").casefold() == "legendary"
        and r.get("source") == "statistic_table"
    ]
    print(
        f"Perk extract: {len(perk_records)} records, {with_perks} with perks "
        f"({len(legendary)} legendary statistic_table) -> {PERK_PATH}"
    )
    # Spot-check Antikythera / Augustus rowspan / Dilophosaurus
    for needle in (
        "Antikythera Mechanism",
        "Augustus Statue Muscle Cuirass",
        "Dilophosaurus Skull",
        "Battersea Shield",
        "Ashanti Kuduo",
    ):
        hits = [
            r
            for r in perk_records
            if r.get("artifact_name") == needle
            and r.get("source") == "statistic_table"
        ]
        for h in hits:
            print(
                f"  {needle} grade={h['grade_guess']} n={len(h['perks'])} "
                f"first={h['perks'][:2]} last={h['perks'][-1:]}"
            )


if __name__ == "__main__":
    main()
