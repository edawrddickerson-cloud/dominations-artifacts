# -*- coding: utf-8 -*-
import json, csv, re
from pathlib import Path
from collections import Counter

ROOT = Path(r"c:\Projects\Dominations Artifacts")
RAW = ROOT / "data" / "raw"
manifest = json.loads((RAW / "wiki_pages_manifest.json").read_text(encoding="utf-8"))
perks = json.loads((RAW / "wiki_perk_extract.json").read_text(encoding="utf-8"))

def norm(s):
    s = s.casefold()
    s = s.replace("\u2019", "'").replace("\u2018", "'")
    s = s.replace("�", "'")
    return s

draft = set()
for csv_name in [
    "dominations_legendary_snapshot_DRAFT.csv",
    "dominations_mythicals_verified_partial_DRAFT.csv",
]:
    for p in [RAW / csv_name, ROOT / csv_name]:
        if p.exists():
            with p.open(encoding="utf-8-sig", newline="") as fh:
                for row in csv.DictReader(fh):
                    n = (row.get("name") or "").strip()
                    if n:
                        draft.add(norm(n))

ok = [e for e in manifest if e.get("ok")]
fail = [e for e in manifest if not e.get("ok")]
print("OK", len(ok), "FAIL", len(fail))
print("files on disk", len(list((RAW / "wiki_pages").glob("*.txt"))))

def cat(t):
    if t.endswith("(Mythical War Artifacts)"):
        return "myth_war"
    if t.endswith("(Mythical Artifacts)"):
        return "myth_main"
    if t in (
        "Legendary Artifacts",
        "Legendary War Artifacts",
        "Mythical Artifacts",
        "Mythical War Artifacts",
    ):
        return "list"
    return "plain_or_legendary"

print("ok cats", dict(Counter(cat(e["title"]) for e in ok)))
print("fail cats", dict(Counter(cat(e["title"]) for e in fail)))

required = [
    "British Kettle Drum(Mythical War Artifacts)",
    "First Strike Star",
    "Analytical Engine",
    "DomiNations Army Helmet",
    "Dominations Army Helmet",
    "Mahiole",
    "11th Anniversary Cake",
    "Dilophosaurus Skull",
    "Mask of Tutankhamun",
    "Benin Royal Ivory Mask",
    "Golden Lyre of Ur",
    "Mona Lisa",
    "Roman Dodechedron",
    "Roman Dodecahedron",
    "Tibetan Dung-Dkar",
]
by_title = {e["title"]: e for e in manifest}
print("\n=== REQUIRED ===")
for t in required:
    e = by_title.get(t)
    if not e:
        print(t, "NOT IN MANIFEST")
        continue
    print(f"{t}: ok={e['ok']} len={e['length']} err={e.get('error')}")

def clean(title):
    return re.sub(r"\(Mythical(?: War)? Artifacts\)$", "", title).strip()

skip = {
    "Legendary Artifacts",
    "Legendary War Artifacts",
    "Mythical Artifacts",
    "Mythical War Artifacts",
    "Library",
    "Technology",
    "Museum",
    "Archaeology Capstone",
}

wiki_ok_names = set()
for e in ok:
    t = e["title"]
    if t in skip:
        continue
    wiki_ok_names.add(clean(t))

for r in perks:
    n = (r.get("artifact_name") or "").strip()
    if n and n not in skip:
        wiki_ok_names.add(n)

wiki_only = sorted({n for n in wiki_ok_names if norm(n) not in draft}, key=str.casefold)
print("\nwiki_only count", len(wiki_only))
for n in wiki_only:
    print(" -", n)

stat = [r for r in perks if r.get("source") == "statistic_table"]
qv = [r for r in perks if r.get("source") == "quick_view"]
print("\nstat tables", len(stat), "quick_view", len(qv))
print("unique artifact names with any perks", len({r["artifact_name"] for r in perks}))

print("\n=== BKD Mythical ===")
for r in perks:
    if r.get("page_title") == "British Kettle Drum(Mythical War Artifacts)":
        print(json.dumps(r, indent=2, ensure_ascii=False))

print("\nfail reason counts", Counter((e.get("error") or "")[:60] for e in fail).most_common(5))

leg_extras = [
    "Benin Royal Ivory Mask",
    "Dilophosaurus Skull",
    "Golden Lyre of Ur",
    "Mask of Tutankhamun",
    "Mona Lisa",
    "Roman Dodechedron",
    "Roman Dodecahedron",
    "Tibetan Dung-Dkar",
    "Analytical Engine",
    "Mahiole",
    "First Strike Star",
    "DomiNations Army Helmet",
    "11th Anniversary Cake",
]
print("\nextras perk status:")
for t in leg_extras:
    e = by_title.get(t)
    has = [
        r
        for r in perks
        if (r.get("artifact_name") == t or r.get("page_title") == t) and r.get("perks")
    ]
    print(
        " ",
        t,
        "page_ok=",
        e["ok"] if e else None,
        "perk_sources=",
        [r["source"] for r in has],
        "n_perks=",
        len(has[0]["perks"]) if has else 0,
    )

# Mythical pages that succeeded
myth_ok = [e["title"] for e in ok if cat(e["title"]) in ("myth_main", "myth_war")]
print("\nmyth pages ok count", len(myth_ok))
print("sample myth ok:", myth_ok[:15])
