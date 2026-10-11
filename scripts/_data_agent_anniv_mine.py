# -*- coding: utf-8 -*-
"""Mine anniversary + vault posts for legendary token costs; improve blog crawl."""
from __future__ import annotations

import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(r"c:\Projects\Dominations Artifacts")
TEMP = ROOT / "data" / "temp"
RAW = ROOT / "data" / "raw"
UA = "DomiNationsArtifactResearch/1.0"


def http_get(url: str, timeout: int = 60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace"), None
    except Exception as e:
        return None, str(e)


def strip_tags(html: str) -> str:
    t = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    t = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", t)
    t = re.sub(r"(?is)<[^>]+>", " ", t)
    t = re.sub(r"&\w+;", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def main() -> None:
    urls = [
        "https://www.dominationsworld.com/blog/dominations-10th-anniversary",
        "https://www.dominationsworld.com/blog/dominations-11th-anniversary",
        "https://www.dominationsworld.com/blog/9th-anniversary",
        "https://www.dominationsworld.com/blog/dominations-9th-anniversary",
        "https://www.dominationsworld.com/blog/",
        "https://www.dominationsworld.com/blog/?page=2",
        "https://www.dominationsworld.com/blog/?page=3",
        "https://www.dominationsworld.com/blog/?page=5",
        "https://www.dominationsworld.com/blog/?page=8",
        "https://www.dominationsworld.com/blog/?page=12",
        "https://www.dominationsworld.com/blog/?page=16",
    ]
    # also from prior dw_url_candidates that look vault/calendar
    cand_path = TEMP / "dw_url_candidates.json"
    if cand_path.exists():
        cands = json.loads(cand_path.read_text(encoding="utf-8"))
        for u in cands:
            if any(
                k in u
                for k in (
                    "calendar",
                    "vault",
                    "annivers",
                    "token",
                    "marco",
                    "wares",
                )
            ):
                if u not in urls:
                    urls.append(u)

    out = {"pages": {}, "blog_hrefs_sample": [], "tokenish_posts": [], "vault_schedules": []}

    href_re = re.compile(r'href=["\']([^"\']+)["\']', re.I)
    for url in urls:
        body, err = http_get(url)
        if err or not body:
            out["pages"][url] = {"error": err}
            time.sleep(0.2)
            continue
        text = strip_tags(body)
        hrefs = href_re.findall(body)
        blog_hrefs = []
        for h in hrefs:
            if "blog" in h and "dominationsworld" in h.replace("www.", ""):
                blog_hrefs.append(h)
            elif h.startswith("/blog/"):
                blog_hrefs.append("https://www.dominationsworld.com" + h.split("?")[0])
        blog_hrefs = sorted(set(blog_hrefs))
        entry = {
            "len": len(body),
            "text_len": len(text),
            "has_100_tokens": bool(re.search(r"100\s+Tokens?", text, re.I)),
            "has_300_tokens": bool(re.search(r"300\s+Tokens?", text, re.I)),
            "has_vault": bool(re.search(r"vault", text, re.I)),
            "legendary_token_mentions": len(re.findall(r"Legendary\s+Tokens?", text, re.I)),
            "blog_href_count": len(blog_hrefs),
        }
        # extract vault windows
        for m in re.finditer(
            r"(.{0,40}\d{1,2}/\d{1,2}\s*[-–]\s*\d{1,2}/\d{1,2}.{0,80}(?:Legendary|Token|Vault).{0,80})",
            text,
            re.I,
        ):
            entry.setdefault("date_windows", []).append(m.group(1)[:200])
            if len(entry.get("date_windows", [])) >= 15:
                break
        # name - N tokens
        inline = []
        for m in re.finditer(
            r"([A-Z][^.]{2,60}?)\s*[-–—]\s*(\d+)\s*tokens?",
            text,
            re.I,
        ):
            amt = m.group(2)
            if amt in {"100", "300"}:
                inline.append({"name": m.group(1).strip()[-60:], "amount": amt})
        entry["inline_100_300"] = inline[:50]
        # contexts around 300 Legendary Tokens
        ctx = []
        for m in re.finditer(r".{0,100}300\s+Legendary\s+Tokens?.{0,150}", text, re.I):
            ctx.append(m.group(0))
            if len(ctx) >= 5:
                break
        entry["ctx_300"] = ctx
        out["pages"][url] = entry
        if "/blog/?page" in url or url.rstrip("/").endswith("/blog"):
            out["blog_hrefs_sample"].extend(blog_hrefs)
        time.sleep(0.25)

    out["blog_hrefs_sample"] = sorted(set(out["blog_hrefs_sample"]))[:200]
    # filter tokenish from sample
    for u in out["blog_hrefs_sample"]:
        slug = u.rstrip("/").split("/")[-1]
        if re.search(r"calendar|vault|token|annivers|marco", slug, re.I):
            out["tokenish_posts"].append(u)

    # Load existing costs and compare which legendaries still lack cost
    import csv

    costs_raw = json.loads((RAW / "dw_legendary_token_costs.json").read_text(encoding="utf-8"))
    if "costs" in costs_raw:
        costs = costs_raw["costs"]
    else:
        costs = costs_raw
    rows = list(csv.DictReader(open(ROOT / "data" / "artifacts.csv", encoding="utf-8")))
    missing = []
    for r in rows:
        if r["grade"] != "Legendary":
            continue
        if (r.get("cost") or "").strip():
            continue
        if r["release_status"] != "Released":
            continue
        missing.append(r["name"])
    out["legendary_released_missing_cost"] = missing
    out["missing_count"] = len(missing)
    out["cost_json_keys"] = len(costs)

    path = TEMP / "data_agent_anniv_cost_mine.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print("wrote", path)
    print("missing_cost", len(missing))
    print("tokenish", out["tokenish_posts"][:20])
    print("blog_hrefs", len(out["blog_hrefs_sample"]))


if __name__ == "__main__":
    main()
