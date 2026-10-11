# -*- coding: utf-8 -*-
"""Scan existing blog index for calendar/vault posts; needle-search week-ahead for token costs."""
from __future__ import annotations

import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(r"c:\Projects\Dominations Artifacts")
TEMP = ROOT / "data" / "temp"
UA = "DomiNationsArtifactResearch/1.0"


def http_get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="replace"), None
    except Exception as e:
        return None, str(e)


def strip_tags(html: str) -> str:
    t = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    t = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", t)
    t = re.sub(r"(?is)<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def main() -> None:
    idx = json.loads((TEMP / "dw_blog_index.json").read_text(encoding="utf-8"))
    # normalize
    posts = idx if isinstance(idx, list) else idx.get("posts") or idx.get("urls") or []
    if isinstance(posts, dict):
        posts = list(posts.values()) if posts else []
    urls = []
    for p in posts:
        if isinstance(p, str):
            urls.append(p)
        elif isinstance(p, dict):
            urls.append(p.get("url") or p.get("href") or "")
    urls = [u for u in urls if u]

    calendarish = [
        u
        for u in urls
        if re.search(r"calendar|vault|token-calendar|legendary-token", u, re.I)
    ]
    week_ahead = [u for u in urls if re.search(r"week-ahead", u, re.I)]

    out = {
        "index_post_count": len(urls),
        "calendarish_from_index": sorted(set(calendarish)),
        "week_ahead_count": len(week_ahead),
        "week_ahead_token_hits": [],
        "phantom_hits_in_index_text": [],
    }

    # Sample week-ahead posts that mention tokens (limit to keep runtime sane)
    phantoms = [
        "Leftwich",
        "Benin Royal",
        "Golden Lyre",
        "Mona Lisa",
        "Dodecahedron",
        "Dodechedron",
        "Dung-Dkar",
        "Dung Dkar",
    ]
    checked = 0
    for url in sorted(set(week_ahead)):
        body, err = http_get(url)
        checked += 1
        if err or not body:
            continue
        text = strip_tags(body)
        if re.search(r"(100|300)\s+(Legendary\s+)?Tokens?", text, re.I) and re.search(
            r"Legendary\s+Artifact", text, re.I
        ):
            # extract short contexts
            ctxs = [
                m.group(0)
                for m in re.finditer(
                    r".{0,60}(?:100|300)\s+(?:Legendary\s+)?Tokens?.{0,120}",
                    text,
                    re.I,
                )
            ][:4]
            out["week_ahead_token_hits"].append({"url": url, "contexts": ctxs})
        for ph in phantoms:
            if re.search(re.escape(ph), text, re.I):
                out["phantom_hits_in_index_text"].append({"url": url, "needle": ph})
        if checked >= 80:
            break
        time.sleep(0.2)

    out["week_ahead_checked"] = checked
    path = TEMP / "data_agent_weekahead_token_scan.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print("wrote", path)
    print("index", len(urls), "calendarish", out["calendarish_from_index"])
    print("week_ahead_token_hits", len(out["week_ahead_token_hits"]))
    print("phantom_hits", out["phantom_hits_in_index_text"][:10])


if __name__ == "__main__":
    main()
