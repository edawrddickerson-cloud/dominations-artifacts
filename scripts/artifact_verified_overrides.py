"""Apply explicit user-confirmed artifact corrections after historical sources."""
import json
import re
import unicodedata
from pathlib import Path


def identity(name):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', name).lower())


def apply_verified_overrides(rows, fields, root):
    source = Path(root) / 'data/raw/user_verified_artifact_overrides.json'
    if not source.exists():
        return
    for entry in json.loads(source.read_text(encoding='utf-8'))['entries']:
        matches = [row for row in rows if row['artifact_id'] == entry['artifact_id']]
        if len(matches) > 1:
            raise ValueError('Duplicate artifact ID: ' + entry['artifact_id'])
        if matches:
            row = matches[0]
        else:
            values = entry['values']
            aliases = {identity(values['name']), identity(values.get('alternate_name', ''))} - {''}
            equivalents = [row for row in rows if row['grade'] == values['grade'] and
                           aliases.intersection({identity(row['name']), identity(row.get('alternate_name', ''))} - {''})]
            if equivalents:
                raise ValueError('Existing edition/name equivalent: ' + values['name'])
            row = dict.fromkeys(fields, '')
            row['artifact_id'] = entry['artifact_id']
            rows.append(row)
        row.update(entry['values'])
        note = entry['note']
        notes = [n.strip() for n in (row['notes'] + ';' + note).split(';') if n.strip()]
        row['notes'] = '; '.join(dict.fromkeys(notes))


if __name__ == '__main__':
    import csv
    root = Path(__file__).resolve().parents[1]
    target = root / 'data/artifacts.json'
    rows = json.loads(target.read_text(encoding='utf-8'))
    fields = list(rows[0])
    apply_verified_overrides(rows, fields, root)
    rows.sort(key=lambda r: ({'Main': 0, 'War': 1}.get(r['hall'], 9),
                             {'Legendary': 0, 'Mythical': 1}.get(r['grade'], 9), r['name'].casefold()))
    content = json.dumps(rows, indent=2, ensure_ascii=False) + '\n'
    target.write_text(content, encoding='utf-8')
    (root / 'ui/data/artifacts.json').write_text(content, encoding='utf-8')
    with (root / 'data/artifacts.csv').open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print('Applied verified overrides; canonical and served CSV/JSON synchronized.')
