# -*- coding: utf-8 -*-
import json
from pathlib import Path

d = json.loads(Path(r"c:\Projects\Dominations Artifacts\data\temp\data_agent_anniv_cost_mine.json").read_text(encoding="utf-8"))
print("missing_count", d["missing_count"])
print("cost_json_keys", d["cost_json_keys"])
print("tokenish", d["tokenish_posts"][:30])
print("blog_hrefs", len(d["blog_hrefs_sample"]))
print("--- missing names (first 40) ---")
for n in d["legendary_released_missing_cost"][:40]:
    print(n)
print("--- anniv pages ---")
for url, e in d["pages"].items():
    if "error" in e:
        print("ERR", url, e["error"])
        continue
    if "annivers" in url or "9th" in url:
        print(url, "100=", e.get("has_100_tokens"), "300=", e.get("has_300_tokens"), "vault=", e.get("has_vault"), "inline", len(e.get("inline_100_300") or []), "ctx300", len(e.get("ctx_300") or []))
        for c in (e.get("ctx_300") or [])[:3]:
            print("  CTX:", c[:180])
        for w in (e.get("date_windows") or [])[:5]:
            print("  WIN:", w[:160])
