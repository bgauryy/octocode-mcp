# Concepts — Metric Definitions

**Instability (SDP)**: `I = Ce / (Ca + Ce)`. Ca = inbound, Ce = outbound. I=0 stable, I=1 unstable. Violation: stable depends on unstable.

**Cognitive Complexity**: Penalizes nesting. Each `if`/`for`/`while`/`switch`/`catch`/`&&`/`||` adds +1, each nesting level adds +1 more.

**Halstead**: Volume = Length x log2(Vocabulary). Effort = Volume x Difficulty. >500K effort = too complex.

**Maintainability Index**: `MI = 171 - 5.2*ln(Volume) - 0.23*CC - 16.2*ln(LOC)`, rescaled 0-100. >40 easy, 20-40 moderate, <20 flagged.

**Cyclomatic Density**: `CC / LOC`. >0.5 means every other line is a branch.

**Reachability**: BFS from entrypoints (`index`, `main`, `app`, `server`, `cli`, `public`, `*.config.*`). Stricter than orphan-module detection.

**Package Boundaries**: `packages/A/` should import from `packages/B/src/index.ts` (public API), never `packages/B/src/internal/bar.ts`.
