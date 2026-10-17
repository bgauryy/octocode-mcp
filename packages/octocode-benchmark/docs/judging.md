# Source-backed judging

You evaluate one question after both workers have sealed their answers. Receive shuffled X/Y
answers with tool identities hidden and research the assigned source independently. Do not
recover the arm mapping. Costs remain hidden until quality is locked.

Establish the facts asked for from primary source before comparing the answers. Check the
recorded revision and working-tree state. For structured facts, read the exact containing
object or parse it; an elided search result cannot establish membership or absence. A private
answer key is a lead to verify, not authoritative truth.

For each answer, explain which material claims the source supports or contradicts, which
parts of the question remain unanswered, and what remains uncertain. Open load-bearing
citations and inspect whether they support the attached claim. An existing path and line
prove only citation resolution. Separate returned-data fidelity, relevance and coverage from
answer correctness. A faithful snippet can still support an incorrect conclusion.

Use whatever prose layout explains the evidence clearly. There is no prescribed table,
paragraph count, answer length or research sequence. Machine-readable verdict fields are
required only by the summary parser; they do not replace reasoning.

## Calibration and uncertainty

Before scoring a new campaign, verify a known supported claim and a contradicted claim from
its corpus, record the source anchors and expected grading direction, and check that the
judge distinguishes them. The [example verdict](example-verdict.md) illustrates reasoning;
reading it alone is not calibration. Retain calibration artifacts and judge model identity.

A claim contradicted by source is wrong. A claim asserted without supporting evidence loses
credit. A claim the evaluator could not investigate is unknown: record that limitation and do
not invent a zero. If access or time prevents a reliable overall grade, omit the score block;
that pair remains unjudged. Preserve all attempts and never replace an unfavorable valid grade.

## Quality rubric

- Correctness, whole points 0–10: 10 covers every material part correctly with supporting
  source; 7 has the core correct but a smaller omission; 4 has a material error or unsupported
  causal claim; 1 is confidently wrong on the central fact; 0 has no substantive answer.
- Depth, whole points 1–5: 5 ties material conclusions to exact primary evidence; 3 is mostly
  grounded with some untested assertions; 1 is largely unsupported. Length earns no credit.
- Workflow: `null` during blind answer grading. A separate transcript audit can assess wasted
  reads, failed calls and unread continuations after the quality verdict is sealed.

Choose the quality winner from verified correctness, treating differences of at most one
point as tied. A confidently wrong answer cannot win on size. The controller compares
instrumented cost and time only after grading, among quality-equivalent answers. Do not infer
cost, tool use or efficiency from prose length.

`judge_pair.sh` consumes a fenced JSON object with X/Y correctness, depth and workflow,
plus winner and reason. Whole-point scores summarize the preceding evidence. Unknown overall
quality stays unjudged instead of receiving fabricated numbers.

## Bias and validation

Randomize X/Y order and keep the map private until sealing. Use a different model family from
the solvers where available, recording any shared provider, context inheritance or unblinded
review. Recheck decisive claims and disagreements against source, including a reversed-order
second judgment for close or important outcomes. Report provisional audits as provisional;
do not relabel an unblinded review as a blind campaign or human calibration.
