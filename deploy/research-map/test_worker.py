import json
from pathlib import Path
import tempfile
import unittest
from worker import update_projection, valid_records, project


class ProjectionTests(unittest.TestCase):
    def test_changes_and_cached_order(self):
        calls = []
        def fit(records):
            calls.append(records)
            return {'method': 'umap', 'points': []}
        records = [{'url': f'https://example.com/{i}', 'embedding': [1, i]} for i in range(3)]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'map.json'
            self.assertTrue(update_projection(records, path, fit))
            before = path.read_bytes()
            self.assertFalse(update_projection(records[::-1], path, fit))
            self.assertEqual(path.read_bytes(), before)
            self.assertTrue(update_projection(records + [{'url': 'https://example.com/new', 'embedding': [2, 1]}], path, fit))
            self.assertTrue(update_projection(records, path, fit))
            records[0]['embedding'] = [2, 4]
            self.assertTrue(update_projection(records, path, fit))
            self.assertEqual(len(calls), 4)
            before = path.read_bytes()
            def fail(_):
                raise RuntimeError('unavailable')
            with self.assertRaises(RuntimeError):
                update_projection([], path, fail)
            self.assertEqual(path.read_bytes(), before)
            self.assertIn('generatedAt', json.loads(before))

    def test_invalid_vectors_and_urls(self):
        records = [{'url': 'https://example.com/a', 'embedding': [1, 2]}]
        bad = [None, {'url': 'https://[', 'embedding': [1, 2]},
               {'url': 'javascript:bad', 'embedding': [1, 2]},
               {'url': 'https://example.com/b', 'embedding': [float('nan'), 2]},
               {'url': 'https://example.com/c', 'embedding': [0, 0]}]
        self.assertEqual(valid_records(records + bad), records)
        self.assertEqual(project(records), {'method': 'insufficient-data', 'points': []})


if __name__ == '__main__':
    unittest.main()
