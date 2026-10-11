# -*- coding: utf-8 -*-
"""Mine wiki pages + recent DW week-ahead posts for legendary token costs."""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT / "data" / "temp"
RAW = ROOT / "data" / "raw"
WIKI = RAW / "wiki_pages"
ART = ROOT / "data" / "artifacts.json"
COST = RAW / "dw_legendary_token_costs.json"
UA = "Mozilla/5.0 (compatible; DomiNationsArtifactsResearch/1.0)"

TOKEN_COST_RE = re.compile(
    r"(?:legendary\s+(?:coin\s+)?cost|legendary\s+tokens?\s+cost|cost)\s*[:=]?\s*(\d+)\s*(?:legendary\s+)?tokens?",
    re.I,
)
INLINE_RE = re.compile(
    r"(\d{2,4})\s+(?:Legendary\s+)?Tokens?",
    re.I,
)
NAME_COST_RE = re.compile(
    r"([A-Za-z0-9][A-Za-z0-9'’\"\-\. ]{2,70}?)\s*[-–—:]\s*(\d{2,4})\s*(?:Legendary\s+)?[Tt]okens?",
    re.I,
)


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript"}:
            self._skip += 1
        elif tag in {"p", "div", "li", "br", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript"} and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)

    def text(self) -> str:
        return re.sub(r"\s+", " ", "".join(self.parts)).strip()


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href = None
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href and "/blog/" in href:
                self._href = href
                self._buf = []

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.links.append((self._href, re.sub(r"\s+", " ", "".join(self._buf)).strip()))
            self._href = None
            self._buf = []

    def handle_data(self, data):
        if self._href is not None:
            self._buf.append(data)


def fetch(url: str) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            if "Page Not Found" in body[:800]:
                return None
            return body
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        print("fail", url, e)
        return None
    except Exception as e:  # noqa: BLE001
        print("fail", url, e)
        return None


def norm(s: str) -> str:
    s = s.lower().replace("\u2019", "'").replace("\u2161", "ii")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def main() -> None:
    arts = json.loads(ART.read_text(encoding="utf-8"))
    legs = [r for r in arts if r.get("grade") == "Legendary"]
    blank = [r for r in legs if not str(r.get("cost") or "").strip()]
    by_norm = {norm(r["name"]): r for r in legs}
    costs = json.loads(COST.read_text(encoding="utf-8"))

    wiki_hits = []
    for r in blank:
        # find wiki file
        candidates = list(WIKI.glob(f"*{r['name'].replace(' ', '_')}*.txt"))
        # also try without special chars
        if not candidates:
            slug = re.sub(r"[^A-Za-z0-9]+", "_", r["name"]).strip("_")
            candidates = list(WIKI.glob(f"*{slug}*.txt"))
        for p in candidates:
            if "Mythical" in p.name:
                continue
            text = p.read_text(encoding="utf-8", errors="replace")
            m = TOKEN_COST_RE.search(text)
            if m:
                amt = m.group(1)
                if amt in {"100", "300"}:
                    wiki_hits.append(
                        {
                            "name": r["name"],
                            "hall": r["hall"],
                            "amount": amt,
                            "file": p.name,
                            "snippet": text[max(0, m.start() - 40) : m.end() + 40],
                        }
                    )
            # also "costs 100 Legendary Tokens"
            for m2 in re.finditer(
                r"costs?\s+(\d{2,4})\s+Legendary Tokens", text, re.I
            ):
                amt = m2.group(1)
                if amt in {"100", "300"}:
                    wiki_hits.append(
                        {
                            "name": r["name"],
                            "hall": r["hall"],
                            "amount": amt,
                            "file": p.name,
                            "snippet": text[max(0, m2.start() - 40) : m2.end() + 40],
                        }
                    )

    print(f"wiki hits on blank legendaries: {len(wiki_hits)}")
    for h in wiki_hits:
        print(f"  WIKI {h['hall']:4} {h['name']}: {h['amount']} ({h['file']})")

    # Mine recent week-ahead / news posts for Name - N tokens
    blog_hits = []
    for page in range(1, 12):
        html = fetch(f"https://www.dominationsworld.com/blog/?page={page}")
        if not html:
            break
        lc = LinkCollector()
        lc.feed(html)
        for href, title in lc.links:
            if "/blog/?page" in href or href.rstrip("/").endswith("/blog"):
                continue
            if not any(
                k in (title or "").lower() or k in href.lower()
                for k in (
                    "week ahead",
                    "legendary",
                    "calendar",
                    "marco",
                    "anniversary",
                    "update",
                )
            ):
                continue
            url = href if href.startswith("http") else "https://www.dominationsworld.com" + (
                href if href.startswith("/") else "/blog/" + href
            )
            url = url.split("?")[0].rstrip("/")
            body = fetch(url)
            if not body:
                continue
            te = TextExtractor()
            te.feed(body)
            text = te.text()
            for m in NAME_COST_RE.finditer(text):
                raw, amt = m.group(1).strip(), m.group(2)
                if amt not in {"100", "300"}:
                    continue
                key = norm(raw)
                art = by_norm.get(key)
                if not art:
                    # fuzzy contain
                    for kn, a in by_norm.items():
                        if len(kn) >= 6 and (kn in key or key in kn):
                            art = a
                            break
                blog_hits.append(
                    {
                        "raw": raw,
                        "name": art["name"] if art else None,
                        "hall": art.get("hall") if art else None,
                        "amount": amt,
                        "url": url,
                        "row_cost": (art.get("cost") if art else None) or "",
                    }
                )
            time.sleep(0.2)
        time.sleep(0.3)

    print(f"\nblog name-cost hits: {len(blog_hits)}")
    useful = [
        h
        for h in blog_hits
        if h["name"] and (not h["row_cost"] or h["row_cost"] != h["amount"])
    ]
    print(f"useful (named + blank or mismatch): {len(useful)}")
    seen = set()
    for h in useful:
        key = (h["name"], h["amount"])
        if key in seen:
            continue
        seen.add(key)
        print(
            f"  BLOG {h['hall']} {h['name']}: {h['amount']} "
            f"(row={h['row_cost'] or '-'}) {h['url']}"
        )

    # Apply wiki hits into cost map for blanks
    added = []
    for h in wiki_hits:
        name = h["name"]
        if name in costs:
            continue
        costs[name] = {
            "cost": h["amount"],
            "cost_currency": "Legendary Tokens",
            "acquisition_method": "Marco Polo",
            "source": f"wiki:{h['file']}",
        }
        added.append(name)

    for h in useful:
        if not h["name"] or h["name"] in costs:
            continue
        if h["row_cost"]:
            continue
        costs[h["name"]] = {
            "cost": h["amount"],
            "cost_currency": "Legendary Tokens",
            "acquisition_method": "Marco Polo",
            "source": h["url"],
        }
        added.append(h["name"])

    COST.write_text(json.dumps(costs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    report = {
        "wiki_hits": wiki_hits,
        "blog_useful": useful,
        "added": added,
        "blank_remaining_estimate": len(blank) - len(set(added)),
    }
    (TEMP / "cost_wiki_blog_mine_2026-10-06.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"\nadded to cost map: {len(added)}")
    for n in added:
        print(" +", n)


if __name__ == "__main__":
    main()
