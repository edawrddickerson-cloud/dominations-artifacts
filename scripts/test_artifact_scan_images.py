"""Verify profile isolation, exact capture bytes and wiki-refresh protection."""
import base64
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from artifact_scan_images import apply_scan_images, import_images
import fetch_entity_images


class ScanImagesTest(unittest.TestCase):
    def test_import_and_refresh_preserve_only_selected_profile_pixels(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for directory in ('data/raw', 'ui/data'):
                (root / directory).mkdir(parents=True)
            artifact_id = 'fixture-mythical'
            row = {'artifact_id': artifact_id, 'name': 'Fixture', 'hall': 'War', 'grade': 'Mythical'}
            (root / 'data/artifacts.json').write_text(json.dumps([row]))
            previous = {'meta': {}, 'images': {'other-legendary': {'url': 'unchanged'}}}
            (root / 'data/raw/artifact_images.json').write_text(json.dumps(previous))
            capture = b'\xff\xd8\xffselected-original-pixels'
            item = {'id': artifact_id, 'catalogId': artifact_id, 'name': 'Fixture', 'hall': 'war', 'type': 'War Mythical', 'image': 'data:image/jpeg;base64,' + base64.b64encode(capture).decode()}
            backup = {'kind': 'dominations-planner-backup', 'version': 1,
                      'settings': {'dn-profiles': json.dumps({'profiles': [{'id': 'chosen', 'name': 'Profile 3'}, {'id': 'other', 'name': 'Other'}]}), 'private-setting': 'never copy'},
                      'records': [{'id': 'collection:other', 'items': [{**item, 'image': 'invalid-other-profile'}]}, {'id': 'collection:chosen', 'items': [item]}]}
            source = root / 'backup.json'
            source.write_text(json.dumps(backup))
            imported = import_images(source, 'Profile 3', root)
            entry = imported[artifact_id][0]
            self.assertEqual((root / 'ui' / entry['url']).read_bytes(), capture)
            raw = (root / 'data/raw/artifact_images.json').read_bytes()
            self.assertEqual(raw, (root / 'ui/data/artifact_images.json').read_bytes())
            self.assertEqual(set(json.loads(raw)['images']), {artifact_id})
            self.assertNotIn(b'private-setting', raw)
            self.assertNotIn('chosen', (root / 'data/raw/user_verified_artifact_images.json').read_text())
            import_images(source, 'Profile 3', root)
            self.assertEqual(raw, (root / 'data/raw/artifact_images.json').read_bytes())
            with patch.object(fetch_entity_images, 'ROOT', root), patch.object(fetch_entity_images, 'UI_DATA', root / 'ui/data'):
                fetch_entity_images.write_image_doc(root / 'data/raw/artifact_images.json', {artifact_id: {'url': 'old-wiki-artwork'}, 'other-legendary': {'url': 'removed-wiki-artwork'}})
            self.assertEqual(json.loads((root / 'ui/data/artifact_images.json').read_bytes())['images'][artifact_id]['url'], entry['url'])
            self.assertEqual(set(json.loads((root / 'ui/data/artifact_images.json').read_bytes())['images']), {artifact_id})
            with patch.object(fetch_entity_images, 'ROOT', root), patch.object(fetch_entity_images, 'RAW', root / 'data/raw'), patch.object(fetch_entity_images, 'UI_DATA', root / 'ui/data'), patch.object(fetch_entity_images, 'api_query', side_effect=AssertionError('Artifact refresh must not query the wiki')):
                fetch_entity_images.fetch_artifacts()
            self.assertEqual(set(json.loads((root / 'ui/data/artifact_images.json').read_bytes())['images']), {artifact_id})
            (root / 'ui' / entry['url']).write_bytes(b'drift')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                apply_scan_images({}, root)

    def test_wrong_edition_fails_before_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'data').mkdir()
            (root / 'data/artifacts.json').write_text(json.dumps([{'artifact_id': 'legendary', 'name': 'Fixture', 'hall': 'War', 'grade': 'Legendary'}]))
            backup = {'kind': 'dominations-planner-backup', 'version': 1, 'settings': {'dn-profiles': json.dumps({'profiles': [{'id': 'p', 'name': 'Profile 3'}]})}, 'records': [{'id': 'collection:p', 'items': [{'id': 'legendary', 'name': 'Fixture', 'hall': 'war', 'type': 'War Mythical', 'image': 'not-an-image'}]}]}
            source = root / 'backup.json'
            source.write_text(json.dumps(backup))
            with self.assertRaisesRegex(ValueError, 'canonical War Mythical'):
                import_images(source, 'Profile 3', root)
            self.assertFalse((root / 'ui').exists())

    def test_legendary_import_retains_verified_mythical_and_resolves_reviewed_title(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for directory in ('data/raw', 'ui/data', 'ui/assets/artifact-scans'):
                (root / directory).mkdir(parents=True)
            artifact_id = 'bust-of-ramesses-ii-legendary'
            canonical = [{'artifact_id': artifact_id, 'name': 'Bust of Ramesses II', 'hall': 'War', 'grade': 'Legendary'}]
            (root / 'data/artifacts.json').write_text(json.dumps(canonical))
            old = b'\xff\xd8\xffexisting-mythical'
            import hashlib
            old_entry = {'url': 'assets/artifact-scans/previous-mythical.jpg', 'sha256': hashlib.sha256(old).hexdigest(), 'source_title': 'User-scanned War Mythical artwork', 'name': 'Previous'}
            (root / 'ui' / old_entry['url']).write_bytes(old)
            (root / 'data/raw/user_verified_artifact_images.json').write_text(json.dumps({'version': 1, 'images': {'previous-mythical': old_entry}}))
            (root / 'data/raw/artifact_images.json').write_text(json.dumps({'images': {}}))
            capture = b'\xff\xd8\xfflegendary-original-pixels'
            item = {'id': 'scan-unlinked', 'name': 'Bust of Ramesses 11', 'hall': 'war', 'type': 'War Legendary', 'image': 'data:image/jpeg;base64,' + base64.b64encode(capture).decode()}
            backup = {'kind': 'dominations-planner-backup', 'version': 1, 'settings': {'dn-profiles': json.dumps({'profiles': [{'id': 'p4', 'name': 'Profile 4'}, {'id': 'p3', 'name': 'Profile 3'}]})}, 'records': [
                {'id': 'collection:p3', 'items': [{**item, 'image': 'invalid-other-profile'}]},
                {'id': 'collection:p4', 'items': [item, {**item, 'type': 'War Mythical', 'image': 'invalid-other-edition'}]}]}
            source = root / 'backup.json'
            source.write_text(json.dumps(backup))
            result = import_images(source, 'Profile 4', root, grade='Legendary')
            self.assertEqual(set(result), {artifact_id})
            self.assertEqual((root / 'ui' / result[artifact_id][0]['url']).read_bytes(), capture)
            images = json.loads((root / 'data/raw/artifact_images.json').read_text())['images']
            self.assertEqual(set(images), {'previous-mythical', artifact_id})
            self.assertEqual((root / 'ui' / old_entry['url']).read_bytes(), old)
            before = (root / 'data/raw/artifact_images.json').read_bytes()
            import_images(source, 'Profile 4', root, grade='Legendary')
            self.assertEqual(before, (root / 'data/raw/artifact_images.json').read_bytes())
            backup['records'][1]['items'].append(item)
            source.write_text(json.dumps(backup))
            with self.assertRaisesRegex(ValueError, 'Multiple captures'):
                import_images(source, 'Profile 4', root, grade='Legendary')
            self.assertEqual(before, (root / 'data/raw/artifact_images.json').read_bytes())


if __name__ == '__main__':
    unittest.main()
