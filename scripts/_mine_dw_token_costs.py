"""Mine DominationsWorld blog for Legendary token calendars + name hits.

Paginate /blog/?page=N (DW search ?s= is unreliable). Extract Name - N tokens
patterns from calendar posts. Never treat 1000-token Mythical Marco prices
as Legendary costs. Checkpoint to data/temp/.
"""
from __future__ import annotations

import csv
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
ART_CSV = ROOT / "data" / "artifacts.csv"
UA = "Mozilla/5.0 (compatible; DomiNationsArtifactsResearch/1.0)"

# Known calendar / vault posts (plus any discovered while paging)
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

NAME_NEEDLES = [
    "Leftwich",
    "Benin Royal",
    "Golden Lyre",
    "Mona Lisa",
    "Dodecahedron",
    "Dodechedron",
    "Dung-Dkar",
    "Dung Dkar",
    "Mask of Tutankhamun",
    "Tutankhamun",
    "King Tut",
]

# "Artifact Name - 100 tokens" / "Artifact Name - 300 Legendary Tokens"
COST_RE = re.compile(
    r"([A-Za-z0-9][A-Za-z0-9'’\-\. ]{2,60}?)\s*[-–—]\s*(\d{2,4})\s*(?:Legendary\s+)?[Tt]okens?",
    re.I,
)
# Vault lists without per-line cost: "5/20 - 5/22 - ASDIC Type 113X"
VAULT_DATE_NAME = re.compile(
    r"\d{1,2}/\d{1,2}\s*[-–—]\s*\d{1,2}/\d{1,2}\s*[-–—]\s*([A-Za-z0-9][A-Za-z0-9'’\-\. ]{2,60})"
)
VAULT_COST_HINT = re.compile(
    r"Legendary Artifact for\s+(\d+)\s+Legendary Tokens", re.I
)
CALENDAR_TITLE_HINT = re.compile(
    r"(legendary[- ]token[- ]calendar|legendary[- ]calendar|token calendar|marco.?s vault|anniversary)",
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


def fetch(url: str, retries: int = 3) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last_err: Exception | None = None
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"fetch failed {url}: {last_err}")


def html_to_text(html: str) -> str:
    p = TextExtractor()
    p.feed(html)
    return p.text()


def abs_url(href: str) -> str:
    if href.startswith("http"):
        return href.split("?")[0].rstrip("/")
    if href.startswith("/"):
        return "https://www.dominationsworld.com" + href.split("?")[0].rstrip("/")
    return "https://www.dominationsworld.com/blog/" + href.split("?")[0].rstrip("/")


def load_legendary_names() -> set[str]:
    names: set[str] = set()
    with ART_CSV.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("grade") == "Legendary" and row.get("name"):
                names.add(row["name"].strip())
                alt = (row.get("alternate_name") or "").strip()
                if alt:
                    names.add(alt)
    return names


def norm(s: str) -> str:
    s = s.lower().replace("’", "'")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# Aliases seen in calendars → canonical artifact names
ALIASES = {
    "spitfire engine": "Supermarine Spitfire Engine",
    "supermarine spitfire engine": "Supermarine Spitfire Engine",
    "art of war": "The Art of War",
    "the art of war": "The Art of War",
    "da vinci's flying machine": "Da Vinci's Flying Machine",
    "da vinci flying machine": "Da Vinci's Flying Machine",
    "plane gyro gunsight": "Plane Gyro Gunsight",
    "plane gyro gun": "Plane Gyro Gunsight",
    "gemini 8 gloves": "Gemini 8 Gloves",
    "gemini 8 glove": "Gemini 8 Gloves",
}


def match_name(raw: str, names_by_norm: dict[str, str]) -> str | None:
    n = norm(raw)
    if n in ALIASES:
        return ALIASES[n]
    if n in names_by_norm:
        return names_by_norm[n]
    # trim trailing junk words
    for cut in (" legendary artifact", " legendary", " artifact"):
        if n.endswith(cut.strip()):
            n2 = n[: -len(cut.strip())].strip()
            if n2 in names_by_norm:
                return names_by_norm[n2]
    # substring: prefer longest canonical match contained in raw
    best = None
    best_len = 0
    for kn, canon in names_by_norm.items():
        if kn in n or n in kn:
            if len(kn) > best_len and len(kn) >= 6:
                best = canon
                best_len = len(kn)
    return best


def discover_blog_links(max_pages: int = 40) -> list[dict]:
    posts: list[dict] = []
    seen: set[str] = set()
    for page in range(1, max_pages + 1):
        url = f"https://www.dominationsworld.com/blog/?page={page}"
        try:
            html = fetch(url)
        except Exception as e:  # noqa: BLE001
            print(f"page {page} fail: {e}")
            break
        lc = LinkCollector()
        lc.feed(html)
        page_new = 0
        for href, title in lc.links:
            if "/blog/?page" in href or href.rstrip("/").endswith("/blog"):
                continue
            full = abs_url(href)
            if full in seen:
                continue
            if "/blog/" not in full:
                continue
            slug = full.rsplit("/", 1)[-1]
            if not slug or slug in {"blog", "news"}:
                continue
            seen.add(full)
            posts.append({"url": full, "title": title, "page": page})
            page_new += 1
        print(f"blog page {page}: +{page_new} links (total {len(posts)})")
        if page_new == 0 and page > 2:
            # empty page — stop
            break
        time.sleep(0.4)
        TEMP.joinpath("dw_blog_index_partial.json").write_text(
            json.dumps(posts, indent=2), encoding="utf-8"
        )
    return posts


def parse_costs_from_text(
    text: str, url: str, names_by_norm: dict[str, str]
) -> list[dict]:
    out: list[dict] = []
    # Per-line Name - N tokens
    for m in COST_RE.finditer(text):
        raw_name, amount = m.group(1).strip(), m.group(2)
        # Skip mythical / councilor / gem contexts
        ctx = text[max(0, m.start() - 80) : m.end() + 80]
        low = ctx.lower()
        if "mythical" in low and amount == "1000":
            continue
        if amount == "1000":
            # Legendary never 1000 in our schema rules
            continue
        if "councilor" in low and amount == "500":
            continue
        if amount not in {"100", "300", "50", "200"}:
            # keep only plausible legendary token amounts; still record unusual
            if int(amount) > 500:
                continue
        canon = match_name(raw_name, names_by_norm)
        if not canon:
            # try stripping leading date fragments
            raw2 = re.sub(r"^[\d/\-\s\*]+", "", raw_name).strip()
            canon = match_name(raw2, names_by_norm)
        if not canon:
            continue
        out.append(
            {
                "name": canon,
                "raw": raw_name,
                "amount": amount,
                "url": url,
                "ctx": ctx.strip(),
                "source": "cost_pattern",
            }
        )

    # Vault schedule with shared cost
    vault_amt = None
    vm = VAULT_COST_HINT.search(text)
    if vm:
        vault_amt = vm.group(1)
        if vault_amt == "1000":
            vault_amt = None
    if vault_amt:
        for m in VAULT_DATE_NAME.finditer(text):
            raw_name = m.group(1).strip()
            canon = match_name(raw_name, names_by_norm)
            if not canon:
                continue
            ctx = text[max(0, m.start() - 40) : m.end() + 60]
            out.append(
                {
                    "name": canon,
                    "raw": raw_name,
                    "amount": vault_amt,
                    "url": url,
                    "ctx": ctx.strip(),
                    "source": "vault_schedule",
                }
            )
    return out


def main() -> None:
    TEMP.mkdir(parents=True, exist_ok=True)
    names = load_legendary_names()
    names_by_norm = {norm(n): n for n in names}
    print(f"legendary names loaded: {len(names)}")

    posts = discover_blog_links(max_pages=45)
    TEMP.joinpath("dw_blog_index.json").write_text(
        json.dumps(posts, indent=2), encoding="utf-8"
    )

    # Select calendar-ish + seed URLs
    fetch_urls: dict[str, str] = {}
    for u in SEED_URLS:
        fetch_urls[u.rstrip("/")] = "seed"
    for p in posts:
        title = p.get("title") or ""
        url = p["url"]
        slug = url.rsplit("/", 1)[-1]
        if CALENDAR_TITLE_HINT.search(title) or CALENDAR_TITLE_HINT.search(slug):
            fetch_urls[url] = title or slug
        # also older "marco" posts that might list legendary (not mythical) — skip mythical wares
        if re.search(r"legendary.*(calendar|token|vault)", title + " " + slug, re.I):
            fetch_urls[url] = title or slug

    print(f"posts to fetch for costs: {len(fetch_urls)}")
    TEMP.joinpath("dw_cost_fetch_urls.json").write_text(
        json.dumps(fetch_urls, indent=2), encoding="utf-8"
    )

    all_costs: list[dict] = []
    name_hits: dict[str, list] = defaultdict(list)
    post_texts: dict[str, str] = {}

    # Also fetch ALL posts for name needles (Leftwich etc.) — but batch: first calendars, then sample
    # For completeness of needle search, crawl all indexed posts (rate-limited).
    all_urls = list(dict.fromkeys(list(fetch_urls.keys()) + [p["url"] for p in posts]))

    for i, url in enumerate(all_urls, 1):
        try:
            html = fetch(url)
            text = html_to_text(html)
        except Exception as e:  # noqa: BLE001
            print(f"[{i}/{len(all_urls)}] FAIL {url}: {e}")
            continue
        post_texts[url] = text[:5000]
        print(f"[{i}/{len(all_urls)}] ok {url} ({len(text)} chars)")

        if url in fetch_urls or CALENDAR_TITLE_HINT.search(url):
            costs = parse_costs_from_text(text, url, names_by_norm)
            all_costs.extend(costs)
            print(f"    costs found: {len(costs)}")

        for needle in NAME_NEEDLES:
            if needle.lower() in text.lower():
                idx = text.lower().find(needle.lower())
                snip = text[max(0, idx - 60) : idx + 160]
                name_hits[needle].append({"url": url, "snippet": snip})

        if i % 10 == 0:
            checkpoint = {
                "costs": all_costs,
                "name_hits": dict(name_hits),
                "fetched": i,
                "total": len(all_urls),
            }
            TEMP.joinpath("dw_deep_mine_partial.json").write_text(
                json.dumps(checkpoint, indent=2), encoding="utf-8"
            )
        time.sleep(0.35)

    # Aggregate best cost per name (prefer 100/300; keep source urls)
    by_name: dict[str, list] = defaultdict(list)
    for c in all_costs:
        by_name[c["name"]].append(c)

    recommended: dict[str, dict] = {}
    for name, hits in sorted(by_name.items()):
        amounts = {h["amount"] for h in hits}
        # Prefer majority; if conflict, pick most common
        from collections import Counter

        cnt = Counter(h["amount"] for h in hits)
        amount, _ = cnt.most_common(1)[0]
        recommended[name] = {
            "cost": amount,
            "cost_currency": "Legendary Tokens",
            "acquisition_method": "Marco Polo",
            "sources": sorted({h["url"] for h in hits}),
            "amounts_seen": sorted(amounts),
            "hit_count": len(hits),
        }

    out = {
        "recommended": recommended,
        "all_cost_hits": all_costs,
        "name_hits": dict(name_hits),
        "fetch_urls": fetch_urls,
        "blog_post_count": len(posts),
        "fetched_count": len(post_texts),
    }
    TEMP.joinpath("dw_deep_mine.json").write_text(
        json.dumps(out, indent=2), encoding="utf-8"
    )
    print(f"\nRecommended legendary costs: {len(recommended)}")
    for n, m in sorted(recommended.items()):
        print(f"  {n}: {m['cost']}  ({m['hit_count']} hits)")
    print("\nName needle hits:")
    for k, v in name_hits.items():
        print(f"  {k}: {len(v)}")


if __name__ == "__main__":
    main()
