import csv
from collections import Counter

rows = list(csv.DictReader(open("data/artifacts.csv", encoding="utf-8")))
leg = [r for r in rows if r["grade"] == "Legendary"]
print("status", Counter(r["release_status"] for r in leg))
print("cost filled", sum(1 for r in leg if (r.get("cost") or "").strip()), "/", len(leg))
print("perk gaps", [r["name"] for r in leg if int(r["perk_count"] or 0) == 0])
want = [
    "Mask of Tutankhamun",
    "Leftwich Trophy",
    "Elephant Archer Quiver",
    "Flamma's Helmet",
    "Silla Gold Crown",
]
for name in want:
    r = next(x for x in leg if x["name"] == name)
    print(
        repr(r["name"]),
        "status=",
        r["release_status"],
        "cost=",
        r.get("cost"),
        "perks=",
        r["perk_count"],
    )
    print("  notes:", (r.get("notes") or "")[:220])
