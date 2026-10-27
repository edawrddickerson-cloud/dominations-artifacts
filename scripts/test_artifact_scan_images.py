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


if __name__ == '__main__':
    unittest.main()
