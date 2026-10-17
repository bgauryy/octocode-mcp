import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from audit_local_results import Sources, audit_arm, native_evidence, signals
from collections import Counter


class AuditTests(unittest.TestCase):
    def test_native_lines_and_metadata_exclusion(self):
        data = {'files': [{'path': 'a.py', 'matches': [{'value': '1\tfirst\n2\tsecond'}]}], 'hints': [{'path': 'fake.py', 'content': '1\tfake'}]}
        self.assertEqual(list(native_evidence(data)), [('a.py', 1, 'first'), ('a.py', 2, 'second')])

    def test_bytes_hash_crlf_and_source_fidelity(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp); repo = p / 'repo'; repo.mkdir(); arm = p / 'arm'; arm.mkdir()
            (repo / 'a.py').write_bytes(b'first\r\nsecond\r\n')
            raw = b'a.py:1:first\r\na.py:2:WRONG\r\n'
            (arm / 'tool-001.txt').write_bytes(raw)
            (arm / 'tools.jsonl').write_text(json.dumps({'id': 1, 'output_sha256': hashlib.sha256(raw).hexdigest(), 'isError': False}) + '\n')
            (arm / 'answer.md').write_text('See `a.py:1-2` and `missing.py:3`.')
            result = audit_arm(arm, repo)
            self.assertEqual(result['artifactIntegrity']['status'], 'verified')
            self.assertEqual(result['sourceEvidence']['lineOccurrences'], {'exact': 1, 'different': 1})
            self.assertEqual(result['citations']['validLocations'], 1)
            self.assertEqual(result['citations']['invalidOrUnresolved'], 1)
            self.assertIsNone(result['semanticQuality'])
            (arm / 'tool-001.txt').write_bytes(b'changed')
            self.assertEqual(audit_arm(arm, repo)['artifactIntegrity']['status'], 'failed')

    def test_missing_receipts_unknown_not_zero_quality(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            result = audit_arm(p, p)
            self.assertEqual(result['artifactIntegrity']['status'], 'unknown_no_receipts')
            self.assertIsNone(result['semanticQuality'])

    def test_source_escape_and_range(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp); (p / 'a').write_text('yes\n')
            source = Sources(p)
            self.assertEqual(source.check('../elsewhere', 1, ''), 'unresolved_path')
            self.assertEqual(source.check('a', 2, ''), 'out_of_range')

    def test_unique_suffix_is_explicit_and_ambiguity_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Sources(tmp)
            source.tracked = ['src/a.py', 'lib/b.py', 'other/b.py']
            self.assertEqual(source.citation_path('a.py'), ('src/a.py', 'unique_tracked_suffix'))
            self.assertEqual(source.citation_path('b.py'), ('b.py', 'ambiguous_suffix'))
            self.assertEqual(source.citation_path('missing.py'), ('missing.py', 'unresolved_path'))

    def test_pagination_not_semantic_failure(self):
        counts = Counter()
        signals({'pagination': {'hasMore': True}, 'filesScanned': 0, 'status': 'empty', 'next': {'page': 2}, 'contentClipped': True}, counts)
        self.assertEqual(counts['hasMore_markers'], 1)
        self.assertEqual(counts['zero_files_scanned_rows'], 1)
        self.assertEqual(counts['clipping_markers'], 1)


if __name__ == '__main__':
    unittest.main()


class RelocatedSourceTests(unittest.TestCase):
    def test_recorded_absolute_paths_resolve_only_under_moved_source(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            current = base / 'current'
            current.mkdir()
            (current / 'code.py').write_text('original evidence\n')
            recorded = base / 'previous'
            sources = Sources(current, recorded)
            self.assertEqual(sources.check(str(recorded / 'code.py'), 1, 'original evidence'), 'exact')
            self.assertIsNone(sources.resolve(str(base / 'private.txt')))
            self.assertIsNone(sources.resolve(str(recorded / '../private.txt')))
