import csv
from collections import Counter

leg = list(csv.DictReader(open("dominations_legendary_snapshot_DRAFT.csv", encoding="utf-8")))
myth = list(csv.DictReader(open("dominations_mythicals_verified_partial_DRAFT.csv", encoding="utf-8")))

print("=== LEGENDARY ===")
print("count", len(leg))
print("by hall", dict(Counter(r["hall"] for r in leg)))
perk_filled = [r for r in leg if r.get("perk_1")]
print("with perk_1", len(perk_filled))
print("without perks", len(leg) - len(perk_filled))
print("data_status", dict(Counter(r.get("data_status", "") for r in leg)))
print("\nWith perks:")
for r in perk_filled:
    print(f"  {r['name']} | hall={r['hall']} | {r['data_status']}")

print("\n=== MYTHICAL ===")
print("count", len(myth))
print("by hall", dict(Counter(r["hall"] for r in myth)))
perk_filled_m = [r for r in myth if r.get("perk_1")]
print("with perk_1", len(perk_filled_m))
print("without perks:")
for r in myth:
    if not r.get("perk_1"):
        print(" ", r["name"], r.get("data_status"))

print("\n=== SCHEMA ===")
print("legendary cols:", list(leg[0].keys()) if leg else None)
print("mythical cols:", list(myth[0].keys()) if myth else None)
