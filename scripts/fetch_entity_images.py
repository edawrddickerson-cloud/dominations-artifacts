# -*- coding: utf-8 -*-
"""Fetch Fandom pageimage URLs for artifacts, army units, and councilors.

Writes:
  data/raw/artifact_images.json  (keyed by artifact_id)
  data/raw/army_unit_images.json (keyed by unit family name)
  data/raw/councilor_images.json (keyed by councilor id)
  ui/data/ copies of each
"""
from __future__ import annotations

import argparse
import json
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(r"c:\Projects\Dominations Artifacts")
DATA = ROOT / "data"
RAW = DATA / "raw"
UI_DATA = ROOT / "ui" / "data"
ARTIFACTS_PATH = DATA / "artifacts.json"
COUNCILORS_PATH = UI_DATA / "councilors.json"
API = "https://dominations.fandom.com/api.php"
USER_AGENT = "DomiNationsArtifactResearch/1.0"
THUMB_SIZE = 400
DELAY = 0.25
BATCH = 40

# Canonical display name -> wiki title(s) to try, in order.
ARTIFACT_ALIASES: dict[str, list[str]] = {
    "DomiNations Army Helmet": ["Dominations Army Helmet"],
}

# After base title fails, try these suffixes (mythical twin pages).
MYTHICAL_SUFFIXES = (
    "(Mythical Artifacts)",
    "(Mythical War Artifacts)",
)

ARMY_UNIT_FAMILIES = [
    "Bazooka",
    "Heavy Cavalry",
    "Heavy Infantry",
    "Machine Gun Infantry",
    "Mortar Troop",
    "Raider",
    "Ranged Infantry",
    "Wall Miner",
    "Wall Sapper",
    "APC",
    "Armored Car",
    "Assault Vehicle",
    "Commando",
    "Heavy Tank",
    "MRL",
    "Ranged Siege",
    "Supply Vehicle",
    "Attack Helicopter",
    "Bomber",
    "Fighter",
    "Paratrooper",
]

ARMY_ALIASES: dict[str, list[str]] = {
    "Commando": ["Commandos", "Commando", "Guerrilla"],
    "Mortar Troop": ["Mortar", "Mortar Troop"],
    "Supply Vehicle": ["Supply Vehicles", "Supply Vehicle"],
    "Raider": ["Raiders", "Raider"],
    "Bomber": ["Bombers", "Bomber"],
    "Fighter": ["Fighters", "Fighter"],
    "Paratrooper": ["Elite Paratroopers", "Paratrooper", "Paratroopers"],
}


def api_query(**params: object) -> dict:
    params = dict(params)
    params["format"] = "json"
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def pageimages_batch(titles: list[str]) -> dict[str, dict]:
    """Return {requested_title: {url, source_title}} for titles that have thumbs."""
    out: dict[str, dict] = {}
    if not titles:
        return out
    data = api_query(
        action="query",
        prop="pageimages",
        piprop="thumbnail",
        pithumbsize=THUMB_SIZE,
        titles="|".join(titles),
        redirects=1,
    )
    # Map normalized title -> page; also track redirects from->to
    redirects = {
        r["from"]: r["to"] for r in data.get("query", {}).get("redirects", [])
    }
    normalized = {
        n["from"]: n["to"] for n in data.get("query", {}).get("normalized", [])
    }
    pages_by_title = {}
    for page in data.get("query", {}).get("pages", {}).values():
        title = page.get("title")
        if title:
            pages_by_title[title] = page

    for req_title in titles:
        resolved = req_title
        if resolved in normalized:
            resolved = normalized[resolved]
        if resolved in redirects:
            resolved = redirects[resolved]
        page = pages_by_title.get(resolved)
        if not page:
            continue
        thumb = page.get("thumbnail") or {}
        url = thumb.get("source")
        if url:
            out[req_title] = {"url": url, "source_title": page.get("title", resolved)}
    return out


def resolve_titles(candidates: list[str]) -> dict | None:
    """Try candidates in order; return first hit {url, source_title}."""
    # Batch all unique candidates we still need — try in order after fetch.
    uniq = []
    seen = set()
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            uniq.append(c)
    found = pageimages_batch(uniq)
    for c in uniq:
        if c in found:
            return found[c]
    return None


def artifact_candidates(name: str) -> list[str]:
    aliases = ARTIFACT_ALIASES.get(name, [])
    cands = [name] + list(aliases)
    # Wiki uses both "Name (Mythical…)" and compact "Name(Mythical…)"
    for suf in MYTHICAL_SUFFIXES:
        cands.append(f"{name} {suf}")
        cands.append(f"{name}{suf}")
    out = []
    seen = set()
    for c in cands:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


def army_candidates(family: str) -> list[str]:
    return ARMY_ALIASES.get(family, [family])


def councilor_candidates(name: str, source_url: str = "") -> list[str]:
    cands: list[str] = []
    if source_url:
        # https://dominations.fandom.com/wiki/Alcibiades → Alcibiades
        path = urllib.parse.urlparse(source_url).path
        if "/wiki/" in path:
            title = urllib.parse.unquote(path.split("/wiki/", 1)[1].replace("_", " "))
            if title:
                cands.append(title)
    if name:
        cands.append(name)
    out: list[str] = []
    seen: set[str] = set()
    for c in cands:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def fetch_for_names(
    names: list[str], candidate_fn
) -> tuple[dict[str, dict], list[str]]:
    """Map canonical name -> image info. Returns (hits, misses)."""
    hits: dict[str, dict] = {}
    misses: list[str] = []
    for i, name in enumerate(names):
        info = resolve_titles(candidate_fn(name))
        if info:
            hits[name] = info
        else:
            misses.append(name)
        if i + 1 < len(names):
            time.sleep(DELAY)
        if (i + 1) % 20 == 0:
            print(f"  … {i + 1}/{len(names)}")
    return hits, misses


def fetch_councilor_images(
    councilors: list[dict],
) -> tuple[dict[str, dict], list[str]]:
    """Map councilor id -> image info. Returns (hits, misses by name)."""
    hits: dict[str, dict] = {}
    misses: list[str] = []
    for i, row in enumerate(councilors):
        cid = (row.get("id") or "").strip()
        name = (row.get("name") or "").strip()
        source_url = (row.get("sourceUrl") or "").strip()
        if not cid or not name:
            continue
        info = resolve_titles(councilor_candidates(name, source_url))
        if info:
            hits[cid] = {
                "url": info["url"],
                "source_title": info["source_title"],
                "name": name,
            }
        else:
            misses.append(name)
        if i + 1 < len(councilors):
            time.sleep(DELAY)
        if (i + 1) % 20 == 0:
            print(f"  … {i + 1}/{len(councilors)}")
    return hits, misses


def write_image_doc(path: Path, images: dict) -> None:
    payload_meta = {
        "source": "https://dominations.fandom.com/api.php",
        "thumb_size": THUMB_SIZE,
    }
    doc = {"meta": payload_meta, "images": images}
    path.write_text(
        json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    shutil.copy2(path, UI_DATA / path.name)
    print(f"Wrote {path}")
    print(f"Copied to {UI_DATA / path.name}")


def fetch_artifacts() -> None:
    arts = json.loads(ARTIFACTS_PATH.read_text(encoding="utf-8"))
    if not isinstance(arts, list):
        raise SystemExit("artifacts.json is not an array")

    unique_names = sorted({(a.get("name") or "").strip() for a in arts if a.get("name")})
    print(f"Artifacts: resolving images for {len(unique_names)} unique names…")
    by_name, art_misses = fetch_for_names(unique_names, artifact_candidates)

    artifact_images: dict[str, dict] = {}
    for row in arts:
        aid = (row.get("artifact_id") or "").strip()
        name = (row.get("name") or "").strip()
        if not aid or not name:
            continue
        info = by_name.get(name)
        if info:
            artifact_images[aid] = {
                "url": info["url"],
                "source_title": info["source_title"],
                "name": name,
            }

    print(
        f"Artifacts: {len(by_name)}/{len(unique_names)} names, "
        f"{len(artifact_images)}/{len(arts)} rows with images"
    )
    if art_misses:
        print("  missing names:", ", ".join(art_misses))
    write_image_doc(RAW / "artifact_images.json", artifact_images)


def fetch_army() -> None:
    print(f"Army: resolving images for {len(ARMY_UNIT_FAMILIES)} families…")
    army_images, army_misses = fetch_for_names(ARMY_UNIT_FAMILIES, army_candidates)
    army_out = {
        fam: {"url": info["url"], "source_title": info["source_title"]}
        for fam, info in army_images.items()
    }
    print(f"Army: {len(army_out)}/{len(ARMY_UNIT_FAMILIES)} with images")
    if army_misses:
        print("  missing families:", ", ".join(army_misses))
    write_image_doc(RAW / "army_unit_images.json", army_out)


def fetch_council() -> None:
    council_doc_raw = json.loads(COUNCILORS_PATH.read_text(encoding="utf-8"))
    councilors = council_doc_raw.get("councilors") if isinstance(council_doc_raw, dict) else None
    if not isinstance(councilors, list):
        raise SystemExit("councilors.json missing councilors array")
    print(f"Council: resolving images for {len(councilors)} councilors…")
    councilor_images, council_misses = fetch_councilor_images(councilors)
    print(f"Council: {len(councilor_images)}/{len(councilors)} with images")
    if council_misses:
        print("  missing names:", ", ".join(council_misses))
    write_image_doc(RAW / "councilor_images.json", councilor_images)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only",
        choices=("artifacts", "army", "council", "all"),
        default="all",
        help="Fetch a single entity set (default: all)",
    )
    args = parser.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)
    UI_DATA.mkdir(parents=True, exist_ok=True)

    if args.only in ("artifacts", "all"):
        fetch_artifacts()
    if args.only in ("army", "all"):
        fetch_army()
    if args.only in ("council", "all"):
        fetch_council()


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as e:
        raise SystemExit(f"Network error: {e}") from e
