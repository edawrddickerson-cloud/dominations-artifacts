# -*- coding: utf-8 -*-
import json, urllib.parse, urllib.request, time
from pathlib import Path

API = "https://dominations.fandom.com/api.php"
UA = "DomiNationsArtifactResearch/1.0"
RAW = Path(r"c:\Projects\Dominations Artifacts\data\raw")
OUT = RAW / "wiki_pages"

queries = [
    "Benin",
    "Ivory Mask",
    "Golden Lyre",
    "Mona Lisa",
    "Dodecahedron",
    "Dodechedron",
    "Dung-Dkar",
    "Dung Dkar",
    "Tibetan",
    "Lyre of Ur",
]

def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))

for q in queries:
    data = api({"action": "query", "list": "search", "srsearch": q, "srlimit": 8, "format": "json"})
    hits = [h["title"] for h in data.get("query", {}).get("search", [])]
    print(f"SEARCH {q!r}: {hits}")
    time.sleep(0.3)

# Also check template for exact link text around Benin / Mona / Roman / Tibetan / Lyre
text = (RAW / "raw_wiki_Template_LegendaryArtifactsMenu.txt").read_text(encoding="utf-8", errors="replace")
for needle in ["Benin", "Mona", "Roman", "Tibetan", "Lyre", "Golden", "Dodec"]:
    i = text.find(needle)
    print(f"\nTEMPLATE context {needle}:", repr(text[max(0,i-40):i+80]) if i>=0 else "NOT FOUND")
