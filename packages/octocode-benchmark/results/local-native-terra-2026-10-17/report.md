# Native CLI versus shell: quality review

Octocode returned substantially less raw text in this exploration, but the source review
found material answer errors in both arms. A quality-equivalent efficiency winner has not
been established.

The [saved run](../../campaigns/terra-cli-ab-20261017T094616Z)
contains the sealed answers, original receipts, binary and corpus identities, and the initial
measurements. [Every-question comparison](../../campaigns/terra-cli-ab-20261017T094616Z/quality/comparison.md)
joins those measurements with separate returned-data and semantic audits.

Both solver roles used `gpt-5.6-terra`. The Octocode role needed a continuation session, so
this was three sessions over two roles. The native arm used the requested built darwin-arm64
binary. The shell arm used rg and ordinary read-only commands; ast-grep was available but
unused. AST, LSP and topology tools were unused by the native worker. This run cannot support
an all-tools or isolated-per-question benchmark claim.

All 60 answer hashes remain intact. The returned-data audit verified 30 Octocode receipt sets
and 29 shell sets; shell Q07 remains unverified. Every parsed returned source-line occurrence
matched the checkout at audit time. That establishes source fidelity, not answer correctness.
The independent semantic audit checked material source facts for all questions, identifying
errors such as unresolved-reference behavior, reload ordering and cache publication after
invalidation. Its grades are provisional, unblinded and incomplete as coverage assessments.
Independent acceptance records factual disagreements separately; original audit grades remain
available.

The original 29 valid receipt pairs show an 18.2× geometric-mean reduction in normalized raw
retrieval exchange tokens, with a repository-clustered 95% bootstrap interval of 11.2–30.8×.
This ratio is descriptive and has no quality-equivalence gate. Raw tool output can exceed
what the host showed the worker. Initial prompts are excluded; actual provider input/output,
reasoning tokens and inference rounds are unavailable. Do not interpret these counts as billed
usage or monetary savings.

Shell command execution was faster inside the measured sandbox. A synthetic control showed
native search latency around 2.76 seconds inside versus 17–64 milliseconds outside; the cause
was not established. End-to-end arm spans include waits and coordination, and question spans
overlap. These timings do not isolate engine speed.

The practical lesson is to pair targeted searches with exact reads and causal-chain checks.
Compact results reduce context volume, but search hits alone did not prevent false conclusions.
The shell worker's huge searches increased truncation risk; the native worker sometimes stopped
before tracing the decisive implementation. Tool coverage and schema friction need their own
applicability lane rather than being inferred from this answer comparison.

Reproduce the audits and rendering with the [local cookbook](../../local/README.md). The
[external cookbook](../../external/README.md) covers the existing GitHub campaign harness.
