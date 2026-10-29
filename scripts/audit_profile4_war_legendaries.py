"""Compare Profile 4's reviewed War Legendary scans with canonical data.

Defaults to a read-only cloud snapshot. --apply persists the selected scans in
the existing override manifest and synchronizes canonical CSV/JSON and UI JSON.
Account settings, ownership, cloud workspaces and other editions are untouched.
"""
import argparse
import csv
import copy
import hashlib
import json
import re
from pathlib import Path

from artifact_scan_images import scan_catalog_row
from artifact_verified_overrides import apply_verified_overrides

ROOT = Path(__file__).resolve().parents[1]
STEM = 'profile4-war-legendary-review-2026-10-27'
COUNT_EFFECTS = {
    'Mercenary Camp Deploys Spartans when Destroyed',
    'APC Deploys Marines On Death',
    'Castle spawns Sword Saints when Destroyed',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', nargs='?', type=Path, default=ROOT / 'data/temp/profile4-review-workspace.json')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--cost', choices=('100', '300'), default='300')
    parser.add_argument('--report-stem', default=STEM)
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9-]+', args.report_stem):
        parser.error('--report-stem must be a simple lowercase filename stem')
    content = args.source.read_bytes()
    snapshot = json.loads(content.decode('utf-8-sig'))
    workspace = snapshot.get('data', snapshot)
    assert workspace['kind'] in ('dominations-planner-backup', 'dominations-cloud-workspace') and workspace['version'] == 1
    profile, = [p for p in json.loads(workspace['settings']['dn-profiles'])['profiles'] if p['name'] == 'Profile 4']
    collection, = [r for r in workspace['records'] if r['id'] == 'collection:' + profile['id']]
    candidates = [i for i in collection['items'] if i['hall'] == 'war' and i['type'] == 'War Legendary']
    canonical_path = ROOT / 'data/artifacts.json'
    canonical_bytes = canonical_path.read_bytes()
    canonical = json.loads(canonical_bytes)
    assert canonical_bytes == (ROOT / 'ui/data/artifacts.json').read_bytes()
    with (ROOT / 'data/artifacts.csv').open(encoding='utf-8-sig', newline='') as handle:
        assert list(csv.DictReader(handle)) == canonical
    by_id = {r['artifact_id']: r for r in canonical}
    # Resolve edition before filtering: 100-token captures can arrive while a
    # 300-token review is running. Never validate or apply their stat rows here.
    scans = [item for item in candidates if scan_catalog_row(item, by_id, 'Legendary')['cost'] == args.cost]
    reviewed, seen = [], set()
    for item in scans:
        row = scan_catalog_row(item, by_id, 'Legendary')
        aid = row['artifact_id']
        assert aid not in seen, 'Duplicate identity: ' + aid
        seen.add(aid)
        assert item['reviewed'] and len(item['rows']) == 5, row['name']
        assert row['cost'] == args.cost and row['cost_currency'] == 'Legendary Tokens', row['name']
        pairs = []
        for slot, observed in enumerate(item['rows'], 1):
            assert observed['level'] == 1 and observed['base'] == observed['value'], (row['name'], slot)
            assert isinstance(observed['value'], (int, float)) and observed['value'] != 0
            number = observed['value']
            # Count/trigger effects have no independently observed upgraded max.
            maximum = '' if observed['name'] in COUNT_EFFECTS else str(int((abs(number) + 9) * (1 if number > 0 else -1)))
            old = {key: row[f'perk_{slot}_{key}'] for key in ('name', 'base', 'max')}
            new = {'name': observed['name'], 'base': str(number), 'max': maximum}
            pairs.append({'slot': slot, 'before': old, 'accepted': new,
                          'observed': {key: observed.get(key) for key in ('name', 'value', 'level', 'levelSource', 'valueSource', 'rangeSource', 'max')},
                          'different': old != new})
        reviewed.append({'artifact_id': aid, 'name': row['name'], 'scannedName': item['name'],
                         'identityAlias': item['name'] != row['name'],
                         'hasImageInSource': bool(item.get('image')), 'perks': pairs})
    missing = [{'artifact_id': row['artifact_id'], 'name': row['name']} for row in canonical
               if row['hall'] == 'War' and row['grade'] == 'Legendary' and row['cost'] == args.cost and row['artifact_id'] not in seen]
    summary = {'scannedItems': len(scans), 'scannedRows': sum(len(i['perks']) for i in reviewed),
               'itemsWithDifferences': sum(any(p['different'] for p in i['perks']) for i in reviewed),
               'differentRows': sum(p['different'] for i in reviewed for p in i['perks']),
               'newCanonicalEntries': 0, 'missingFromCollection': missing,
               'imagesInSource': sum(i['hasImageInSource'] for i in reviewed),
               'otherCostScansExcluded': len(candidates) - len(scans)}
    report = {'version': 1, 'profile': 'Profile 4', 'workspaceRevision': snapshot.get('revision'),
              'sourceSha256': hashlib.sha256(content).hexdigest(),
              'canonicalBeforeSha256': hashlib.sha256(canonical_bytes).hexdigest(),
              'status': 'applied-from-reviewed-scans' if args.apply else 'review-only',
              'cost': args.cost,
              'evidence': f"User-collected, reviewed saved scans; all {summary['scannedRows']} rows record level 1. Original stat-panel pixels and raw OCR are not retained here. No field-by-field independent pixel verification is claimed. Percentage maxima are derived by the existing Legendary +9 rule. Count-effect maxima remain unknown.",
              'summary': summary, 'items': reviewed}
    if args.apply:
        path = ROOT / 'data/raw/user_verified_artifact_overrides.json'
        document = json.loads(path.read_text(encoding='utf-8'))
        note = 'profile4_reviewed_scan_2026-10-27'
        authority = f'Profile 4: user requested reconciliation of all collected {args.cost}-token War Legendaries and their scanned artwork; reviewed level-1 scan text is the source for the selected five-perk sets (not independent pixel verification).'
        if authority not in document['authority']:
            document['authority'] += ' ' + authority
        entries = {e['artifact_id']: e for e in document['entries']}
        for item in reviewed:
            values = {'name': item['name'], 'hall': 'War', 'grade': 'Legendary', 'perk_count': '5',
                      'cost': args.cost, 'cost_currency': 'Legendary Tokens',
                      'source_primary': 'data/raw/user_verified_artifact_overrides.json',
                      'source_secondary': f'reports/{args.report_stem}.json', 'source_checked_date': '2026-10-27',
                      'availability_notes': f'Profile 4 reviewed level-1 scan; {args.cost} Legendary Tokens.',
                      'confidence': 'Medium'}
            for perk in item['perks']:
                for key, value in perk['accepted'].items():
                    values[f"perk_{perk['slot']}_{key}"] = value
            entries[item['artifact_id']] = {'artifact_id': item['artifact_id'], 'values': values, 'note': note}
        document['entries'] = list(entries.values())
        path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        fields = list(canonical[0])
        untouched = {row['artifact_id']: copy.deepcopy(row) for row in canonical if row['artifact_id'] not in seen}
        apply_verified_overrides(canonical, fields, ROOT)
        # Earlier override entries can predate later canonical normalization.
        # This reconciliation may only change the selected Profile 4 editions.
        canonical = [untouched.get(row['artifact_id'], row) for row in canonical]
        payload = json.dumps(canonical, indent=2, ensure_ascii=False) + '\n'
        canonical_path.write_text(payload, encoding='utf-8')
        (ROOT / 'ui/data/artifacts.json').write_text(payload, encoding='utf-8')
        with (ROOT / 'data/artifacts.csv').open('w', encoding='utf-8', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(canonical)
    target = ROOT / 'reports' / args.report_stem
    target.with_suffix('.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    lines = [f'# Profile 4: {args.cost}-token War Legendaries', '', report['evidence'], '',
             f"Compared {summary['scannedItems']} distinct artifacts / {summary['scannedRows']} stat rows. {summary['itemsWithDifferences']} items / {summary['differentRows']} rows differ from the current database. All selected entries already exist and already cost {args.cost} Legendary Tokens. No new item was needed.", '',
             'Canonical CSV, canonical JSON and served JSON were checked for equality before reconciliation. ' + ('Reviewed scan values are now persisted through the existing override manifest; other artifacts and account data are unchanged.' if args.apply else 'Review only; canonical data unchanged.'), '',
             '## Missing from Profile 4', '', *(['- ' + row['name'] for row in missing] or ['None.']), '',
             f'This list is the difference against currently cataloged {args.cost}-token War Legendaries, not an exhaustive claim about uncataloged releases or artifacts with unknown token costs.', '',
             '## Stat differences', '', '| Artifact | Slot | Prior database | Reviewed scan | Accepted maximum |', '|---|---:|---|---|---|']
    for item in reviewed:
        for perk in item['perks']:
            if not perk['different']:
                continue
            old, new = perk['before'], perk['accepted']
            lines.append(f"| {item['name']} | {perk['slot']} | {old['name']} {old['base']} | {new['name']} {new['base']} | {new['max'] or 'Unknown (count effect)'} |")
    lines += ['', '## Interpretation', '',
              'This is observed saved scan text, not an upgrade inferred from the database. All saved levels are 1. Existing repeated perk slots are preserved. Count-effect maxima remain blank instead of using generic percentage inference.', '',
              f"Excluded {summary['otherCostScansExcluded']} War Legendary scans from other cost tiers. The source contains {summary['imagesInSource']} selected item images. The user deferred image import until a later browser-backup export. No cloud workspace write or deployment is part of this reconciliation.", '']
    target.with_suffix('.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
