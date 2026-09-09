# Agentic Defect Base Rates

Load when ordering an agent-residue audit or justifying which class to hunt first. Why: measured prevalence, not intuition, decides where a bounded cleanup pass pays off.

## Audit order

Hunt in this order — descending measured prevalence, and each earlier class makes the later ones easier to see.

1. Duplication and reinvention — the most measured defect, and the one that compounds silently.
2. Error masking — cheap to detect, highest severity per instance, report-only.
3. Test integrity — invalidates the checks the rest of the audit depends on.
4. Scope-creep leftovers and oversized changes — strongest predictor of rejected agent work.
5. Dependency and credential defects — low volume, unbounded blast radius.
6. Narration residue and low-connectivity files — highest volume, lowest risk; batch last.

## Measured rates

| Finding | Why it matters here |
|---------|--------------------|
| Duplicated 5+ line blocks up 81% since 2023; copy/paste 15.7% of changed lines against 3.8% refactored — [GitClear, 623M changes](https://www.gitclear.com/the_ai_code_quality_maintainability_gap) | Justifies auditing duplication before any other class |
| Cross-file function connectivity down 35%; long-term legacy updates down 74% — same source | Makes "new file with zero dependents" a primary reinvention signal |
| Error-masking constructs up 47% — same source | Confirms masked failures accumulate rather than get fixed |
| Duplicate PRs are 23% of reviewed rejections; CI/test failure 17%; not-merged changes touch more files and more lines — [MSR 2026, 33.6k agent PRs](https://arxiv.org/abs/2601.15195) | Ranks duplicate work and oversized diffs above stylistic debt |
| Agents pick the correct file in 72–81% of *failed* runs — [code agent trajectories](https://arxiv.org/abs/2511.00197) | Defects concentrate in the edit, not the search — audit what changed, not where |
| Agents "prioritize runnable code over correctness, and repeatedly choose to suppress errors" — [9 failure patterns](https://daplab.cs.columbia.edu/general/2026/01/08/9-critical-failure-patterns-of-coding-agents.html) | Direct basis for the error-masking class |
| Reimplementing a library instead of importing it, and duplicate helpers over a shared one — same source | Names the two reinvention shapes to search for |
| Test cheating reaches 54% on conflicting SWE-bench tasks; strategies are test modification, special-casing, operator overloading, state recording — [ImpossibleBench](https://arxiv.org/html/2510.20270v1) | Enumerates exactly what to look for in test-integrity review |
| Read-only tests block the dominant cheating strategy; hiding tests drops it to near zero — same source | Prevention that outperforms post-hoc cleanup |
| 19.7% of suggested packages do not exist, 205k unique invented names — [slopsquatting research note](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_slopsquatting-ai-supply-chain_20260419-csa-styled-1.pdf) | Sets the bar: resolve every dependency name against the registry |
| Security pass rate flat at 56% for four years; Java 30%, Python 63% — [Veracode 2026](https://www.veracode.com/blog/2026-genai-code-security-report-ai-risk/) | Language-weighted attention during review |
| Patch tools silently misplacing a hunk or reporting success on an unchanged file — [Codex 30946](https://github.com/openai/codex/issues/30946), [37438](https://github.com/openai/codex/issues/37438) | Source of the "success without verifying the effect" signal |
| Exact-match edits failing on whitespace, with tolerance layers shipped because "GPT often messes up leading whitespace" — [aider 3651](https://github.com/Aider-AI/aider/issues/3651) | Explains stray reformat and indentation drift in agent diffs |
| An agent built a parallel implementation of a complete existing subsystem after a stale check reported it absent — [claude-code 87532](https://github.com/anthropics/claude-code/issues/87532) | Root cause to verify before deleting either copy |
| Unverified inferences reported as "verified"; fabricated test counts in completion summaries — [claude-code 72956](https://github.com/anthropics/claude-code/issues/72956), [80069](https://github.com/anthropics/claude-code/issues/80069) | Read the artifact, never the agent's summary of it |
| Unrequested changes shipped in a long session, one taking a homepage down — [claude-code 83531](https://github.com/anthropics/claude-code/issues/83531) | Establishes scope-creep leftovers as a real defect class |
| Repo conventions dropped after context compaction — [claude-code 6354](https://github.com/anthropics/claude-code/issues/6354) | Explains convention drift within a single file's history |
| Credentials committed despite an explicit instruction not to — [claude-code 2142](https://github.com/anthropics/claude-code/issues/2142) | Instruction files do not substitute for a scan |

## Weakly evidenced — do not overclaim

| Claim | Status |
|-------|--------|
| Agents choose regex where a parser belongs | No direct study or bug report found. Only indirect policy evidence that AI regex needs backtracking review — [OWASP CRS AI contributions](https://github.com/coreruleset/coreruleset/blob/main/AI-CONTRIBUTIONS.md) |
| Invented package names appear in shipped repositories | Rate is measured on suggestions; repository-side evidence is mitigation tooling, not confirmed commits |

Benchmark-derived rates are soft: roughly 7.8% of "plausible" SWE-bench patches are wrong — [patch correctness study](https://arxiv.org/html/2503.15223v1). Cite these rates as priority signals, never as a per-repository prediction.

Next: to classify a finding load `references/agentic-defects.md` or `references/agentic-correctness.md`.
