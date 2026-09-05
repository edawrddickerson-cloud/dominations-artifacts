"""Parse DW legendary calendars including two-column HTML tables; emit cost map."""
from __future__ import annotations

import csv
import json
import re
import urllib.request
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT / "data" / "temp"
ART_CSV = ROOT / "data" / "artifacts.csv"
UA = "Mozilla/5.0 (compatible; DomiNationsArtifactsResearch/1.0)"

URLS = [
    "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
    "https://www.dominationsworld.com/blog/legendary-calendar-may-2025",
    "https://www.dominationsworld.com/blog/9th-anniversary",
]


class TableParser(HTMLParser):
    """Extract tables as list of rows of cell texts; also full text with newlines."""

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
    "korean silla crown": "Silla Gold Crown",
    "silla gold crown": "Silla Gold Crown",
    "flammas helmet": "Flammas Helmet",  # may not exist in csv
    "plane gyro gunsight": "Plane Gyro Gunsight",
    "plane gyro gun": "Plane Gyro Gunsight",
    "gemini 8 gloves": "Gemini 8 Gloves",
    "gemini 8 glove": "Gemini 8 Gloves",
    "helgo buddha": "Helgö Buddha",
    "helg o buddha": "Helgö Buddha",
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
    r"legendary calendar|posted by|marco polo|by harlems|elephant archer quiver$)"
)


def parse_table_costs(tables, url, names) -> list[dict]:
    out = []
    for table in tables:
        if len(table) < 2:
            continue
        header = table[0]
        # Find columns whose header contains 100/300 Tokens
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
                cell = row[i]
                # cell may contain multiple names separated by newlines
                for part in re.split(r"[\n|;]+", cell):
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


def parse_inline_and_vault(text, url, names) -> list[dict]:
    out = []
    for m in LINE_COST_RE.finditer(text):
        raw, amt = m.group(1).strip(), m.group(2)
        if amt == "1000":
            continue
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
    vm = VAULT_COST_HINT.search(text)
    if vm and vm.group(1) != "1000":
        vault_amt = vm.group(1)
        for m in VAULT_DATE_NAME.finditer(text):
            raw = m.group(1).strip()
            canon = match_name(raw, names)
            if not canon:
                continue
            out.append(
                {
                    "name": canon,
                    "raw": raw,
                    "amount": vault_amt,
                    "url": url,
                    "source": "vault_schedule",
                }
            )
    return out


def main() -> None:
    names = load_names()
    all_hits = []
    for url in URLS:
        html = fetch(url)
        p = TableParser()
        p.feed(html)
        text = p.text()
        hits = []
        # Prefer table parse when present
        table_hits = parse_table_costs(p.tables, url, names)
        if table_hits:
            hits.extend(table_hits)
        else:
            hits.extend(parse_section_costs(text, url, names))
        hits.extend(parse_inline_and_vault(text, url, names))
        print(f"{url.rsplit('/',1)[-1]}: tables={len(p.tables)} hits={len(hits)}")
        for h in hits:
            if not h["name"]:
                print(f"  unmatched {h['amount']}: {h['raw']!r}")
        all_hits.extend(hits)

    by_name = defaultdict(list)
    for h in all_hits:
        if h.get("name"):
            by_name[h["name"]].append(h)

    recommended = {}
    conflicts = {}
    for name, hits in sorted(by_name.items()):
        # Prefer html_table / section over vault when amounts differ? Keep all; majority
        # Exclude vault if calendar also present for same name
        cal = [h for h in hits if h["source"] != "vault_schedule"]
        use = cal if cal else hits
        cnt = Counter(h["amount"] for h in use)
        amount = cnt.most_common(1)[0][0]
        amts = sorted({h["amount"] for h in hits})
        recommended[name] = {
            "cost": amount,
            "cost_currency": "Legendary Tokens",
            "acquisition_method": "Marco Polo",
            "sources": sorted({h["url"] for h in use}),
            "amounts_seen": amts,
            "hit_count": len(use),
            "raw_examples": sorted({h["raw"] for h in use})[:6],
            "sources_detail": use[:8],
        }
        if len({h["amount"] for h in use}) > 1:
            conflicts[name] = recommended[name]

    # Compare to blanks in csv
    blanks = []
    with ART_CSV.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("grade") == "Legendary" and not (row.get("cost") or "").strip():
                blanks.append(row["name"])
    fillable = [n for n in blanks if n in recommended]
    print(f"\nRecommended {len(recommended)}; blank legendary {len(blanks)}; fillable {len(fillable)}")
    print("Conflicts:", list(conflicts))
    for n in fillable:
        print(f"  FILL {n}: {recommended[n]['cost']}")

    out = {
        "recommended": recommended,
        "conflicts": conflicts,
        "fillable_blanks": {n: recommended[n] for n in fillable},
        "all_hits": all_hits,
        "count": len(recommended),
        "fillable_count": len(fillable),
    }
    TEMP.joinpath("dw_calendar_final_mine.json").write_text(
        json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("wrote dw_calendar_final_mine.json")


if __name__ == "__main__":
    main()
