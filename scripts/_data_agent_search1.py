# -*- coding: utf-8 -*-
"""Deep search: Leftwich Trophy across Fandom / DW / BHG / Reddit."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(r"c:\Projects\Dominations Artifacts")
TEMP = ROOT / "data" / "temp"
UA = "DomiNationsArtifactResearch/1.0"
DELAY = 0.4


def http_get(url: str, timeout: int = 60):
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": "text/html,application/json,*/*"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace"), None, resp.geturl()
    except Exception as e:
        return None, str(e), None


def strip_tags(html: str) -> str:
    t = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    t = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", t)
    t = re.sub(r"(?is)<[^>]+>", " ", t)
    t = re.sub(r"&\w+;", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def context_hits(text: str, pat: str, window: int = 120) -> list[str]:
    out = []
    for m in re.finditer(pat, text, flags=re.I):
        a = max(0, m.start() - window)
        b = min(len(text), m.end() + window)
        out.append(text[a:b])
        if len(out) >= 8:
            break
    return out


def main() -> None:
    results: dict = {}

    for q in ["Leftwich Trophy", "Leftwich"]:
        data_url = "https://dominations.fandom.com/api.php?" + urllib.parse.urlencode(
            {
                "action": "query",
                "list": "search",
                "srsearch": q,
                "format": "json",
                "srlimit": 10,
            }
        )
        body, err, _ = http_get(data_url)
        if err:
            results[f"fandom_search_{q}"] = {"error": err}
        else:
            j = json.loads(body)
            hits = [
                {
                    "title": x["title"],
                    "snippet": re.sub(r"<[^>]+>", "", x.get("snippet", "")),
                }
                for x in j.get("query", {}).get("search", [])
            ]
            results[f"fandom_search_{q}"] = hits
        time.sleep(DELAY)

    for title in ["Leftwich Trophy", "Talk:Leftwich Trophy"]:
        data_url = "https://dominations.fandom.com/api.php?" + urllib.parse.urlencode(
            {
                "action": "parse",
                "page": title,
                "prop": "wikitext",
                "format": "json",
            }
        )
        body, err, _ = http_get(data_url)
        if err:
            results[f"parse_{title}"] = {"error": err}
        else:
            j = json.loads(body)
            if "error" in j:
                results[f"parse_{title}"] = {"error": j["error"]}
            else:
                wt = j.get("parse", {}).get("wikitext", {}).get("*", "")
                results[f"parse_{title}"] = {
                    "len": len(wt),
                    "has_stats": "Benefit" in wt or "+" in wt,
                    "preview": wt[:800],
                }
        time.sleep(DELAY)

    urls = [
        "https://www.dominationsworld.com/?s=" + urllib.parse.quote("Leftwich"),
        "https://www.dominationsworld.com/?s=" + urllib.parse.quote("Leftwich Trophy"),
        "https://www.dominationsworld.com/blog/",
        "https://www.bhgames.com/?s=" + urllib.parse.quote("Leftwich Trophy"),
        "https://www.bhgames.com/?s=" + urllib.parse.quote("Leftwich"),
    ]

    for url in urls:
        body, err, final = http_get(url)
        key = url.replace("https://", "")[:100]
        if err or not body:
            results[key] = {"error": err}
        else:
            text = strip_tags(body)
            entry = {
                "final": final,
                "len": len(body),
                "leftwich_count": len(re.findall(r"Leftwich", text, re.I)),
                "contexts": context_hits(text, r"Leftwich"),
            }
            m = re.search(r"<title>(.*?)</title>", body, re.I | re.S)
            if m:
                entry["title_guess"] = re.sub(r"\s+", " ", m.group(1)).strip()[:120]
            results[key] = entry
        time.sleep(DELAY)

    for q in ["Leftwich Trophy DomiNations", "Leftwich Trophy museum artifact"]:
        url = "https://www.reddit.com/search.json?" + urllib.parse.urlencode(
            {"q": q, "limit": 15, "sort": "relevance"}
        )
        body, err, _ = http_get(url)
        if err or not body:
            results[f"reddit_{q}"] = {"error": err}
        else:
            try:
                j = json.loads(body)
                posts = []
                for ch in j.get("data", {}).get("children", []):
                    d = ch.get("data", {})
                    posts.append(
                        {
                            "sub": d.get("subreddit"),
                            "title": d.get("title"),
                            "permalink": d.get("permalink"),
                            "selftext": (d.get("selftext") or "")[:400],
                        }
                    )
                results[f"reddit_{q}"] = posts
            except Exception as e:
                results[f"reddit_{q}"] = {"error": str(e), "preview": body[:200]}
        time.sleep(DELAY)

    TEMP.mkdir(parents=True, exist_ok=True)
    out = TEMP / "data_agent_leftwich_search.json"
    out.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
