# -*- coding: utf-8 -*-
"""Extend legendary token cost mining: blog index + phantom/Leftwich BHG probes."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(r"c:\Projects\Dominations Artifacts")
TEMP = ROOT / "data" / "temp"
RAW = ROOT / "data" / "raw"
UA = "DomiNationsArtifactResearch/1.0"
DELAY = 0.35


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


def main() -> None:
    out: dict = {
        "blog_calendarish": [],
        "url_probes": {},
        "bhg_forum_probes": {},
        "phantom_dw_blog_hits": {},
        "new_cost_candidates": [],
    }

    # 1) Paginate blog for calendar / vault / token titles
    link_re = re.compile(
        r'href="(https://www\.dominationsworld\.com/blog/[^"#?]+)"', re.I
    )
    title_re = re.compile(
        r"(legendary\s*calendar|token\s*calendar|marco.?s?\s*vault|legendary\s*vault|"
        r"legendary\s*token)",
        re.I,
    )
    seen_urls: set[str] = set()
    for page in range(1, 20):
        url = (
            "https://www.dominationsworld.com/blog/"
            if page == 1
            else f"https://www.dominationsworld.com/blog/?page={page}"
        )
        body, err, _ = http_get(url)
        if err or not body:
            out.setdefault("blog_errors", []).append({"page": page, "error": err})
            break
        links = sorted(set(link_re.findall(body)))
        text = strip_tags(body)
        # also catch from link path
        for u in links:
            if u in seen_urls:
                continue
            seen_urls.add(u)
            slug = u.rstrip("/").split("/")[-1]
            if title_re.search(slug.replace("-", " ")) or title_re.search(u):
                out["blog_calendarish"].append(u)
        # heuristic: if page has no blog links beyond nav, stop
        blog_posts = [u for u in links if "/blog/" in u and u.rstrip("/").count("/") >= 4]
        if page > 1 and len(blog_posts) < 3:
            break
        time.sleep(DELAY)

    out["blog_calendarish"] = sorted(set(out["blog_calendarish"]))
    out["blog_pages_scanned"] = page
    out["blog_urls_seen"] = len(seen_urls)

    # 2) Probe missing month/year calendar URL patterns
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
    known = {
        "https://www.dominationsworld.com/blog/legendary-calendar-may-2025",
        "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
        "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
        "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
        "https://www.dominationsworld.com/blog/9th-anniversary",
    }
    probes = []
    for y in (2023, 2024, 2025, 2026):
        for m in months:
            probes.append(
                f"https://www.dominationsworld.com/blog/legendary-calendar-{m}-{y}"
            )
            probes.append(
                f"https://www.dominationsworld.com/blog/{m}-legendary-token-calendar"
            )
            probes.append(
                f"https://www.dominationsworld.com/blog/legendary-token-calendar-{m}-{y}"
            )
    # vault / anniversary variants
    for n in range(8, 12):
        probes.append(f"https://www.dominationsworld.com/blog/{n}th-anniversary")
    probes.append("https://www.dominationsworld.com/blog/10th-anniversary")
    probes.append("https://www.dominationsworld.com/blog/dominations-10th-anniversary")
    probes.append("https://www.dominationsworld.com/blog/dominations-11th-anniversary")
    probes.append("https://www.dominationsworld.com/blog/marcos-vault")
    probes.append("https://www.dominationsworld.com/blog/marco-s-vault")

    found_new = []
    for url in probes:
        if url in known:
            continue
        body, err, final = http_get(url)
        ok = bool(body) and err is None and "Page not found" not in (body or "") and (
            final or ""
        ).rstrip("/") == url.rstrip("/")
        # DW often soft-404s to home
        title_m = re.search(r"<title>(.*?)</title>", body or "", re.I | re.S)
        title = re.sub(r"\s+", " ", title_m.group(1)).strip() if title_m else ""
        soft404 = title.lower() in {"home | dominations", "blog | dominations"} or (
            "page not found" in (body or "").lower()
        )
        status = "ok" if ok and not soft404 and len(body or "") > 3000 else "miss"
        if status == "ok":
            found_new.append({"url": url, "title": title, "len": len(body or "")})
            out["url_probes"][url] = {"status": status, "title": title, "len": len(body)}
        time.sleep(0.15)

    out["new_calendar_urls"] = found_new

    # 3) BHG forum search for phantoms + Leftwich thread verify
    forum_queries = [
        "Leftwich Trophy",
        "Benin Royal Ivory Mask",
        "Golden Lyre of Ur",
        "Mona Lisa artifact",
        "Roman Dodecahedron",
        "Tibetan Dung-Dkar",
        "Koh-i-Noor",
    ]
    for q in forum_queries:
        url = (
            "https://forums.bighugegames.com/search/1/?q="
            + urllib.parse.quote(q)
            + "&o=relevance"
        )
        body, err, final = http_get(url)
        if err or not body:
            out["bhg_forum_probes"][q] = {"error": err}
        else:
            text = strip_tags(body)
            out["bhg_forum_probes"][q] = {
                "final": final,
                "len": len(body),
                "title": (
                    re.sub(
                        r"\s+",
                        " ",
                        (re.search(r"<title>(.*?)</title>", body, re.I | re.S) or ["", ""])[
                            1
                        ],
                    ).strip()[:120]
                ),
                "hit_count": len(re.findall(re.escape(q.split()[0]), text, re.I)),
                "contexts": [
                    text[max(0, m.start() - 80) : m.end() + 100]
                    for m in list(re.finditer(re.escape(q.split()[0]), text, re.I))[:4]
                ],
            }
        time.sleep(DELAY)

    # Direct Leftwich thread
    thr = "https://forums.bighugegames.com/index.php?threads/missing-artifact-not-in-game-for-3-years-leftwich-trophy.43759/"
    body, err, final = http_get(thr)
    if body and not err:
        text = strip_tags(body)
        out["leftwich_thread_verify"] = {
            "ok": True,
            "final": final,
            "has_bhgaustin": "BHGAustin" in text,
            "has_never_sold": bool(re.search(r"never sold", text, re.I)),
            "has_harlems": "Harlems369th" in text or "Harlems" in text,
            "sample": context
            if (
                context := (
                    [
                        text[max(0, m.start() - 40) : m.end() + 200]
                        for m in re.finditer(r"never sold", text, re.I)
                    ]
                    + [""]
                )[0]
            )
            else "",
        }
    else:
        out["leftwich_thread_verify"] = {"ok": False, "error": err}

    # 4) Check anniversary / vault posts from blog_calendarish + known for token costs
    # Load existing cost map names
    cost_path = RAW / "dw_legendary_token_costs.json"
    existing = json.loads(cost_path.read_text(encoding="utf-8")) if cost_path.exists() else {}
    existing_names = {k.casefold() for k in existing.keys()} if isinstance(existing, dict) else set()
    # if nested under costs
    if isinstance(existing, dict) and "costs" in existing:
        existing_names = {k.casefold() for k in existing["costs"].keys()}
        cost_blob = existing["costs"]
    else:
        cost_blob = existing if isinstance(existing, dict) else {}

    out["existing_cost_count"] = len(cost_blob)

    # Scan 9th/10th/11th anniversary pages for vault schedules
    ann_urls = [
        u
        for u in sorted(set(out["blog_calendarish"] + list(known) + [x["url"] for x in found_new]))
        if "annivers" in u or "vault" in u or "calendar" in u
    ]
    name_token_re = re.compile(
        r"([A-Z][A-Za-z0-9'’\-]+(?:\s+[A-Z][A-Za-z0-9'’\-]+){0,6})\s*[-–—:]\s*(\d+)\s*tokens?",
        re.I,
    )
    for url in ann_urls:
        body, err, _ = http_get(url)
        if err or not body:
            continue
        text = strip_tags(body)
        hits = []
        for m in name_token_re.finditer(text):
            name, amt = m.group(1).strip(), m.group(2)
            if int(amt) in (100, 300, 500) and "mythical" not in name.casefold():
                hits.append({"name": name, "amount": amt})
        # also 100 Tokens / 300 Tokens section headers with following names
        if hits:
            out["new_cost_candidates"].append({"url": url, "inline_hits": hits[:40]})
        time.sleep(DELAY)

    TEMP.mkdir(parents=True, exist_ok=True)
    path = TEMP / "data_agent_extend_costs.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {path}")
    print("calendarish", len(out["blog_calendarish"]))
    print("new_calendar_urls", len(out["new_calendar_urls"]))
    print("leftwich_ok", out.get("leftwich_thread_verify", {}).get("ok"))


if __name__ == "__main__":
    main()
