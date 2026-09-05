# -*- coding: utf-8 -*-
"""Fetch missing Uncertain wiki pages + search DominationsWorld / Fandom."""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(r"c:\Projects\Dominations Artifacts")
RAW = ROOT / "data" / "raw"
OUT = RAW / "wiki_pages"
TEMP = ROOT / "data" / "temp"
UA = "DomiNationsArtifactResearch/1.0"
API = "https://dominations.fandom.com/api.php"
DELAY = 0.35

TITLES = [
    "Benin Royal Ivory Mask",
    "Golden Lyre of Ur",
    "Mona Lisa",
    "Roman Dodecahedron",
    "Roman Dodechedron",
    "Tibetan Dung-Dkar",
    "Tibetan Dung Dkar",
]

UNCERTAIN = [
    "11th Anniversary Cake",
    "Dilophosaurus Skull",
    "Mask of Tutankhamun",
    "Benin Royal Ivory Mask",
    "Golden Lyre of Ur",
    "Mona Lisa",
    "Roman Dodecahedron",
    "Tibetan Dung-Dkar",
]

DW_URLS = [
    "https://www.dominationsworld.com/blog/",
    "https://www.dominationsworld.com/?s=",
]


def http_get(url: str, timeout: int = 60) -> tuple[str | None, str | None]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace"), None
    except Exception as e:
        return None, str(e)


def wiki_api(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode(params)
    body, err = http_get(url)
    if err or body is None:
        return {"error": err}
    return json.loads(body)


def sanitize_filename(title: str) -> str:
    name = title.replace("/", "_").replace("\\", "_")
    name = re.sub(r'[<>:"|?*]', "_", name)
    name = name.replace(" ", "_")
    if len(name) > 180:
        name = name[:180]
    return name + ".txt"


def fetch_wikitext(title: str) -> tuple[str | None, str | None]:
    data = wiki_api(
        {
            "action": "parse",
            "page": title,
            "prop": "wikitext",
            "format": "json",
        }
    )
    if "error" in data:
        err = data["error"]
        if isinstance(err, dict):
            return None, err.get("info") or str(err)
        return None, str(err)
    wt = data.get("parse", {}).get("wikitext", {})
    if isinstance(wt, dict):
        wt = wt.get("*", "")
    return wt or "", None


def main():
    TEMP.mkdir(parents=True, exist_ok=True)
    results = {"wiki_fetch": [], "wiki_search": [], "dw_hits": []}

    # Fandom search for uncertain names
    for q in UNCERTAIN + ["Dodechedron", "Dung Dkar", "Ivory Mask", "Lyre of Ur"]:
        data = wiki_api(
            {
                "action": "query",
                "list": "search",
                "srsearch": q,
                "srlimit": 10,
                "format": "json",
            }
        )
        hits = [h["title"] for h in data.get("query", {}).get("search", [])]
        results["wiki_search"].append({"query": q, "hits": hits})
        print(f"WIKI SEARCH {q!r}: {hits}")
        time.sleep(DELAY)

    # Fetch missing titles
    for title in TITLES:
        fname = sanitize_filename(title)
        fpath = OUT / fname
        if fpath.exists() and fpath.stat().st_size > 0:
            results["wiki_fetch"].append(
                {"title": title, "ok": True, "skipped": True, "filename": fname}
            )
            print(f"SKIP existing {title}")
            continue
        wt, err = fetch_wikitext(title)
        time.sleep(DELAY)
        if err or wt is None:
            results["wiki_fetch"].append(
                {"title": title, "ok": False, "error": err, "filename": fname}
            )
            print(f"FAIL {title}: {err}")
            continue
        fpath.write_text(wt, encoding="utf-8")
        results["wiki_fetch"].append(
            {
                "title": title,
                "ok": True,
                "skipped": False,
                "filename": fname,
                "length": len(wt),
            }
        )
        print(f"OK {title} len={len(wt)}")

    # DominationsWorld: try site search + known blog listing scrape for names
    for name in UNCERTAIN:
        q = urllib.parse.quote(name)
        url = f"https://www.dominationsworld.com/?s={q}"
        body, err = http_get(url)
        time.sleep(DELAY)
        hit = False
        snippet = ""
        if body and not err:
            # crude: name present outside of search form echo
            low = body.casefold()
            needle = name.casefold()
            # count occurrences
            count = low.count(needle)
            # also check for "nothing found" patterns
            nothing = (
                "no results" in low
                or "nothing found" in low
                or "no posts" in low
                or "sorry, no" in low
            )
            hit = count >= 1 and not nothing
            # extract a small context
            i = low.find(needle)
            if i >= 0:
                snippet = body[max(0, i - 60) : i + len(name) + 60]
        results["dw_hits"].append(
            {
                "name": name,
                "url": url,
                "error": err,
                "hit": hit,
                "snippet": snippet[:200],
            }
        )
        print(f"DW {name}: hit={hit} err={err}")

    # Also scan previously saved official sweep posts
    sweep = TEMP / "official_sweep_posts.json"
    if sweep.exists():
        posts = json.loads(sweep.read_text(encoding="utf-8"))
        blob = json.dumps(posts).casefold()
        for name in UNCERTAIN:
            results["dw_hits"].append(
                {
                    "name": name,
                    "url": "official_sweep_posts.json",
                    "hit": name.casefold() in blob,
                    "source": "prior_sweep",
                }
            )

    out_path = TEMP / "uncertain_reverify.json"
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
