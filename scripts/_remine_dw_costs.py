# -*- coding: utf-8 -*-
"""Full remine of DW legendary token calendars → cost map + gap report."""
from __future__ import annotations

import csv
import json
import re
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT / "data" / "temp"
RAW = ROOT / "data" / "raw"
ART_JSON = ROOT / "data" / "artifacts.json"
COST_JSON = RAW / "dw_legendary_token_costs.json"
UA = "Mozilla/5.0 (compatible; DomiNationsArtifactsResearch/1.0)"

SEED_URLS = [
    "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
    "https://www.dominationsworld.com/blog/legendary-calendar-may-2025",
    "https://www.dominationsworld.com/blog/9th-anniversary",
    "https://www.dominationsworld.com/blog/dominations-10th-anniversary",
    "https://www.dominationsworld.com/blog/dominations-11th-anniversary",
]

MONTHS = [
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


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tables: list[list[list[str]]] = []
        self._table: list[list[str]] | None = None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._skip = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript"}:
            self._skip += 1
            return
        if self._skip:
            return
        if tag == "table":
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []
        elif tag == "br":
            if self._cell is not None:
                self._cell.append("\n")
            self.parts.append("\n")
        elif tag in {"p", "div", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript"} and self._skip:
            self._skip -= 1
            return
        if self._skip:
            return
        if tag in {"td", "th"} and self._cell is not None and self._row is not None:
            self._row.append(re.sub(r"\s+", " ", "".join(self._cell)).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None and self._table is not None:
            if any(c.strip() for c in self._row):
                self._table.append(self._row)
            self._row = None
        elif tag == "table" and self._table is not None:
            self.tables.append(self._table)
            self._table = None
        elif tag in {"p", "div", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._skip:
            return
        if self._cell is not None:
            self._cell.append(data)
        self.parts.append(data)

    def text(self) -> str:
        t = "".join(self.parts)
        t = re.sub(r"[ \t]+", " ", t)
        t = re.sub(r"\n[ \t]+", "\n", t)
        t = re.sub(r"\n{3,}", "\n\n", t)
        return t.strip()


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href and "/blog/" in href:
                self._href = href
                self._buf = []

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            title = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            self.links.append((self._href, title))
            self._href = None
            self._buf = []

    def handle_data(self, data):
        if self._href is not None:
            self._buf.append(data)


def fetch(url: str, retries: int = 2) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last = None
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                if "Page Not Found" in body[:800]:
                    return None
                return body
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
            time.sleep(0.8 * (i + 1))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.8 * (i + 1))
    print(f"  FAIL {url}: {last}")
    return None


def abs_url(href: str) -> str:
    if href.startswith("http"):
        return href.split("?")[0].rstrip("/")
    if href.startswith("/"):
        return "https://www.dominationsworld.com" + href.split("?")[0].rstrip("/")
    return "https://www.dominationsworld.com/blog/" + href.split("?")[0].rstrip("/")


def norm(s: str) -> str:
    s = s.lower().replace("\u2019", "'").replace("\u2018", "'")
    s = s.replace("\u201c", '"').replace("\u201d", '"').replace("\u2161", "ii")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


ALIASES = {
    "spitfire engine": "Supermarine Spitfire Engine",
    "art of war": "The Art of War",
    "the art of war": "The Art of War",
    "da vinci s flying machine": "Da Vinci's Flying Machine",
    "da vinci s vlying machine": "Da Vinci's Flying Machine",
    "da vinci flying machine": "Da Vinci's Flying Machine",
    "the mask of tutankhamun": "Mask of Tutankhamun",
    "mask of tutankhamun": "Mask of Tutankhamun",
    "general pershing bas relief": "General Pershing's Bas-Relief",
    "general pershing s bas relief": "General Pershing's Bas-Relief",
    "napoleon s bicorne hat": "Napoleon's Bicorne Hat",
    "tokugawa ieyasu s helmet": "Tokugawa Ieyasu's Helmet",
    "fengguan pheonix crown": "Fengguan Phoenix Crown",
    "fengguan phoenix crown": "Fengguan Phoenix Crown",
    "sanada yukimura s armor": "Sanada Yukimura's Armor",
    "red baron s engine": "Red Baron's Engine",
    "admiral yi s helmet": "Admiral Yi’s Helmet",
    "white death s war kit": "The White Death's War Kit",
    "the white death s war kit": "The White Death's War Kit",
    "normandy scr 536 walkie talkie": 'Normandy SCR-536 "Walkie-Talkie"',
    "creighton abrams tank commander kit": "Creighton Abrams Tank Commander Kit",
    "10th mountain division war kit": "10th Mountain Division War Kit",
    "augustus statue muscle cuirass": "Augustus Statue Muscle Cuirass",
    "six shooter": "6th Anniversary Six-Shooter",
    "croix de guerre": "Captain's Croix de Guerre",
    "captain s croix de guerre": "Captain's Croix de Guerre",
    "korean silla crown": "Silla Gold Crown",
    "silla gold crown": "Silla Gold Crown",
    "flammas helmet": "Flamma's Helmet",
    "flamma s helmet": "Flamma's Helmet",
    "plane gyro gunsight": "Plane Gyro Gunsight",
    "plane gyro gun": "Plane Gyro Gunsight",
    "gemini 8 gloves": "Gemini 8 Gloves",
    "gemini 8 glove": "Gemini 8 Gloves",
    "gemini 8 helmet": "Gemini 8 Helmet",
    "helgo buddha": "Helgö Buddha",
    "clem sohn s wingsuit": "Clem Sohn's Wingsuit",
    "clem sohn wingsuit": "Clem Sohn's Wingsuit",
    "lewis chessmen": "Lewis Chessmen",
    "sojourner mars rover": "Sojourner Mars Rover",
    "ashanti kuduo": "Ashanti Kuduo",
    "thinker of cernavoda": "Thinker of Cernavoda",
    "quimbaya treasure": "Quimbaya Treasure",
    "sophilos dinos": "Sophilos Dinos",
    "battersea shield": "Battersea Shield",
    "rosetta stone": "Rosetta Stone",
    "nefertiti bust": "Nefertiti Bust",
    "sutton hoo helmet": "Sutton Hoo Helmet",
    "mask of agamemnon": "Mask of Agamemnon",
    "aztec calendar": "Aztec Calendar",
    "christmas football": "Christmas Football",
    "demarcation stone": "Demarcation Stone",
    "great imperial crown": "Great Imperial Crown",
    "vespa 150 tap": "Vespa 150 TAP",
    "tizona sword": "Tizona Sword",
    "julius caesar statue": "Julius Caesar Statue",
    "elephant archer quiver": "Elephant Archer Quiver",
    "arm reliquary of charlemagne": "Arm Reliquary of Charlemagne",
    "crescent blade": "Crescent Blade",
    "desert storm psn 8 manpack": "Desert Storm PSN-8 Manpack",
    "leonidas bust": "Leonidas Bust",
    "warka vase": "Warka Vase",
    "raven rattle": "Raven Rattle",
    "stopler revolver": "Stopler Revolver",
}


def load_names() -> dict[str, str]:
    names: dict[str, str] = {}
    rows = json.loads(ART_JSON.read_text(encoding="utf-8"))
    for row in rows:
        if row.get("grade") != "Legendary":
            continue
        n = (row.get("name") or "").strip()
        if not n:
            continue
        names[norm(n)] = n
        alt = (row.get("alternate_name") or "").strip()
        if alt:
            names[norm(alt)] = n
    for k, v in ALIASES.items():
        names[k] = v
    return names


def match_name(raw: str, names: dict[str, str]) -> str | None:
    n = norm(raw)
    if not n or len(n) < 3:
        return None
    if n in names:
        return names[n]
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


LINE_COST_RE = re.compile(
    r"([A-Za-z0-9][A-Za-z0-9'’\"\-\. ]{2,70}?)\s*[-–—]\s*(\d{2,4})\s*(?:Legendary\s+)?[Tt]okens?",
    re.I,
)
VAULT_COST_HINT = re.compile(
    r"Legendary Artifact for\s+(\d+)\s+Legendary Tokens", re.I
)
VAULT_DATE_NAME = re.compile(
    r"\d{1,2}/\d{1,2}\s*[-–—]\s*\d{1,2}/\d{1,2}\s*[-–—]\s*([A-Za-z0-9][A-Za-z0-9'’\-\. ]{2,60})"
)
SECTION_RE = re.compile(r"(?im)^\s*(\d{2,4})\s+Tokens?\s*$")
SKIP_LINES = re.compile(
    r"(?i)^(back to news|each month|here'?s a look|all items will|"
    r"for may|reduce the|invading|heavy cavalry|air defense|"
    r"legendary calendar|posted by|marco polo|by harlems|"
    r"throughout the month|marco will also|there will be)"
)
CALENDAR_HINT = re.compile(
    r"(legendary[- ]token[- ]calendar|legendary[- ]calendar|"
    r"token calendar|anniversary|marco.?s vault)",
    re.I,
)


def parse_table_costs(tables, url, names) -> list[dict]:
    out = []
    for table in tables:
        if len(table) < 2:
            continue
        header = table[0]
        col_amt: dict[int, str] = {}
        for i, cell in enumerate(header):
            m = re.search(r"(\d{2,4})\s*Tokens?", cell, re.I)
            if m and m.group(1) in {"100", "300", "50", "200"}:
                col_amt[i] = m.group(1)
        if not col_amt:
            continue
        for row in table[1:]:
            for i, amt in col_amt.items():
                if i >= len(row):
                    continue
                for part in re.split(r"[\n|;]+", row[i]):
                    part = part.strip()
                    if not part or SKIP_LINES.search(part):
                        continue
                    if re.search(r"[+\-]\d+%", part):
                        continue
                    if re.fullmatch(r"\d{2,4}\s*Tokens?", part, re.I):
                        continue
                    canon = match_name(part, names)
                    out.append(
                        {
                            "name": canon,
                            "raw": part,
                            "amount": amt,
                            "url": url,
                            "source": "html_table",
                        }
                    )
    return out


def parse_section_costs(text, url, names) -> list[dict]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out = []
    current = None
    for ln in lines:
        sm = SECTION_RE.match(ln)
        if sm:
            amt = sm.group(1)
            current = amt if amt in {"100", "300", "50", "200"} else None
            continue
        if current is None:
            continue
        if SKIP_LINES.search(ln) or re.search(r"[+\-]\d+%", ln) or len(ln) > 80:
            continue
        if re.fullmatch(r"\d{2,4}\s*Tokens?", ln, re.I):
            continue
        canon = match_name(ln, names)
        out.append(
            {
                "name": canon,
                "raw": ln,
                "amount": current,
                "url": url,
                "source": "section_list",
            }
        )
    return out


def parse_line_costs(text, url, names) -> list[dict]:
    out = []
    for m in LINE_COST_RE.finditer(text):
        raw, amt = m.group(1).strip(), m.group(2)
        if amt not in {"100", "300", "50", "200"}:
            continue  # skip mythical 1000 etc.
        if SKIP_LINES.search(raw):
            continue
        canon = match_name(raw, names)
        out.append(
            {
                "name": canon,
                "raw": raw,
                "amount": amt,
                "url": url,
                "source": "line_pattern",
            }
        )
    return out


def parse_vault(text, url, names) -> list[dict]:
    out = []
    hm = VAULT_COST_HINT.search(text)
    if not hm:
        return out
    amt = hm.group(1)
    if amt not in {"100", "300"}:
        return out
    for m in VAULT_DATE_NAME.finditer(text):
        raw = m.group(1).strip()
        canon = match_name(raw, names)
        out.append(
            {
                "name": canon,
                "raw": raw,
                "amount": amt,
                "url": url,
                "source": "anniversary_vault",
            }
        )
    return out


def discover_urls() -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    def add(u: str) -> None:
        u = u.rstrip("/")
        if u not in seen:
            seen.add(u)
            urls.append(u)

    for u in SEED_URLS:
        add(u)

    # Probe month/year slugs only for likely calendar months (known pattern years).
    for year in (2025, 2026):
        for month in MONTHS:
            add(f"https://www.dominationsworld.com/blog/legendary-calendar-{month}-{year}")
            # Only one alternate slug form — avoid combinatorial 404 storm.
            add(f"https://www.dominationsworld.com/blog/{month}-legendary-token-calendar")

    # Paginate blog for calendar-titled posts
    for page in range(1, 25):
        html = fetch(f"https://www.dominationsworld.com/blog/?page={page}")
        if not html:
            break
        lc = LinkCollector()
        lc.feed(html)
        page_new = 0
        for href, title in lc.links:
            if "/blog/?page" in href or href.rstrip("/").endswith("/blog"):
                continue
            full = abs_url(href)
            if CALENDAR_HINT.search(full) or CALENDAR_HINT.search(title or ""):
                if full not in seen:
                    page_new += 1
                add(full)
        # stop if page had almost no blog links
        blog_links = [h for h, _ in lc.links if "/blog/" in h and "?page" not in h]
        if page > 1 and len(blog_links) < 3:
            break
        time.sleep(0.35)

    return urls


def main() -> None:
    TEMP.mkdir(parents=True, exist_ok=True)
    names = load_names()
    print(f"legendary name keys: {len(names)}")

    print("discovering URLs…")
    candidates = discover_urls()
    print(f"candidate URLs: {len(candidates)}")

    hits: list[dict] = []
    fetched_ok: list[str] = []
    texts: dict[str, str] = {}

    for url in candidates:
        html = fetch(url)
        if not html:
            continue
        fetched_ok.append(url)
        p = TableParser()
        p.feed(html)
        text = p.text()
        texts[url] = text
        hits.extend(parse_table_costs(p.tables, url, names))
        hits.extend(parse_section_costs(text, url, names))
        hits.extend(parse_line_costs(text, url, names))
        hits.extend(parse_vault(text, url, names))
        time.sleep(0.25)

    print(f"fetched OK: {len(fetched_ok)}")
    print(f"raw hits: {len(hits)}")

    # Aggregate: prefer 100 over 300 when both seen? Keep majority / prefer lowest
    # for Marco calendars both can be valid historically — store preferred:
    # most common amount; ties → prefer 100 (cheaper listing) then 300.
    by_name: dict[str, list[dict]] = defaultdict(list)
    unmatched = []
    for h in hits:
        if h["name"]:
            by_name[h["name"]].append(h)
        else:
            unmatched.append(h)

    preferred: dict[str, dict] = {}
    for name, lst in by_name.items():
        amts = Counter(x["amount"] for x in lst)
        # Prefer most frequent; tie-break prefer 100 then 300
        best_amt = sorted(amts.items(), key=lambda kv: (-kv[1], 0 if kv[0] == "100" else 1))[0][0]
        sample = next(x for x in lst if x["amount"] == best_amt)
        preferred[name] = {
            "cost": best_amt,
            "cost_currency": "Legendary Tokens",
            "acquisition_method": (
                "Marco Polo (Anniversary Vault)"
                if sample["source"] == "anniversary_vault"
                else "Marco Polo"
            ),
            "source": sample["url"],
            "evidence_amounts": dict(amts),
            "hit_count": len(lst),
        }

    # Merge into existing cost JSON (do not wipe user-provided; fill blanks / add new)
    existing = {}
    if COST_JSON.exists():
        existing = json.loads(COST_JSON.read_text(encoding="utf-8"))

    added = []
    updated = []
    for name, meta in sorted(preferred.items()):
        slim = {
            "cost": meta["cost"],
            "cost_currency": meta["cost_currency"],
            "acquisition_method": meta["acquisition_method"],
            "source": meta["source"],
        }
        if name not in existing:
            existing[name] = slim
            added.append((name, slim["cost"]))
        else:
            # If existing blank somehow — shouldn't happen
            old = existing[name]
            if str(old.get("cost")) != str(slim["cost"]):
                # Keep existing if user-provided; else prefer mined when conflict
                src = str(old.get("source") or "")
                if src.startswith("user-provided"):
                    continue
                # Record conflict but keep existing (fill-blanks policy in build)
                updated.append((name, old.get("cost"), slim["cost"], "conflict_kept_existing"))
            # If source missing, refresh
            if not old.get("source"):
                old["source"] = slim["source"]

    # Write merged cost map (canonical fields only)
    out_map = {}
    for name, meta in sorted(existing.items()):
        out_map[name] = {
            "cost": str(meta["cost"]),
            "cost_currency": meta.get("cost_currency") or "Legendary Tokens",
            "acquisition_method": meta.get("acquisition_method") or "Marco Polo",
            "source": meta.get("source") or "remine-2026-10-06",
        }
    COST_JSON.write_text(json.dumps(out_map, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Reconcile vs artifacts
    arts = json.loads(ART_JSON.read_text(encoding="utf-8"))
    legs = [r for r in arts if r.get("grade") == "Legendary"]
    fillable = []
    mismatched = []
    still_blank = []
    war100 = []
    for r in legs:
        name = r["name"]
        row_cost = str(r.get("cost") or "").strip()
        map_meta = out_map.get(name)
        map_cost = str(map_meta["cost"]) if map_meta else ""
        if map_cost and not row_cost:
            fillable.append((name, r.get("hall"), map_cost))
        elif map_cost and row_cost and map_cost != row_cost:
            mismatched.append((name, r.get("hall"), row_cost, map_cost))
        elif not row_cost:
            still_blank.append((name, r.get("hall")))
        if r.get("hall") == "War" and (row_cost == "100" or map_cost == "100"):
            war100.append((name, row_cost or "-", map_cost or "-"))

    report = {
        "fetched_urls": fetched_ok,
        "preferred_costs": preferred,
        "added_to_map": [{"name": n, "cost": c} for n, c in added],
        "conflicts": [
            {"name": n, "existing": a, "mined": b, "note": note}
            for n, a, b, note in updated
        ],
        "unmatched_raw_sample": unmatched[:80],
        "fillable_blanks": [
            {"name": n, "hall": h, "cost": c} for n, h, c in fillable
        ],
        "row_vs_map_mismatches": [
            {"name": n, "hall": h, "row": a, "map": b}
            for n, h, a, b in mismatched
        ],
        "still_blank_no_map": [{"name": n, "hall": h} for n, h in still_blank],
        "war_100_candidates": [
            {"name": n, "row": a, "map": b} for n, a, b in sorted(war100)
        ],
        "counts": {
            "legendary": len(legs),
            "map_size": len(out_map),
            "fillable": len(fillable),
            "mismatched": len(mismatched),
            "still_blank": len(still_blank),
            "war_100_unique": len({n for n, _, _ in war100}),
        },
    }
    (TEMP / "cost_remine_2026-10-06.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (TEMP / "dw_calendar_texts_remine.json").write_text(
        json.dumps(texts, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print("\n=== SUMMARY ===")
    print(json.dumps(report["counts"], indent=2))
    print(f"\nnew map entries: {len(added)}")
    for n, c in added[:40]:
        print(f"  + {n}: {c}")
    print(f"\nfillable blanks (map has cost, row empty): {len(fillable)}")
    for n, h, c in fillable:
        print(f"  FILL {h:4} {n}: {c}")
    print(f"\nstill blank (no map): {len(still_blank)}")
    for n, h in still_blank:
        print(f"  BLANK {h:4} {n}")
    print(f"\nwar×100 (row or map): {len({n for n,_,_ in war100})}")
    for n, a, b in sorted(war100):
        print(f"  {n}: row={a} map={b}")
    print(f"\nunmatched raw (no name match): {len(unmatched)}")
    for h in unmatched[:30]:
        print(f"  ? {h['raw']!r} -> {h['amount']} ({h['source']})")


if __name__ == "__main__":
    main()
