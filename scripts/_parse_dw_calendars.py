"""Probe DominationsWorld for legendary calendar URL patterns; parse section costs."""
from __future__ import annotations

import csv
import json
import re
import time
import urllib.request
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT / "data" / "temp"
ART_CSV = ROOT / "data" / "artifacts.csv"
UA = "Mozilla/5.0 (compatible; DomiNationsArtifactsResearch/1.0)"

KNOWN = [
    "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
    "https://www.dominationsworld.com/blog/legendary-calendar-may-2025",
]


class BrText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript"}:
            self._skip += 1
        if tag == "br":
            self.parts.append("\n")
        if tag in {"p", "div", "li", "h1", "h2", "h3", "tr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript"} and self._skip:
            self._skip -= 1
        if tag in {"p", "div", "li", "h1", "h2", "h3", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)

    def text(self) -> str:
        t = "".join(self.parts)
        t = t.replace("\r", "")
        t = re.sub(r"[ \t]+", " ", t)
        t = re.sub(r"\n[ \t]+", "\n", t)
        t = re.sub(r"\n{3,}", "\n\n", t)
        return t.strip()


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode("utf-8", errors="replace")


def norm(s: str) -> str:
    s = s.lower().replace("\u2019", "'").replace("\u2018", "'")
    s = s.replace("\u201c", '"').replace("\u201d", '"')
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


ALIASES = {
    "spitfire engine": "Supermarine Spitfire Engine",
    "art of war": "The Art of War",
    "the art of war": "The Art of War",
    "da vinci s flying machine": "Da Vinci's Flying Machine",
    "da vinci s vlying machine": "Da Vinci's Flying Machine",  # typo in June 2025
    "da vinci flying machine": "Da Vinci's Flying Machine",
    "the mask of tutankhamun": "Mask of Tutankhamun",
    "mask of tutankhamun": "Mask of Tutankhamun",
    "general pershing bas relief": "General Pershing's Bas-Relief",
    "general pershing s bas relief": "General Pershing's Bas-Relief",
    "napoleon s bicorne hat": "Napoleon's Bicorne Hat",
    "napoleons bicorne hat": "Napoleon's Bicorne Hat",
    "tokugawa ieyasu s helmet": "Tokugawa Ieyasu's Helmet",
    "fengguan pheonix crown": "Fengguan Phoenix Crown",
    "fengguan phoenix crown": "Fengguan Phoenix Crown",
    "sanada yukimura s armor": "Sanada Yukimura's Armor",
    "red baron s engine": "Red Baron's Engine",
    "admiral yi s helmet": "Admiral Yi's Helmet",
    "white death s war kit": "White Death's War Kit",
    "normandy scr 536 walkie talkie": "Normandy SCR-536 \"Walkie-Talkie\"",
    "creighton abrams tank commander kit": "Creighton Abrams' Tank Commander Kit",
    "10th mountain division war kit": "10th Mountain Division War Kit",
    "augustus statue muscle cuirass": "Augustus' Statue Muscle Cuirass",
    "gemini 8 helmet": "Gemini 8 Helmet",
    "gemini 8 gloves": "Gemini 8 Gloves",
    "gemini 8 glove": "Gemini 8 Gloves",
    "plane gyro gunsight": "Plane Gyro Gunsight",
    "thinker of cernavoda": "Thinker of Cernavoda",
    "elephant archer quiver": "Elephant Archer Quiver",
}


def load_names() -> dict[str, str]:
    names: dict[str, str] = {}
    with ART_CSV.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("grade") != "Legendary":
                continue
            n = row["name"].strip()
            names[norm(n)] = n
            alt = (row.get("alternate_name") or "").strip()
            if alt:
                names[norm(alt)] = n
    for k, v in ALIASES.items():
        if v in {x for x in names.values()} or True:
            names[k] = v
    return names


def match_name(raw: str, names: dict[str, str]) -> str | None:
    n = norm(raw)
    if not n or len(n) < 3:
        return None
    if n in ALIASES:
        return ALIASES[n]
    if n in names:
        return names[n]
    # fuzzy containment
    best = None
    best_len = 0
    for kn, canon in names.items():
        if len(kn) < 6:
            continue
        if kn in n or n in kn:
            if len(kn) > best_len:
                best = canon
                best_len = len(kn)
    return best


SECTION_RE = re.compile(r"(?im)^\s*(\d{2,4})\s+Tokens?\s*$")
LINE_COST_RE = re.compile(
    r"^(.+?)\s*[-–—]\s*(\d{2,4})\s*(?:Legendary\s+)?[Tt]okens?\s*$",
    re.M,
)
SKIP_LINES = re.compile(
    r"(?i)^(back to news|each month|here'?s a look|all items will|"
    r"for may|reduce the|invading|heavy cavalry|air defense|"
    r"legendary calendar|posted by|marco polo|by harlems)"
)


def parse_section_costs(text: str, url: str, names: dict[str, str]) -> list[dict]:
    """Parse '100 Tokens' / '300 Tokens' section lists used in 2025 calendars."""
    lines = [ln.strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    out: list[dict] = []
    current_amount: str | None = None
    for ln in lines:
        sm = SECTION_RE.match(ln)
        if sm:
            amt = sm.group(1)
            if amt in {"100", "300", "50", "200"}:
                current_amount = amt
            else:
                current_amount = None
            continue
        if current_amount is None:
            continue
        if SKIP_LINES.search(ln):
            continue
        if re.fullmatch(r"\d{1,2}/\d{1,2}\s*[-–—]\s*\d{1,2}/\d{1,2}", ln):
            continue
        # perk-looking lines
        if re.search(r"[+\-]\d+%", ln):
            continue
        if len(ln) > 80:
            continue
        canon = match_name(ln, names)
        if not canon:
            # keep unmatched for review
            out.append(
                {
                    "name": None,
                    "raw": ln,
                    "amount": current_amount,
                    "url": url,
                    "source": "section_unmatched",
                }
            )
            continue
        out.append(
            {
                "name": canon,
                "raw": ln,
                "amount": current_amount,
                "url": url,
                "source": "section_list",
            }
        )
    return out


def parse_inline_costs(text: str, url: str, names: dict[str, str]) -> list[dict]:
    out = []
    for m in LINE_COST_RE.finditer(text):
        raw, amt = m.group(1).strip(), m.group(2)
        if amt == "1000":
            continue
        # strip leading dates / stars
        raw2 = re.sub(r"^[\d/\-\s\*]+", "", raw).strip()
        canon = match_name(raw2, names) or match_name(raw, names)
        if not canon:
            continue
        out.append(
            {
                "name": canon,
                "raw": raw,
                "amount": amt,
                "url": url,
                "source": "inline_dash",
            }
        )
    return out


def probe_urls() -> list[str]:
    months = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ]
    found = list(KNOWN)
    for y in ("2024", "2025", "2026"):
        for m in months:
            candidates = [
                f"https://www.dominationsworld.com/blog/legendary-calendar-{m}-{y}",
                f"https://www.dominationsworld.com/blog/{m}-legendary-token-calendar",
                f"https://www.dominationsworld.com/blog/{m}-{y}-legendary-calendar",
                f"https://www.dominationsworld.com/blog/legendary-token-calendar-{m}-{y}",
                f"https://www.dominationsworld.com/blog/{m}-legendary-calendar-{y}",
            ]
            for u in candidates:
                if u in found:
                    continue
                try:
                    html = fetch(u)
                except Exception:
                    continue
                if "article-title" not in html:
                    continue
                title_m = re.search(
                    r'class="article-title"[^>]*>(.*?)</h1>', html, re.I | re.S
                )
                title = (
                    re.sub(r"<[^>]+>", "", title_m.group(1)).strip() if title_m else ""
                )
                if not title or "not found" in title.lower():
                    continue
                if "legendary" not in title.lower() and "token" not in title.lower():
                    # still accept if body has 100 Tokens section
                    if "100 Tokens" not in html and "300 Tokens" not in html:
                        continue
                print(f"FOUND {u} | {title}")
                found.append(u)
                time.sleep(0.2)
    return found


def main() -> None:
    TEMP.mkdir(parents=True, exist_ok=True)
    names = load_names()
    print(f"name keys: {len(names)}")

    urls = probe_urls()
    TEMP.joinpath("dw_calendar_urls_found.json").write_text(
        json.dumps(urls, indent=2), encoding="utf-8"
    )
    print(f"calendar urls: {len(urls)}")

    all_hits: list[dict] = []
    texts: dict[str, str] = {}
    for u in urls:
        try:
            html = fetch(u)
            p = BrText()
            p.feed(html)
            text = p.text()
        except Exception as e:
            print(f"FAIL {u}: {e}")
            continue
        texts[u] = text
        hits = parse_section_costs(text, u, names) + parse_inline_costs(text, u, names)
        print(f"{u}: {len(hits)} hits")
        all_hits.extend(hits)
        time.sleep(0.25)

    by_name: dict[str, list] = defaultdict(list)
    unmatched: list[dict] = []
    for h in all_hits:
        if h.get("name"):
            by_name[h["name"]].append(h)
        else:
            unmatched.append(h)

    recommended = {}
    conflicts = {}
    for name, hits in sorted(by_name.items()):
        amts = sorted({h["amount"] for h in hits})
        # prefer most recent calendar if conflict — use majority
        from collections import Counter

        cnt = Counter(h["amount"] for h in hits)
        amount = cnt.most_common(1)[0][0]
        recommended[name] = {
            "cost": amount,
            "cost_currency": "Legendary Tokens",
            "acquisition_method": "Marco Polo",
            "sources": sorted({h["url"] for h in hits}),
            "amounts_seen": amts,
            "hit_count": len(hits),
            "raw_examples": sorted({h["raw"] for h in hits})[:5],
        }
        if len(amts) > 1:
            conflicts[name] = recommended[name]

    out = {
        "recommended": recommended,
        "conflicts": conflicts,
        "unmatched": unmatched,
        "all_hits": all_hits,
        "calendar_urls": urls,
        "count": len(recommended),
    }
    TEMP.joinpath("dw_calendar_section_mine.json").write_text(
        json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    TEMP.joinpath("dw_calendar_texts.json").write_text(
        json.dumps(texts, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\nRecommended: {len(recommended)} (conflicts: {len(conflicts)})")
    for n, m in recommended.items():
        flag = " CONFLICT" if n in conflicts else ""
        print(f"  {n}: {m['cost']}{flag}")
    print(f"Unmatched samples: {len(unmatched)}")
    for u in unmatched[:40]:
        print(f"  ? {u['amount']} <- {u['raw']!r} @ {u['url'].rsplit('/',1)[-1]}")


if __name__ == "__main__":
    main()
