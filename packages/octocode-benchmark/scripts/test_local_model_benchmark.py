import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

from local_model_benchmark import native_call, prepare_trial_context, research_trial, scoped_arguments


class LocalModelBoundaries(unittest.TestCase):
    def test_trials_read_fresh_setup_instead_of_reusing_a_reply(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            case = {'id': 'Q1', 'root': str(root), 'question': 'Investigate the source.'}
            first = {'ok': True, 'result': {'responsePagination': {'snapshot': 'first'}}}
            second = {'ok': True, 'result': {'responsePagination': {'snapshot': 'second'}}}
            with patch('local_model_benchmark.native_call', side_effect=[first, second]) as read:
                before = prepare_trial_context(Path('/native'), case, root / 'first')
                after = prepare_trial_context(Path('/native'), case, root / 'second')
            self.assertEqual(read.call_count, 2)
            self.assertIn('"snapshot": "first"', before)
            self.assertIn('"snapshot": "second"', after)
            self.assertNotIn('"snapshot": "first"', after)
            self.assertTrue((root / 'second/orientation.json').exists())

    def test_nested_external_targets_and_classifiers_are_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            for args in ({'queries': [{'path': '../private'}]},
                         {'queries': [{'entrypoints': [str(root.parent)]}]},
                         {'selection': {'source': '/etc/passwd'}},
                         {'queries': [{'clasifyContext': {}}]}):
                with self.subTest(args=args), self.assertRaises(ValueError):
                    scoped_arguments(args, root)

    def test_external_symlink_is_not_an_allowed_child(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / 'escape').symlink_to(root.parent, target_is_directory=True)
            with self.assertRaises(ValueError):
                scoped_arguments({'queries': [{'path': 'escape/secret'}]}, root)

    def test_unlisted_tool_never_starts_a_process(self):
        with patch('local_model_benchmark.subprocess.run') as run:
            receipt = native_call(Path('/native'), 'ghGetFileContent', {}, Path('/tmp'))
        self.assertFalse(receipt['ok'])
        run.assert_not_called()

    def test_empty_page_is_valid_but_row_error_is_not(self):
        for code, body, expected in [(1, '{"results":[{"status":"empty","data":{}}]}', True),
                                     (0, '{"results":[{"status":"error","data":{"error":"unavailable"}}]}', False)]:
            process = SimpleNamespace(returncode=code, stdout=body, stderr='')
            with self.subTest(code=code), patch('local_model_benchmark.subprocess.run', return_value=process):
                receipt = native_call(Path('/native'), 'localSearch', {'queries': [{'path': '.'}]}, Path('/tmp'))
            self.assertEqual(receipt['ok'], expected)

    def test_incomplete_generation_does_not_become_a_successful_answer(self):
        exchange = {'arguments': {}, 'wallSeconds': 1, 'result': {'structuredContent':
                    {'response': {'done_reason': 'length', 'eval_count': 500,
                     'message': {'content': 'A plausible but incomplete answer'}}}}}
        with patch('local_model_benchmark.model_turn', return_value=exchange):
            result = research_trial(None, 'installed', 'question', Path('/tmp'), Path('/native'), [], '', 3, 8192)
        self.assertEqual(result['status'], 'generationBudgetExceeded')
        self.assertEqual(result['answer'], '')


if __name__ == '__main__':
    unittest.main()
