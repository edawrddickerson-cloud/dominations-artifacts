"""Build data/raw/dw_legendary_token_costs.json from mines + prior known costs."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT / "data" / "temp"
OUT = ROOT / "data" / "raw" / "dw_legendary_token_costs.json"

# Prior costs already in build_canonical DW_LEGENDARY_TOKEN_COSTS
PRIOR = {
    "Antikythera Mechanism": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    },
    "Christmas Football": {
        "cost": "100",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    },
    "Da Vinci's Flying Machine": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    },
    "Demarcation Stone": {
        "cost": "100",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    },
    "Great Imperial Crown": {
        "cost": "100",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    },
    "Julius Caesar Statue": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    },
    "Nefertiti Bust": {
        "cost": "100",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    },
    "Supermarine Spitfire Engine": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    },
    "The Art of War": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    },
    "Vespa 150 TAP": {
        "cost": "100",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": "https://www.dominationsworld.com/blog/august-legendary-token-calendar",
    },
    "ASDIC Type 113X": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo (Anniversary Vault)",
        "source": "https://www.dominationsworld.com/blog/9th-anniversary",
    },
    "Gemini 8 Gloves": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo (Anniversary Vault)",
        "source": "https://www.dominationsworld.com/blog/9th-anniversary",
    },
    "Helgö Buddha": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo (Anniversary Vault)",
        "source": "https://www.dominationsworld.com/blog/9th-anniversary",
    },
    "Huey Armament System": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo (Anniversary Vault)",
        "source": "https://www.dominationsworld.com/blog/9th-anniversary",
    },
    "Maori War Club": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo (Anniversary Vault)",
        "source": "https://www.dominationsworld.com/blog/9th-anniversary",
    },
    "Plane Gyro Gunsight": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo (Anniversary Vault)",
        "source": "https://www.dominationsworld.com/blog/9th-anniversary",
    },
    "Thinker of Cernavoda": {
        "cost": "300",
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo (Anniversary Vault)",
        "source": "https://www.dominationsworld.com/blog/9th-anniversary",
    },
}

# Blank fills from May–Aug 2025 calendars (+ Flamma/Elephant fixes)
NEW = {
    "10th Mountain Division War Kit": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "6th Anniversary Six-Shooter": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Admiral Yi\u2019s Helmet": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-may-2025",
    ),
    "Arm Reliquary of Charlemagne": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-may-2025",
    ),
    "Ashanti Kuduo": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    ),
    "Aztec Calendar": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
    ),
    "Battersea Shield": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Capt. McConnell's Hero Ensemble": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-may-2025",
    ),
    "Clem Sohn's Wingsuit": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-may-2025",
    ),
    "Creighton Abrams Tank Commander Kit": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Crescent Blade": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-may-2025",
    ),
    "Desert Storm PSN-8 Manpack": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
    ),
    "Elephant Archer Quiver": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-may-2025",
    ),
    "Fengguan Phoenix Crown": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    ),
    "Flamma's Helmet": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Gemini 8 Helmet": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "General Pershing's Bas-Relief": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
    ),
    "Leonidas Bust": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
    ),
    "Lewis Chessmen": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    ),
    "Lycurgus Cup": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Mask of Agamemnon": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
    ),
    "Mask of Tutankhamun": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    ),
    'Normandy SCR-536 "Walkie-Talkie"': (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Quimbaya Treasure": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Raven Rattle": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    ),
    "Red Baron's Engine": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
    ),
    "Sanada Yukimura's Armor": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-june-2025",
    ),
    "Silla Gold Crown": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Sojourner Mars Rover": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    ),
    "Sophilos Dinos": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Stopler Revolver": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    ),
    "Sutton Hoo Helmet": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "The White Death's War Kit": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Tizona Sword": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-august-2025",
    ),
    "Tokugawa Ieyasu's Helmet": (
        "100",
        "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    ),
    "Warka Vase": (
        "300",
        "https://www.dominationsworld.com/blog/legendary-calendar-july-2025",
    ),
}

merged = dict(PRIOR)
for name, (cost, src) in NEW.items():
    if name in merged:
        continue
    merged[name] = {
        "cost": cost,
        "cost_currency": "Legendary Tokens",
        "acquisition_method": "Marco Polo",
        "source": src,
    }

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT} with {len(merged)} entries")
