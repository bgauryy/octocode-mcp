import json
import tempfile
import unittest
from pathlib import Path

from local_model_report import candidate_answer, collect


class QualityReporting(unittest.TestCase):
    def test_completed_response_does_not_establish_quality_or_break_a_quality_tie(self):
        with tempfile.TemporaryDirectory() as folder:
            run = Path(folder)
            models = ['one', 'two']
            (run / 'plan.json').write_text(json.dumps({'models': models, 'cases': [
                {'id': 'Q1', 'question': '# Question'}]}))
            for model in models:
                trial = run / 'trials' / model / 'Q1'
                trial.mkdir(parents=True)
                (trial / 'result.json').write_text(json.dumps({'answer': 'Confident but ungraded',
                    'status': 'answered', 'trace': [], 'wallSeconds': 1, 'outputTokens': 5,
                    'rounds': 1, 'toolErrors': 0, 'returnedToolCharacters': 0}))
            data = collect(run)
            self.assertIsNone(data['descriptiveLeader'])
            self.assertFalse(data['allQualityChecksComplete'])
            self.assertTrue(all(m['sourcePoints'] is None for m in data['models']))
            (run / 'quality').mkdir()
            (run / 'quality/grades.json').write_text(json.dumps({
                m: {'Q1': {'marks': [0, 0, 0]}} for m in models}))
            data = collect(run)
            self.assertTrue(data['allQualityChecksComplete'])
            self.assertIsNone(data['descriptiveLeader'])
            self.assertEqual(set(data['tiedLeaders']), set(models))

    def test_partial_returned_text_is_preserved_without_declaring_completion(self):
        result = {'status': 'generationBudgetExceeded', 'answer': '', 'trace': [{'inference':
            {'result': {'structuredContent': {'response': {'message': {'content': 'Useful partial text'}}}}}}]}
        self.assertEqual(candidate_answer(result), ('Useful partial text', 'partial'))

    def test_prefilled_grades_cannot_establish_a_winner_before_trials_exist(self):
        with tempfile.TemporaryDirectory() as folder:
            run = Path(folder)
            (run / 'plan.json').write_text(json.dumps({'models': ['not-run'], 'cases': [
                {'id': 'Q1', 'question': '# Question'}]}))
            (run / 'quality').mkdir()
            (run / 'quality/grades.json').write_text(json.dumps({
                'not-run': {'Q1': {'marks': [1, 1, 1]}}}))
            data = collect(run)
            self.assertFalse(data['allQualityChecksComplete'])
            self.assertIsNone(data['descriptiveLeader'])
            self.assertIsNone(data['models'][0]['sourcePoints'])


if __name__ == '__main__':
    unittest.main()
