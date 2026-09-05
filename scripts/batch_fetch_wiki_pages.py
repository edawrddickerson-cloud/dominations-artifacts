# -*- coding: utf-8 -*-
"""Batch-download DomiNations Fandom wiki pages and extract perk tables."""
from __future__ import annotations

import csv
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(r"c:\Projects\Dominations Artifacts")
RAW = ROOT / "data" / "raw"
OUT_DIR = RAW / "wiki_pages"
MANIFEST_PATH = RAW / "wiki_pages_manifest.json"
PERK_PATH = RAW / "wiki_perk_extract.json"
USER_AGENT = "DomiNationsArtifactResearch/1.0"
API = "https://dominations.fandom.com/api.php"
DELAY = 0.3

OUT_DIR.mkdir(parents=True, exist_ok=True)


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def extract_wiki_links(text: str) -> list[str]:
    titles = []
    for m in re.finditer(r"\[\[([^\]|#]+)", text):
        title = m.group(1).strip()
        if not title:
            continue
        low = title.lower()
        if low.startswith(("file:", "image:", "category:", "template:", ":")):
            continue
        titles.append(title)
    return titles


def sanitize_filename(title: str) -> str:
    name = title.replace("/", "_").replace("\\", "_")
    name = re.sub(r'[<>:"|?*]', "_", name)
    name = name.replace(" ", "_")
    name = re.sub(r"\s+", "_", name)
    if len(name) > 180:
        name = name[:180]
    return name + ".txt"


def strip_wiki(s: str) -> str:
    s = re.sub(r"\[\[[^\|\]]*\|([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"'{2,}", "", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\{\{[^}]+\}\}", "", s)
    return s.strip()


def guess_grade(title: str, text: str) -> str:
    t = (title + " " + text[:2000]).lower()
    if "mythical" in t:
        return "Mythical"
    if "legendary" in t:
        return "Legendary"
    return "Unknown"


def guess_hall(title: str, text: str) -> str:
    t = (title + " " + text[:2500]).lower()
    if "mythical war" in t or "legendary war" in t:
        return "War"
    if "war artifact" in t:
        return "War"
    if "mythical artifact" in t or "legendary artifact" in t:
        return "Main"
    return "Unknown"


def clean_artifact_name(title: str) -> str:
    name = re.sub(r"\(Mythical(?: War)? Artifacts\)$", "", title).strip()
    return name


def parse_statistic_table(text: str) -> list[dict]:
    perks = []
    for m in re.finditer(
        r"\{\|\s*class=\"[^\"]*\"[\s\S]*?\|\}",
        text,
        flags=re.IGNORECASE,
    ):
        block = m.group(0)
        if not re.search(r"Benefit\s*Name", block, re.I):
            continue
        if not re.search(r"Base\s*Stat", block, re.I):
            continue
        rows = re.split(r"\|-", block)
        for row in rows:
            cells = []
            for line in row.splitlines():
                line = line.strip()
                if not line.startswith("|") and not line.startswith("!"):
                    continue
                if line.startswith("|+") or line.startswith("{|") or line.startswith("|}"):
                    continue
                cell = re.sub(r"^[\|!]+\s*(?:scope=\"[^\"]*\"\s*(?:\|)?)?", "", line)
                cell = cell.strip()
                if cell.lower() in ("benefit name", "base stat"):
                    continue
                if cell.startswith("class=") or cell.startswith("colspan") or cell.startswith("rowspan"):
                    continue
                cells.append(strip_wiki(cell))
            cells = [c for c in cells if c]
            if len(cells) >= 2:
                name, val = cells[0], cells[1]
                if name.lower() in ("benefit name", "base stat"):
                    continue
                perks.append({"name": name, "base_value_raw": val})
    return perks


def parse_quick_view(text: str, source_title: str) -> list[dict]:
    results = []
    idx = text.lower().find("quick view")
    if idx < 0:
        return results
    chunk = text[idx:]
    m = re.search(r"\{\|\s*class=\"fandom-table\"[\s\S]*?\|\}", chunk, re.I)
    if not m:
        return results
    table = m.group(0)
    rows = re.split(r"\|-", table)
    grade = guess_grade(source_title, text)
    hall = guess_hall(source_title, text)
    for row in rows[1:]:
        cells = []
        for line in row.splitlines():
            line = line.strip()
            if not line.startswith("|"):
                continue
            if line.startswith("|}") or line.startswith("{|"):
                continue
            cell = line.lstrip("|").strip()
            cell = re.sub(r"^colspan=\"[^\"]*\"\s*(?:rowspan=\"[^\"]*\"\s*)?\|?", "", cell)
            cell = re.sub(r"^rowspan=\"[^\"]*\"\s*(?:colspan=\"[^\"]*\"\s*)?\|?", "", cell)
            cell = strip_wiki(re.sub(r"</?small>", "", cell, flags=re.I))
            if cell:
                cells.append(cell)
        if len(cells) < 3:
            continue
        art_name = cells[0]
        if art_name.lower() in ("artifacts", "first line", "artifact"):
            continue
        perks = []
        rest = cells[1:]
        for i in range(0, len(rest) - 1, 2):
            pname, pval = rest[i], rest[i + 1]
            if not pname:
                continue
            perks.append({"name": pname, "base_value_raw": pval})
        results.append(
            {
                "page_title": source_title,
                "artifact_name": art_name,
                "grade_guess": grade,
                "hall_guess": hall,
                "perks": perks,
                "source": "quick_view",
            }
        )
    return results


def fetch_wikitext(title: str) -> tuple[str | None, str | None]:
    params = {
        "action": "parse",
        "page": title,
        "prop": "wikitext",
        "format": "json",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if "error" in data:
            return None, data["error"].get("info") or str(data["error"])
        wt = data.get("parse", {}).get("wikitext", {})
        if isinstance(wt, dict):
            wt = wt.get("*", "")
        return wt or "", None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except Exception as e:
        return None, str(e)


def collect_titles() -> list[str]:
    titles: list[str] = []
    seen: set[str] = set()

    def add(t: str):
        t = t.strip()
        if not t or t in seen:
            return
        seen.add(t)
        titles.append(t)

    roster_files = [
        "raw_wiki_Legendary_Artifacts.txt",
        "raw_wiki_Legendary_War_Artifacts.txt",
        "raw_wiki_Mythical_Artifacts.txt",
        "raw_wiki_Mythical_War_Artifacts.txt",
        "raw_wiki_Template_LegendaryArtifactsMenu.txt",
        "raw_wiki_Template_MythicalArtifactsMenu.txt",
    ]
    for fn in roster_files:
        text = read_text(RAW / fn)
        for link in extract_wiki_links(text):
            add(link)

    for csv_name in [
        "dominations_legendary_snapshot_DRAFT.csv",
        "dominations_mythicals_verified_partial_DRAFT.csv",
    ]:
        for p in [RAW / csv_name, ROOT / csv_name]:
            if not p.exists():
                continue
            with p.open(encoding="utf-8-sig", newline="") as fh:
                for row in csv.DictReader(fh):
                    name = (row.get("name") or "").strip()
                    if not name:
                        continue
                    hall = (row.get("hall") or "").strip().lower()
                    rarity = (row.get("rarity") or "").strip().lower()
                    add(name)
                    if "mythical" in rarity:
                        if "war" in hall:
                            add(f"{name}(Mythical War Artifacts)")
                        else:
                            add(f"{name}(Mythical Artifacts)")
                            add(f"{name}(Mythical War Artifacts)")

    required = [
        "British Kettle Drum(Mythical War Artifacts)",
        "First Strike Star",
        "Analytical Engine",
        "DomiNations Army Helmet",
        "Dominations Army Helmet",
        "Mahiole",
        "11th Anniversary Cake",
        "Dilophosaurus Skull",
        "Mask of Tutankhamun",
        "Benin Royal Ivory Mask",
        "Golden Lyre of Ur",
        "Mona Lisa",
        "Roman Dodechedron",
        "Roman Dodecahedron",
        "Tibetan Dung-Dkar",
        "Legendary Artifacts",
        "Legendary War Artifacts",
        "Mythical Artifacts",
        "Mythical War Artifacts",
    ]
    for t in required:
        add(t)

    base_from_links = list(titles)
    for t in base_from_links:
        if t.endswith("(Mythical Artifacts)"):
            add(clean_artifact_name(t))
        elif t.endswith("(Mythical War Artifacts)"):
            add(clean_artifact_name(t))
        else:
            if t not in (
                "Legendary Artifacts",
                "Legendary War Artifacts",
                "Mythical Artifacts",
                "Mythical War Artifacts",
            ):
                add(f"{t}(Mythical Artifacts)")
                add(f"{t}(Mythical War Artifacts)")

    if "Dominations Army Helmet" in seen:
        add("DomiNations Army Helmet")

    return titles


def main():
    titles = collect_titles()
    print(f"Unique titles to consider: {len(titles)}")

    manifest = []
    fetched_ok = 0
    fetched_fail = 0
    skipped_existing = 0

    for i, title in enumerate(titles):
        fname = sanitize_filename(title)
        fpath = OUT_DIR / fname
        entry = {
            "title": title,
            "filename": fname,
            "ok": False,
            "error": None,
            "length": 0,
            "skipped_existing": False,
        }

        if fpath.exists() and fpath.stat().st_size > 0:
            text = fpath.read_text(encoding="utf-8", errors="replace")
            entry["ok"] = True
            entry["length"] = len(text)
            entry["skipped_existing"] = True
            skipped_existing += 1
            fetched_ok += 1
            manifest.append(entry)
            continue

        wt, err = fetch_wikitext(title)
        time.sleep(DELAY)
        if err is not None or wt is None:
            entry["error"] = err or "unknown"
            fetched_fail += 1
            manifest.append(entry)
            if (i + 1) % 25 == 0:
                print(f"  progress {i+1}/{len(titles)} ok={fetched_ok} fail={fetched_fail}")
            continue

        fpath.write_text(wt, encoding="utf-8")
        entry["ok"] = True
        entry["length"] = len(wt)
        fetched_ok += 1
        manifest.append(entry)
        if (i + 1) % 25 == 0:
            print(f"  progress {i+1}/{len(titles)} ok={fetched_ok} fail={fetched_fail}")

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Manifest written: {MANIFEST_PATH}")
    print(f"Fetched/cached ok={fetched_ok} fail={fetched_fail} skipped_existing={skipped_existing}")

    perk_records = []
    seen_keys: set[tuple] = set()

    def add_record(rec: dict):
        key = (rec.get("artifact_name"), rec.get("grade_guess"), rec.get("hall_guess"), rec.get("source"))
        perk_sig = tuple((p["name"], p["base_value_raw"]) for p in rec.get("perks") or [])
        full = key + (perk_sig,)
        if full in seen_keys:
            return
        seen_keys.add(full)
        perk_records.append(rec)

    for entry in manifest:
        if not entry.get("ok"):
            continue
        fpath = OUT_DIR / entry["filename"]
        if not fpath.exists():
            continue
        text = fpath.read_text(encoding="utf-8", errors="replace")
        title = entry["title"]

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

    PERK_PATH.write_text(json.dumps(perk_records, indent=2, ensure_ascii=False), encoding="utf-8")
    with_perks = sum(1 for r in perk_records if r.get("perks"))
    print(f"Perk extract: {len(perk_records)} records, {with_perks} with perks -> {PERK_PATH}")

    draft_names = set()
    for csv_name in [
        "dominations_legendary_snapshot_DRAFT.csv",
        "dominations_mythicals_verified_partial_DRAFT.csv",
    ]:
        for p in [RAW / csv_name, ROOT / csv_name]:
            if not p.exists():
                continue
            with p.open(encoding="utf-8-sig", newline="") as fh:
                for row in csv.DictReader(fh):
                    n = (row.get("name") or "").strip()
                    if n:
                        draft_names.add(n.casefold())

    wiki_names = set()
    for r in perk_records:
        n = (r.get("artifact_name") or "").strip()
        if n and n not in (
            "Legendary Artifacts",
            "Legendary War Artifacts",
            "Mythical Artifacts",
            "Mythical War Artifacts",
        ):
            wiki_names.add(n)

    for entry in manifest:
        if not entry.get("ok"):
            continue
        t = entry["title"]
        if t in (
            "Legendary Artifacts",
            "Legendary War Artifacts",
            "Mythical Artifacts",
            "Mythical War Artifacts",
        ):
            continue
        wiki_names.add(clean_artifact_name(t))

    wiki_only = sorted(n for n in wiki_names if n.casefold() not in draft_names)

    bkd = [
        r
        for r in perk_records
        if "British Kettle Drum" in (r.get("artifact_name") or "")
        or "British Kettle Drum" in (r.get("page_title") or "")
    ]
    bkd_page = next(
        (e for e in manifest if e["title"] == "British Kettle Drum(Mythical War Artifacts)"),
        None,
    )

    summary = {
        "titles_attempted": len(titles),
        "ok": fetched_ok,
        "failed": fetched_fail,
        "skipped_existing": skipped_existing,
        "perk_records": len(perk_records),
        "perk_records_with_perks": with_perks,
        "wiki_only_names_count": len(wiki_only),
        "wiki_only_names": wiki_only,
        "british_kettle_drum_mythical": {
            "page_manifest": bkd_page,
            "perk_records": bkd,
        },
        "failed_titles": [e["title"] for e in manifest if not e.get("ok")],
    }
    summary_path = RAW / "wiki_batch_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Summary written: {summary_path}")
    print(
        json.dumps(
            {
                k: summary[k]
                for k in summary
                if k not in ("wiki_only_names", "failed_titles", "british_kettle_drum_mythical")
            },
            indent=2,
        )
    )
    print("wiki_only sample:", wiki_only[:40])
    print(
        "BKD mythical:",
        json.dumps(summary["british_kettle_drum_mythical"], indent=2, ensure_ascii=False)[:2000],
    )
    print(
        "failed count sample:",
        len(summary["failed_titles"]),
        summary["failed_titles"][:30],
    )


if __name__ == "__main__":
    main()
