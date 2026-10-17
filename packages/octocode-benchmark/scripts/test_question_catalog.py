import tempfile
import unittest
from pathlib import Path
from question_catalog import discover, resolve, select


class QuestionCatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ('01-first.md', '02-second.md', '04-fourth.md', 'README.md'):
            (self.root / name).write_text('Question')

    def test_discovers_actual_size_and_resolves_public_names(self):
        self.assertEqual(select(self.root), ['Q1', 'Q2', 'Q4'])
        self.assertEqual(select(self.root, 'Q04,01-first'), ['Q4', 'Q1'])
        self.assertEqual(resolve(self.root, 'Q01').name, '01-first.md')
        self.assertEqual(select(self.root, '1-2'), ['Q1', 'Q2'])

    def test_refuses_missing_duplicate_and_reversed_selection(self):
        for selector in ('1-4', 'Q3', '2-1', 'Q1,Q01'):
            with self.assertRaises(ValueError):
                select(self.root, selector)
        (self.root / 'Q1.md').write_text('ambiguous')
        with self.assertRaises(ValueError):
            discover(self.root)

    def test_existing_q_catalog_remains_supported(self):
        for path in self.root.glob('*.md'):
            path.unlink()
        (self.root / 'Q37.md').write_text('question')
        self.assertEqual(select(self.root), ['Q37'])


class CampaignDiscoveryTests(unittest.TestCase):
    def test_campaign_discovers_slug_and_propagates_worker_failure(self):
        import os
        import subprocess
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            questions = root / 'questions'
            questions.mkdir()
            (questions / '37-only-question.md').write_text('# Goal\nExplain it.\n')
            binary = root / 'bin'
            binary.mkdir()
            for name, body in [('gh', '#!/bin/sh\nexit 0\n'), ('claude', '#!/bin/sh\nexit 9\n')]:
                path = binary / name
                path.write_text(body)
                path.chmod(0o755)
            env = dict(os.environ, PATH=str(binary) + os.pathsep + os.environ['PATH'],
                       QUESTION_DIR=str(questions), LOCAL_REPOS=str(root), RUNNER='claude')
            script = Path(__file__).with_name('run_campaign.sh')
            result = subprocess.run(['bash', str(script), str(root / 'campaign'), 'local-shell', '1', 'all', '1'],
                                    env=env, capture_output=True, text=True, timeout=20)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('FAILED local-shell-p1-Q37', result.stdout)
            self.assertTrue((root / 'campaign/runs/local-shell-p1-Q37/prompt.md').exists() or
                            (root / 'campaign/runs/local-shell-p1-Q37/transcript.jsonl').exists())
