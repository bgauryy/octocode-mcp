import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / 'dashboard/build_datasets.py'
spec = importlib.util.spec_from_file_location('dashboard', MODULE)
dashboard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dashboard)


class DashboardAccountingTest(unittest.TestCase):
    def test_corpus_filter_invalid_denominator_and_unknown_usage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'overview').mkdir()
            matrix = {'question_set': 'local-test', 'questions': 2, 'order': [], 'groups': {},
                      'anchor': None, 'rows': [], 'matrix': {}, 'leaner_count': {}, 'judged_pairs': []}
            (root / 'overview/matrix_summary.json').write_text(json.dumps(matrix))
            row = {'arm': 'local-mcp', 'calls': 2, 'failed': 0, 'clasify_calls': 0,
                   'chars': 100, 'input_tokens': 50, 'output_tokens': 10, 'cost_usd': None,
                   'secs': 2, 'ok': True}
            local = {'campaign': 'local', 'question_set': 'local-test', 'judgments': [],
                     'runs': [row, {**row, 'ok': False, 'chars': 10000, 'input_tokens': None}],
                     'prior_attempts': [{**row, 'ok': False, 'calls': 3}]}
            github = {**local, 'campaign': 'remote', 'question_set': 'github-v2'}
            (root / 'local').mkdir()
            (root / 'local/run.json').write_text(json.dumps(local))
            (root / 'github').mkdir()
            (root / 'github/run.json').write_text(json.dumps(github))
            with patch.object(dashboard, 'RESULTS', root):
                data = dashboard.build()
            self.assertEqual(len(data['live_runs']), 1)
            run = data['live_runs'][0]
            self.assertEqual((run['runs'], run['valid_runs'], run['attempts']), (2, 1, 3))
            self.assertEqual(run['calls'], 7)
            self.assertEqual(run['median_chars'], 100)
            self.assertIsNone(run['input_tokens'])
            self.assertIsNone(run['cost_usd'])

    def test_unknown_model_timing_is_not_rounded_or_zeroed(self):
        self.assertIsNone(dashboard.rounded(None))
        self.assertEqual(dashboard.rounded(0), 0)
        self.assertIsNone(dashboard.complete_sum([{'x': 1}, {}], 'x'))


if __name__ == '__main__':
    unittest.main()
