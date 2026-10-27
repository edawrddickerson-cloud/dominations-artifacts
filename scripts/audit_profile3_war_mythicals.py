"""Read-only comparison of an exported Profile 3 workspace with canonical data.

Writes review evidence and a report only. Never imports or changes planner data.
Input is the private snapshot captured with backup_database.cjs in read-only mode.
"""
import csv
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEM = 'profile3-war-mythical-review-2026-10-27'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def key(value):
    return re.sub(r'[^a-z0-9]', '', value.lower())


def wiki_rows(path):
    text = path.read_text(encoding='utf-8')
    section = text.split('== Statistic ==')[-1].split('|}')[0]
    result = []
    for block in section.split('|-')[1:]:
        text = re.sub(r'\[\[([^]|]+)\|([^]]+)\]\]', r'\2', block)
        text = re.sub(r'\[\[([^]]+)\]\]', r'\1', text)
        cells = [x.strip() for x in re.split(r'\|\||\n\|', text.strip().lstrip('|')) if x.strip()]
        if len(cells) == 2:
            result.append({'name': cells[0], 'value': cells[1]})
    return result


def main():
    source = ROOT / 'data/temp/profile3-review-workspace.json'
    snapshot = json.loads(source.read_text(encoding='utf-8'))
    data = snapshot['data']
    profiles = json.loads(data['settings']['dn-profiles'])
    profile, = [p for p in profiles['profiles'] if p['name'] == 'Profile 3']
    prefix = 'dn-p:' + profile['id'] + ':'
    strategies = json.loads(data['settings'][prefix + 'dn-strategies'])
    strategy, = [s for s in strategies['strategies'] if s['id'] == strategies['activeId']]
    layout = strategy['loadout']['War']
    records = next(r for r in data['records'] if r['id'] == 'collection:' + profile['id'])['items']
    canonical = json.loads((ROOT / 'data/artifacts.json').read_text(encoding='utf-8'))
    by_id = {r['artifact_id']: r for r in canonical}
    scans = {r['id']: r for r in records}
    images = json.loads((ROOT / 'data/raw/artifact_images.json').read_text(encoding='utf-8'))['images']
    ui_images = json.loads((ROOT / 'ui/data/artifact_images.json').read_text(encoding='utf-8'))
    # UI image exports are flattened to artifact_id -> URL.
    ui_images = ui_images.get('images', ui_images)
    ids = list(layout['singles'])
    aliases = {key(r['raw_perk_name']): key(r['canonical_perk_name']) for r in
               csv.DictReader((ROOT / 'data/perk_name_mapping.csv').open(encoding='utf-8-sig', newline=''))}
    def perk_key(name):
        name = name.replace('Hitpoints and Damage', 'Hitpoints & Damage').replace('Defenders Movement', 'Defender Movement').replace('Defenders Spawn', 'Defender Spawn')
        return aliases.get(key(name), key(name))
    assert len(ids) == 22 and all(layout['singles'][i] == 1 for i in ids)
    selected = []
    for item_id in ids:
        scan = scans.get(item_id)
        row = by_id.get((scan or {}).get('catalogId') or item_id)
        name = scan['name'] if scan else row['name']
        same_name = [r for r in canonical if key(r['name']) == key(name)]
        if not row:
            mythical = [r for r in same_name if r['grade'] == 'Mythical']
            assert not mythical, (name, mythical)
        raw_name = name.replace('’', "'").replace(' ', '_') + '(Mythical_War_Artifacts).txt'
        wiki = ROOT / 'data/raw/wiki_pages' / raw_name
        if not wiki.exists():
            wiki = next((p for p in (ROOT / 'data/raw/wiki_pages').glob('*.txt')
                         if key(p.stem) == key(name + '(Mythical_War_Artifacts)')), None)
        rows, flags = [], []
        if row is None:
            flags += ['missing-canonical-mythical', 'missing-mythical-cost-and-image-map']
        if scan is None:
            flags += ['database-only-no-independent-scan']
        if scan:
            assert scan['hall'] == 'war' and scan['type'] == 'War Mythical' and len(scan['rows']) == 6
        if row:
            assert row['hall'] == 'War' and row['grade'] == 'Mythical' and int(row['perk_count']) == 6
            if str(row['cost']) != '1000' or row['cost_currency'] != 'Legendary Tokens':
                flags += ['cost-or-currency-conflict']
        for index in range(1, 7):
            observed = scan['rows'][index - 1] if scan else None
            expected = ({'name': row[f'perk_{index}_name'], 'base': row[f'perk_{index}_base'],
                         'max': row[f'perk_{index}_max']} if row else None)
            comparison = 'database-only' if observed is None else 'canonical-entry-missing' if expected is None else 'match'
            if observed and expected:
                if observed['name'] != expected['name'] or float(observed['base']) != float(expected['base']):
                    comparison = 'name-or-base-conflict'
                    flags += [f'perk-{index}-name-or-base-conflict']
                if str(observed['max']) != expected['max']:
                    flags += [f'perk-{index}-derived-max-differs']
            rows.append({'slot': index, 'stored': observed, 'canonical': expected, 'comparison': comparison})
        if scan:
            flags += ['reviewed-scan-text-not-independent-pixel-verification', 'derived-maxima-unverified']
        if name == 'Leonidas Bust':
            flags += ['non-percent-effect-generic-range-inference']
        if name == 'Norden Bombsight':
            flags += ['non-percent-effect-generic-range-inference']
        historical = None
        if wiki:
            cached = wiki_rows(wiki)
            current = [(perk_key(r['stored']['name'] if r['stored'] else r['canonical']['name']),
                        float(r['stored']['value'] if r['stored'] else r['canonical']['base'])) for r in rows]
            old = [(perk_key(r['name']), float(re.search(r'[+-]?\d+', r['value'])[0])) for r in cached]
            if old != current:
                historical = {'kind': 'order-only' if Counter(old) == Counter(current) else 'name-or-value',
                              'differentSlots': [j + 1 for j, (left, right) in enumerate(zip(current, old)) if left != right]}
                flags += ['cached-source-' + historical['kind'] + '-conflict']
        screenshot = None
        if name == '10th Mountain Division War Kit':
            screenshot = 'data/raw/profile3-war-mythical-review/10th-mountain-division-war-kit.png'
            flags = [f for f in flags if f != 'reviewed-scan-text-not-independent-pixel-verification']
            flags += ['six-current-values-and-levels-visually-confirmed']
        selected.append({'name': name, 'layoutId': item_id, 'canonicalId': row['artifact_id'] if row else None,
                         'evidenceKind': 'stored-reviewed-scan' if scan else 'database-only',
                         'scan': scan, 'canonical': row, 'perks': rows,
                         'sameNameOtherEditions': [{'id': r['artifact_id'], 'grade': r['grade'], 'hall': r['hall'],
                                                    'cost': r['cost'], 'currency': r['cost_currency']} for r in same_name if r != row],
                         'imageMap': images.get(row['artifact_id']) if row else None,
                         'sourceScreenshot': screenshot,
                         'sourceScreenshotSha256': digest(ROOT / screenshot) if screenshot else None,
                         'historicalSourceComparison': historical,
                         'cachedWiki': {'path': str(wiki.relative_to(ROOT)).replace('\\', '/'), 'sha256': digest(wiki),
                                        'rows': wiki_rows(wiki)} if wiki else None, 'flags': flags})
    names = Counter(key(i['name']) for i in selected)
    assert not [n for n, count in names.items() if count > 1]
    csv_rows = list(csv.DictReader((ROOT / 'data/artifacts.csv').open(encoding='utf-8-sig', newline='')))
    assert csv_rows == canonical, 'Canonical CSV/JSON differ'
    assert (ROOT / 'data/artifacts.json').read_bytes() == (ROOT / 'ui/data/artifacts.json').read_bytes()
    for item in selected:
        if item['canonicalId']:
            image = ui_images.get(item['canonicalId'])
            url = image.get('url') if isinstance(image, dict) else image
            assert url == item['imageMap']['url'], (item['name'], url)
    scanned = [i for i in selected if i['scan']]
    report = {'version': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'status': 'review-only-no-canonical-writes',
              'profile': profile, 'workspaceRevision': snapshot['revision'], 'strategy': {'id': strategy['id'], 'name': strategy['name']},
              'source': {'path': str(source.relative_to(ROOT)).replace('\\', '/'), 'sha256': digest(source)},
              'canonicalSources': {p: digest(ROOT / p) for p in ['data/artifacts.json', 'data/artifacts.csv', 'ui/data/artifacts.json', 'data/raw/artifact_images.json']},
              'costAuthority': {'amount': 1000, 'currency': 'tokens', 'source': 'Explicit user confirmation in this task', 'appliesTo': 'all 22 selected War Mythicals'},
              'summary': {'items': len(selected), 'storedScans': len(scanned), 'databaseOnly': len(selected) - len(scanned),
                          'missingCanonical': sum(i['canonical'] is None for i in selected), 'duplicateIdentities': [],
                          'scannedRows': sum(len(i['scan']['rows']) for i in scanned),
                          'historicalSourceConflicts': [{'name': i['name'], **i['historicalSourceComparison']} for i in selected if i['historicalSourceComparison']],
                          'levelSources': dict(Counter(r['levelSource'] for i in scanned for r in i['scan']['rows'])),
                          'allScannedLevelsOne': all(r['level'] == 1 for i in scanned for r in i['scan']['rows'])},
              'items': selected}
    target = ROOT / 'reports' / STEM
    target.with_suffix('.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    lines = ['# Profile 3: 22 War Mythicals — discrepancy review', '',
             'Review only. Canonical entries, profile settings, inventory and hosted data were not changed.', '',
             f"Evidence: saved workspace revision {snapshot['revision']}, Profile 3 (`{profile['id']}`), active strategy `{strategy['name']}`. The 22 War layout identities comprise 17 stored six-row scan records plus five database-only entries. All layout quantities are one; no duplicate identities or same-name Mythical entries were found. The unrelated Main craft and two Main ownership checkboxes are outside scope.", '',
             'Canonical owners: `data/artifacts.json` and `data/artifacts.csv`; `ui/data/artifacts.json` is the served copy. CSV/JSON contents and UI JSON were checked for agreement. Six selected Mythicals are absent, although their Legendary editions exist. Those editions are distinct items, not substitutes or duplicates. Conversely, Elephant Archer Quiver and Ramesses II’s Abu Simbel are canonical War Mythicals outside this profile’s 22; their absence here is not a database defect.', '',
             '**Cost authority:** the user confirms 1,000 tokens for every one of the 22. All 16 existing canonical rows already say `1000` / `Legendary Tokens`; no conflicting price or currency was found in that scope. The six absent Mythicals have no canonical cost or image entry. Any 100/300-token prices on their Legendary editions do not apply to these Mythicals.', '',
             '**Provenance:** all 17 stored scans have `reviewed: true` and `manualCorrection: true`. All 102 rows are level 1; their levels have OCR/manual source labels (counts in JSON). All have empty `inferredFields`, null `valueSource`, and `rangeSource: inferred-level`. The save path retains current rows rather than replacing them with catalog perks (`ui/storage-scanner.js:41,191`; `ui/stored-artifacts.js:240,650`). Nevertheless, original OCR text/confidence and field-specific value/name corrections were not retained. These are reviewed scan-derived text, not 102 independently verified OCR readings. A null value source does not prove direct OCR. Linked titles/classification/IDs are normalized from the catalog; stored rows remain separate. The five entries without scans display database values and cannot validate that database independently.', '',
             '**Levels and maxima:** compare level-1 current values against base values. Every scanned row records level 1, so upgrades do not explain the Maori discrepancy. Base/max endpoints were inferred by `impliedRange` (`ui/stored-artifacts.js:316`) using signed magnitude minus `(level - 1)` and a generic +9 maximum. The current row values are retained in JSON. These derived maxima are not game observations; do not promote them to verified Mythical maximums. Count/trigger perks must not be interpreted as percentages or upgraded with that generic rule.', '',
             '**Images:** no image or artwork ID is retained in any of the 17 selected scan records. Existing canonical entries have image URLs, whose UI mappings agree with the raw mapping, but URL presence does not verify the image or current availability. A local screenshot of 10th Mountain Division War Kit was found and inspected; it confirms the title, War Mythical banner, six stars, six displayed values and each 1/10 level. It shows skis/rifle/poles artwork. Its Mythical database/image entry is missing. Other recent screenshots show Arm Reliquary’s Legendary edition and Admiral Yi’s Main editions; those do not verify these War Mythicals. No corresponding game screenshots were located for the other 21 in the repository, Downloads, Desktop or Pictures/Screenshots searched here. No remote image fetch was needed for this local comparison.', '',
             '**Review queue:** this dated report and its JSON follow the existing `reports/discrepancies.md` review mechanism. The OCR alias feedback queue is for recognition rules, not canonical item corrections; nothing was submitted there.', '',
             '| # | Item | Evidence | Finding | Cost | Image |', '|---|---|---|---|---|---|']
    for n, item in enumerate(selected, 1):
        name, scan, row = item['name'], item['scan'], item['canonical']
        finding = 'Missing Mythical entry; Legendary edition exists' if not row else 'Database only; no independent stat check' if not scan else 'Six names and level-1 values match'
        if name == 'Maori War Club': finding = 'Row 5 name and base differ; see detail'
        if name == 'Leonidas Bust': finding += '; row 2 inferred max 10 unsupported'
        if name == 'Norden Bombsight': finding += '; row 2 max 10 unsupported'
        if item['historicalSourceComparison']:
            finding += '; cached source ' + item['historicalSourceComparison']['kind'] + ' conflict'
        image = 'Screenshot checked; Mythical mapping absent' if item['sourceScreenshot'] else 'Mapping absent; screenshot unavailable' if not row else 'URL mapped; screenshot unavailable'
        lines.append(f"| {n} | {name} | {'Scan + pixels' if item['sourceScreenshot'] else 'Reviewed scan text' if scan else 'Database only'} | {finding} | {'1,000 tokens matches' if row else '1,000 tokens confirmed; entry missing'} | {image} |")
    lines += ['', '## Item evidence', '', 'Percentages below are signed. `1 (effect)` is a non-percent effect/count. Slot order and repeated perks are preserved. “Match” means stored text agrees, not independently proven game accuracy. Cached wiki files are historical corroboration, not new pixel evidence; they can share sources with the canonical database. JSON contains full stored row metadata, source hashes, canonical provenance URLs and all flags.', '']
    for n, item in enumerate(selected, 1):
        scan, row = item['scan'], item['canonical']
        lines += [f"### {n}. {item['name']}", '', f"Identity: `{item['layoutId']}`. Classification: War / Mythical ({'stored six-row scan; banner independently checked' if item['sourceScreenshot'] else 'stored six-row scan; linked classification normalized from catalog' if scan and row else 'stored six-row scan; source banner unavailable' if scan else 'database classification only'}).", '']
        if scan:
            lines += [f"Captured: `{scan['capturedAt']}`; accepted: `{scan['acceptedAt']}`. No original image is embedded. Names/current values may contain manual edits; level source is shown separately.", '']
        if item['sourceScreenshot']:
            lines += ['Pixel evidence: [original game screenshot](../' + item['sourceScreenshot'] + '). All six level-1 values below agree; artwork is skis/rifle/poles. This verifies current/base values, not future upgrade maxima or price.', '']
        lines += ['| Slot | Profile perk | Current / level | Canonical perk / base / max | Result |', '|---|---|---|---|---|']
        for perk in item['perks']:
            obs, exp = perk['stored'], perk['canonical']
            name = obs['name'] if obs else exp['name']
            nonpercent = 'Deploys' in name
            value = (str(obs['value']) + (' (effect)' if nonpercent else '%') + f" / L{obs['level']} ({obs['levelSource']})") if obs else 'No scan; database supplied'
            expected = 'Missing entry' if not exp else f"{exp['name']} / {exp['base']}{' (effect)' if 'Deploys' in exp['name'] else '%'} / {exp['max'] or 'unknown'}"
            lines.append(f"| {perk['slot']} | {name} | {value} | {expected} | {perk['comparison']} |")
        lines += ['']
        repeated = Counter(p['stored']['name'] for p in item['perks'] if p['stored'])
        if any(c > 1 for c in repeated.values()):
            lines += ['Repeated perks: ' + '; '.join(f'{name} ×{c}' for name, c in repeated.items() if c > 1) + '. Preserved as separate slots; not duplicate items. Cached Mythical source also provides slot evidence below.', '']
        if item['name'] == 'Maori War Club':
            lines += ['**Review: row 5.** Profile has **Invading Recon Scan Duration −10%**, L1, inferred max −19. Canonical has **Enemy Recon Plane Scan Duration −12%**, max −21. Both names exist separately in the perk mapping; this is not an accepted alias. The cached Mythical page explicitly lists Invading Recon Scan Duration −10%, corroborating the profile text. Confirm current game pixels before editing canonical data; the −10 versus −12 difference is not explained by the recorded L1 upgrade state.', '']
        if item['name'] == 'Leonidas Bust':
            lines += ['**Review: row 2 range.** Stored current value is 1 for Mercenary Camp Deploys Spartans when Destroyed; generic inference produced base 1 / max 10. Canonical max is blank. The cached source uses +1 without a percent sign. Retain the effect as a count/trigger; max 10 is unsupported and is a profile-derived range issue, not evidence that canonical needs max 10.', '']
        if item['name'] == 'Norden Bombsight':
            lines += ['**Review: row 2 range.** APC Deploys Marines On Death has stored current value 1 but inferred max 10. Cached Mythical source says +1 without %. Do not turn this into +1%/+10% or assert an upgraded effect count. Rows 1 and 5 both list Invading Fighter Damage −13% in the profile and cached source; do not deduplicate them.', '']
        if not row:
            lines += ['**Review: add candidate only.** No same-name Mythical was found anywhere in canonical data. Existing other editions: ' + ', '.join(f"`{r['id']}` ({r['hall']} {r['grade']}; {r['cost']} {r['currency']})" for r in item['sameNameOtherEditions']) + '. Their perks, prices and artwork are not substitutes for a Mythical entry. Proposed cost is 1,000 tokens from the user, independent of scanned text.', '']
        if not scan:
            lines += ['**Unverified:** these six perks originate solely from the existing database. No separate scanned values, scanned levels or Mythical source image was retained in Profile 3. Agreement with the screen’s database-backed display would be circular.', '']
        historical = item['historicalSourceComparison']
        if historical:
            if historical['kind'] == 'order-only':
                lines += ['**Historical source review:** the cached Mythical page has the same six signed perk/value pairs in a different slot order. This is an ordering discrepancy only; it does not establish a missing perk or different total. No game screenshot establishes the correct order for this database-only entry.', '']
            elif item['name'] == 'Arm Reliquary of Charlemagne':
                lines += ['**Historical source review:** canonical row 1 Transport Cooldown is −12% (max −21), while the cached Mythical page says −11%. Profile 3 supplies no independent scan or level for this item. Flag the one-point base discrepancy; do not choose a correction or assume an upgrade without a Mythical game screenshot. The available Arm Reliquary screenshot is Legendary and cannot settle this.', '']
            elif item['name'] == 'Red Baron’s Engine':
                lines += ['**Historical source review:** cached Mythical row 1 says Enemy Air Defense Damage **+11%**, while the saved profile says **−11%**. Cached row 6 says **Invading Fighters Damage −11%**, while the profile says **Invading Fighter Hitpoints −11%**. The first may be a source sign error; the second changes the stat kind. No retained game screenshot settles either. Keep both flags attached to this missing-entry candidate.', '']
        if item['cachedWiki']:
            wiki = item['cachedWiki']
            lines += ['Historical source: [' + Path(wiki['path']).name + '](../' + wiki['path'].replace("'", '%27') + '). Extracted source rows: ' + '; '.join(f"{r['name']} {r['value']}" for r in wiki['rows']) + '.', '']
        lines += ['Cost: ' + ('canonical 1,000 Legendary Tokens agrees with the user-confirmed 1,000 tokens.' if row else 'canonical Mythical cost absent; user confirms 1,000 tokens.'), '', 'Flags: ' + ', '.join('`' + f + '`' for f in item['flags']) + '.', '']
    lines += ['## Validation and limits', '', 'Checked exactly 22 distinct War layout identities, 17 six-row stored scans (102 rows), five database-only entries, canonical CSV/JSON/UI parity, image-map parity, duplicate normalized names, level metadata, all costs/currencies and six-perk slot comparisons. One game screenshot was read independently. No canonical build, recognition rerun, planner save, database write, deployment or UI change was performed. Original raw OCR and additional game screenshots remain unavailable, so scan-derived text matches are not a blanket correctness claim. Evidence JSON and the copied original screenshot include SHA-256 references for reproducibility.', '']
    target.with_suffix('.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps(report['summary'], indent=2))
    print(target.with_suffix('.md'))


if __name__ == '__main__':
    main()
