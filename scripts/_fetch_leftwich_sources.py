"""Fetch BHG forum + NamuWiki Leftwich evidence; checkpoint JSON."""
from __future__ import annotations

import json
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

TEMP = Path(__file__).resolve().parents[1] / "data" / "temp"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

URLS = [
    "https://forums.bighugegames.com/index.php?threads/missing-artifact-not-in-game-for-3-years-leftwich-trophy.43759/",
    "https://forums.bighugegames.com/index.php?threads/leftwich-trophy.28671/",
    "https://forums.bighugegames.com/index.php?threads/hi-bhg.48748/",
    "https://en.namu.wiki/w/%EC%A0%84%EC%84%A4%20%EC%9C%A0%EB%AC%BC/%EB%A0%88%ED%94%84%ED%8A%B8%EC%9C%84%EC%B9%98%20%ED%8A%B8%EB%A1%9C%ED%94%BC",
    "https://namu.wiki/w/%EC%A0%84%EC%84%A4%20%EC%9C%A0%EB%AC%BC/%EB%A0%88%ED%94%84%ED%8A%B8%EC%9C%84%EC%B9%98%20%ED%8A%B8%EB%A1%9C%ED%94%BC",
]


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript"}:
            self._skip += 1
        if tag == "br":
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript"} and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)

    def text(self) -> str:
        return re.sub(r"[ \t]+", " ", "".join(self.parts))


def fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def extract_bb_bodies(html: str) -> list[str]:
    bodies = []
    # XenForo message bodies
    for m in re.finditer(
        r'class="bbWrapper"[^>]*>(.*?)</div>\s*</article>', html, re.S | re.I
    ):
        t = re.sub(r"<br\s*/?>", "\n", m.group(1), flags=re.I)
        t = re.sub(r"<[^>]+>", " ", t)
        t = re.sub(r"[ \t]+", " ", t)
        t = re.sub(r"\n\s+", "\n", t).strip()
        if len(t) > 15:
            bodies.append(t)
    if not bodies:
        for m in re.finditer(r'class="bbWrapper"[^>]*>(.*?)</div>', html, re.S | re.I):
            t = re.sub(r"<br\s*/?>", "\n", m.group(1), flags=re.I)
            t = re.sub(r"<[^>]+>", " ", t)
            t = re.sub(r"\s+", " ", t).strip()
            if len(t) > 15:
                bodies.append(t)
    return bodies


def extract_authors(html: str) -> list[str]:
    return re.findall(
        r'data-author="([^"]+)"|class="username[^"]*"[^>]*>([^<]+)<', html, re.I
    )


def main() -> None:
    TEMP.mkdir(parents=True, exist_ok=True)
    out = {}
    for url in URLS:
        print("FETCH", url)
        try:
            html = fetch(url)
            p = TextExtractor()
            p.feed(html)
            bodies = extract_bb_bodies(html)
            authors = []
            for a, b in extract_authors(html):
                authors.append(a or b)
            # perk-like lines
            perk_hits = re.findall(
                r".{0,40}(?:DMG|HP|Speed|Cooldown|Duration|Refund|Loot)[^\n]{0,80}",
                p.text(),
                re.I,
            )
            out[url] = {
                "ok": True,
                "html_len": len(html),
                "bodies": bodies[:30],
                "authors_sample": authors[:40],
                "perk_line_hits": perk_hits[:40],
                "text_sample": p.text()[:4000],
                "has_leftwich": "leftwich" in html.lower(),
            }
            print(f"  bodies={len(bodies)} perks={len(perk_hits)}")
            for i, b in enumerate(bodies[:15], 1):
                print(f"  #{i}: {b[:400]}")
                print()
        except Exception as e:
            print("  FAIL", e)
            out[url] = {"ok": False, "error": str(e)}

    path = TEMP / "leftwich_bhg_namu.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print("wrote", path)


if __name__ == "__main__":
    main()
