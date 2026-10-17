"""Saved assessments cannot be silently attached to different answers."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('local_review', Path(__file__).resolve().parents[1] / 'local/run-review.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class LocalReviewTests(unittest.TestCase):
    def test_unknown_quality_is_unknown_and_changed_answer_rejects_assessment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'quality/semantic').mkdir(parents=True)
            (root / 'summary.json').write_text(json.dumps({'rows': []}))
            (root / 'run.json').write_text(json.dumps({'questions': [{'id':'Q37','repo':'example','question':'# Goal\nExplain.'}]}))
            for arm in ('shell','octocode'):
                target = root / arm / 'Q37'
                target.mkdir(parents=True)
                (target / 'answer.md').write_text('Original')
            returned = {'questions': []}
            result = review.build_comparison(root, returned)
            self.assertIsNone(result['questions'][0]['arms']['shell']['quality'])
            sha = hashlib.sha256(b'Original').hexdigest()
            semantic = {'questions':[{'id':'Q37','status':'source_checked_partial','arms':{'shell':{'answerSha256':sha,'correctness':4}}}]}
            audit = root / 'quality/semantic/audit.json'
            audit.write_text(json.dumps(semantic))
            self.assertEqual(review.build_comparison(root, returned)['questions'][0]['arms']['shell']['quality']['correctness'], 4)
            (root / 'shell/Q37/answer.md').write_text('Different')
            with self.assertRaisesRegex(ValueError, 'answer hash mismatch'):
                review.build_comparison(root, returned)

    def test_acceptance_for_another_audit_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'quality/semantic').mkdir(parents=True)
            (root / 'summary.json').write_text(json.dumps({'rows': []}))
            (root / 'quality/semantic/audit.json').write_text('{}')
            (root / 'quality/semantic/acceptance.json').write_text('{"inputAuditSha256":"wrong"}')
            with self.assertRaisesRegex(ValueError, 'different semantic audit'):
                review.build_comparison(root, {'questions':[]})
