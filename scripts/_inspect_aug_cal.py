"""Inspect August 2025 calendar HTML structure for 100 vs 300 columns."""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0"
url = "https://www.dominationsworld.com/blog/legendary-calendar-august-2025"
req = urllib.request.Request(url, headers={"User-Agent": UA})
html = urllib.request.urlopen(req, timeout=45).read().decode("utf-8", "replace")
Path("data/temp/aug2025_cal.html").write_text(html, encoding="utf-8")

# Find content around Tokens
for m in re.finditer(r".{0,80}(?:100|300)\s*Tokens?.{0,400}", html, re.I | re.S):
    s = re.sub(r"\s+", " ", m.group(0))
    print(s[:500])
    print("---")

# table structure?
print("tables", len(re.findall(r"<table", html, re.I)))
print("columns/divs with token")
for m in re.finditer(r"<(?:td|div|p|span)[^>]{0,120}>([^<]*(?:100|300)\s*Tokens?[^<]*)", html, re.I):
    print(repr(m.group(1)[:120]))
