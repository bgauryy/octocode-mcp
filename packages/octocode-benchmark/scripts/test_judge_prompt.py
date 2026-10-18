"""The judge prompt agrees with the grading rules it is graded under."""
import re
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
DOCS = HERE.parent / "docs"
JUDGE = HERE / "judge_pair.sh"


class JudgePromptTest(unittest.TestCase):
    def test_the_appended_calibration_example_scores_no_workflow_and_shows_no_cost(self):
        # judging.md: workflow is null during blind grading and costs stay hidden until
        # quality is locked; the example the judge reads must not model the opposite.
        script = JUDGE.read_text()
        self.assertIn("example-verdict.md", script, "the example is part of the judge prompt")
        example = (DOCS / "example-verdict.md").read_text()
        self.assertNotRegex(example, re.compile(r"workflow\s*\*\*\s*\d", re.I))
        self.assertNotRegex(example, re.compile(r"\bchars?\b|\bcalls?\)|footprint|tiebreak|leaner", re.I))

    def test_the_method_doc_states_the_same_workflow_rule(self):
        method = (DOCS / "method.md").read_text()
        self.assertNotRegex(method, re.compile(r"\*\*workflow\*\*\s*1\s*[–-]\s*5"))

    def test_each_judge_run_records_the_prompt_version_it_was_given(self):
        # Verdicts from different prompt texts are not comparable without recalibration
        # (judging.md, Calibration), so every runner stamps the prompt fingerprint.
        script = JUDGE.read_text()
        stamps = [line for line in script.splitlines() if 'JUDGE.txt"' in line and line.lstrip().startswith("echo")]
        self.assertEqual(len(stamps), 2, stamps)
        for stamp in stamps:
            self.assertIn("prompt=$PROMPT_VERSION", stamp)


if __name__ == "__main__":
    unittest.main()
