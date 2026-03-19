# Concepts — Metric Definitions

## Instability (SDP)

**Formula**: `I = Ce / (Ca + Ce)` where Ca = inbound (afferent) coupling, Ce = outbound (efferent) coupling.

**Range**: 0 (maximally stable) to 1 (maximally unstable).

**Threshold**: An SDP violation fires when a stable module (I < 0.5) depends on a more unstable module with delta > 0.15. Delta > 0.3 = high severity.

**Interpretation**: I=0 means everything depends on this module and it depends on nothing — changing it breaks many consumers. I=1 means it depends on many modules but nothing depends on it — safe to change. Violations mean a hard-to-change module depends on an easy-to-change one, creating fragility.

**Example**: Module A (I=0.2, 8 importers, 2 imports) depends on module B (I=0.8, 1 importer, 4 imports). Delta=0.6. Fix: extract an interface in A that B implements.

## Cognitive Complexity

**Formula**: Each `if`/`for`/`while`/`switch`/`catch`/`&&`/`||` adds +1. Each nesting level adds +1 more per construct inside it.

**Default threshold**: 15. Above 15 = flagged.

**Interpretation**: Unlike cyclomatic complexity, cognitive complexity penalizes deeply nested code much more heavily. A flat chain of 10 `if` statements scores 10, but 5 nested `if` blocks score 5+4+3+2+1=15.

**Example**: A function with cognitive complexity 42 has deeply nested branches. Target: refactor to <15 by extracting guard clauses, breaking into helper functions, or using early returns.

## Halstead Metrics

**Formula**: Volume = Length × log₂(Vocabulary). Effort = Volume × Difficulty. Difficulty = (distinctOperators/2) × (totalOperands/distinctOperands).

**Default threshold**: Effort > 500,000 triggers a finding.

**Interpretation**: Effort estimates the mental effort to understand or recreate the code. Volume measures information content. EstimatedBugs = Volume / 3000 gives a rough bug prediction.

**Example**: A 200-line function with effort 1,200,000 is ~2.4× the threshold — it likely needs decomposition into 3-4 smaller functions each under 500K effort.

## Maintainability Index

**Formula**: `MI = 171 - 5.2×ln(Volume) - 0.23×CC - 16.2×ln(LOC)`, rescaled to 0-100.

**Default threshold**: MI < 20 triggers a finding.

**Interpretation**: >65 = highly maintainable. 40-65 = moderate. 20-40 = difficult. <20 = very difficult to maintain. The index combines volume, complexity, and size into one number.

**Example**: MI=12 on a 300-line function means it's in the danger zone. Splitting it into 4 focused helpers of ~75 lines each would likely push each above MI=40.

## Cyclomatic Density

**Formula**: `CC / LOC` (cyclomatic complexity divided by lines of code).

**Default threshold**: > 0.5 triggers a finding.

**Interpretation**: Density > 0.5 means on average every other line is a branch point. The code is almost entirely control flow with minimal straight-line logic.

**Example**: A function with CC=30 and LOC=45 has density 0.67 — nearly pure branching logic. Consider extracting branch groups into named helpers or using lookup tables.

## Reachability

**Method**: BFS from entrypoints (`index`, `main`, `app`, `server`, `cli`, `public`, `*.config.*`). Files not reached are flagged as `unreachable-module`.

**Interpretation**: Stricter than orphan-module detection (which only checks for zero inbound imports). A file may have importers but still be unreachable from any entrypoint if its entire import subtree is disconnected.

**Example**: `utils/legacy-helper.ts` has 2 importers, but both importers are also unreachable from any entrypoint — the entire cluster is dead code.

## Package Boundaries

**Rule**: `packages/A/` should import from `packages/B/src/index.ts` (public API), never `packages/B/src/internal/bar.ts`.

**Interpretation**: Crossing into another package's internal modules creates tight coupling that bypasses the package's public contract. Changes to internals can break consumers silently.

**Example**: `packages/cli/src/run.ts` imports `packages/core/src/internal/parser.ts` instead of using the public `packages/core/src/index.ts` re-export. Fix: add the needed symbol to core's public API or restructure the dependency.
