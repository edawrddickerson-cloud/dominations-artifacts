"""Emit DW_LEGENDARY_TOKEN_COSTS entries for blank legendary rows only."""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT / "data" / "temp"

d = json.loads((TEMP / "dw_calendar_final_mine.json").read_text(encoding="utf-8"))
rec = dict(d["recommended"])

# Verified extras missed by parser aliases
rec["Flamma's Helmet"] = {
    "cost": "300",
    "cost_currency": "Legendary Tokens",
    "acquisition_method": "Marco Polo",
    "sources": ["https://www.dominationsworld.com/blog/legendary-calendar-august-2025"],
}
rec["Elephant Archer Quiver"] = {
    "cost": "300",
    "cost_currency": "Legendary Tokens",
    "acquisition_method": "Marco Polo",
    "sources": ["https://www.dominationsworld.com/blog/legendary-calendar-may-2025"],
}

existing: dict[str, str] = {}
with (ROOT / "data" / "artifacts.csv").open(encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f):
        if row.get("grade") == "Legendary":
            existing[row["name"]] = (row.get("cost") or "").strip()


def resolve(name: str) -> str | None:
    if name in existing:
        return name
    target = name.replace("\u2019", "'").casefold()
    for en in existing:
        if en.replace("\u2019", "'").casefold() == target:
            return en
    return None


lines: list[tuple[str, str, str, str]] = []
for name, meta in sorted(rec.items(), key=lambda x: x[0].casefold()):
    csv_name = resolve(name)
    if not csv_name:
        print("SKIP no csv", repr(name))
        continue
    if existing[csv_name]:
        continue
    srcs = meta.get("sources") or []
    src = srcs[0] if isinstance(srcs, list) and srcs else meta.get("source", "")
    acq = meta.get("acquisition_method") or "Marco Polo"
    # Anniversary vault method if from 9th anniversary
    if "9th-anniversary" in src:
        acq = "Marco Polo (Anniversary Vault)"
    lines.append((csv_name, meta["cost"], src, acq))

out = ["# Auto-generated blank fills — merge into DW_LEGENDARY_TOKEN_COSTS", "{"]
for name, cost, src, acq in lines:
    out.append(f"    {name!r}: {{")
    out.append(f"        'cost': {cost!r},")
    out.append(f"        'cost_currency': 'Legendary Tokens',")
    out.append(f"        'acquisition_method': {acq!r},")
    out.append(f"        'source': {src!r},")
    out.append("    },")
out.append("}")
(TEMP / "dw_costs_snippet.py").write_text("\n".join(out), encoding="utf-8")
print("FILL COUNT", len(lines))
for name, cost, src, acq in lines:
    print(f"  {name}: {cost}")
