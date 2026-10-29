"""Import explicitly supplied game captures without importing account data.

Usage: python scripts/artifact_scan_images.py BACKUP --profile "Profile 3"
Only images of the selected War edition are imported (Mythical by default). The raw
manifest is the sole source of named artifact artwork. Wiki images are excluded.
"""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = 'data/raw/user_verified_artifact_images.json'
# Reviewed Profile 4 OCR/shortened titles, not additional editions.
SCAN_TITLE_ALIASES = {
    'Bust of Ramesses 11': 'bust-of-ramesses-ii-legendary',
    'Normandy SCR-536': 'normandy-scr-536-walkie-talkie-legendary',
}


def scan_catalog_row(item, canonical, grade):
    artifact_id = item.get('catalogId') or item['id']
    row = canonical.get(artifact_id)
    alias = SCAN_TITLE_ALIASES.get(item['name'])
    if row is None and not item.get('catalogId'):
        row = canonical.get(alias)
    normalize = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
    if not row or row['hall'] != 'War' or row['grade'] != grade or not (
            normalize(row['name']) == normalize(item['name']) or row['artifact_id'] == alias):
        raise ValueError('Scan does not match a canonical War ' + grade + ': ' + artifact_id)
    return row


def apply_scan_images(images, root=ROOT):
    """Return only verified game images; discard all legacy/fetched mappings."""
    path = root / MANIFEST
    if not path.exists():
        return {}
    document = json.loads(path.read_text(encoding='utf-8'))
    result = {}
    for artifact_id, entry in document['images'].items():
        url = entry['url']
        if not re.fullmatch(r'assets/artifact-scans/[a-z0-9-]+\.(?:jpg|png|webp)', url):
            raise ValueError('Invalid scan asset path: ' + artifact_id)
        content = (root / 'ui' / url).read_bytes()
        if hashlib.sha256(content).hexdigest() != entry['sha256']:
            raise ValueError('Scan asset checksum differs: ' + artifact_id)
        result[artifact_id] = {key: entry[key] for key in ('url', 'source_title', 'name')}
    return result


def import_images(source, profile_name, root=ROOT, grade='Mythical'):
    if grade not in ('Legendary', 'Mythical'):
        raise ValueError('Expected Legendary or Mythical grade')
    source_bytes = source.read_bytes()
    backup = json.loads(source_bytes.decode('utf-8-sig'))
    if backup.get('kind') != 'dominations-planner-backup' or backup.get('version') != 1:
        raise ValueError('Expected a full planner backup')
    profiles = json.loads(backup['settings']['dn-profiles'])['profiles']
    selected = [p for p in profiles if p['name'] == profile_name]
    if len(selected) != 1:
        raise ValueError('Expected exactly one matching profile')
    records = [r for r in backup['records'] if r['id'] == 'collection:' + selected[0]['id']]
    if len(records) != 1:
        raise ValueError('Expected one collection for the selected profile')
    canonical = {r['artifact_id']: r for r in json.loads((root / 'data/artifacts.json').read_text(encoding='utf-8'))}
    pending = {}
    for item in records[0]['items']:
        if item.get('hall') != 'war' or item.get('type') != 'War ' + grade or not item.get('image'):
            continue
        row = scan_catalog_row(item, canonical, grade)
        artifact_id = row['artifact_id']
        if artifact_id in pending:
            raise ValueError('Multiple captures require review: ' + artifact_id)
        match = re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)', item['image'])
        if not match:
            raise ValueError('Invalid image data: ' + artifact_id)
        content = base64.b64decode(match[2], validate=True)
        signatures = {'jpeg': content.startswith(b'\xff\xd8\xff'), 'png': content.startswith(b'\x89PNG\r\n\x1a\n'), 'webp': content.startswith(b'RIFF') and content[8:12] == b'WEBP'}
        if not signatures[match[1]]:
            raise ValueError('Image signature mismatch: ' + artifact_id)
        sha = hashlib.sha256(content).hexdigest()
        extension = 'jpg' if match[1] == 'jpeg' else match[1]
        pending[artifact_id] = ({'url': f'assets/artifact-scans/{artifact_id}-{sha[:16]}.{extension}',
                                 'source_title': 'User-scanned War ' + grade + ' artwork', 'name': row['name'], 'sha256': sha}, content)
    if not pending:
        raise ValueError('No War ' + grade + ' captures found')
    manifest_path = root / MANIFEST
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'version': 1, 'source': 'User-provided game scans', 'images': {}}
    # Validation completes before any output is written. Copy the original bytes.
    for artifact_id, (entry, content) in pending.items():
        target = root / 'ui' / entry['url']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        manifest['images'][artifact_id] = entry
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    mapping = root / 'data/raw/artifact_images.json'
    document = json.loads(mapping.read_text(encoding='utf-8'))
    document['meta'] = {'source': 'User-provided game scans', 'policy': 'verified-scans-only'}
    document['images'] = apply_scan_images(document['images'], root)
    payload = json.dumps(document, indent=2, ensure_ascii=False) + '\n'
    mapping.write_text(payload, encoding='utf-8')
    (root / 'ui/data/artifact_images.json').write_text(payload, encoding='utf-8')
    print(f'Imported {len(pending)} original War {grade} images; no account data imported.')
    return pending


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', type=Path)
    parser.add_argument('--profile', required=True)
    parser.add_argument('--grade', choices=('Legendary', 'Mythical'), default='Mythical')
    args = parser.parse_args()
    import_images(args.backup, args.profile, grade=args.grade)
