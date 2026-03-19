# RFC: Agent-Safe AST Artifact Reading

## Summary

This RFC standardizes how agents inspect generated AST artifacts in `octocode-local-code-quality`.

The recommendation is to keep a dedicated `ast-tree-search` CLI for `ast-trees.txt`, make the TypeScript source authoritative, generate the runtime JS from that source, and have generated `summary.md` guidance point to the exact scan artifact being discussed.

## Motivation

The current AST artifact workflow had four failures:

1. latest-scan ambiguity: commands that target `.octocode/scan` can silently read a different scan than the `summary.md` the agent is reviewing
2. conflicting working-directory assumptions: some generated commands only work inside a scan directory while others assume repo-root or skill-root execution
3. source/runtime drift: AST guidance and runtime behavior diverged because `scripts/` and `src/` were not acting like one source-of-truth pipeline
4. agent-noisy output: artifact search could dump hundreds of hits with no built-in narrowing, which makes triage harder and increases false conclusions

Agents need artifact inspection that is pinned, bounded, and clearly separate from source-level AST search.

## Alternatives Considered

### 1. Keep `grep` or `rg` only

Pros:

- zero new code
- flexible for power users

Cons:

- easy to run against the wrong artifact
- no default bounding or structured metadata
- weak affordances for agents that need predictable output

### 2. Teach `ast-search` to ingest generated output files

Pros:

- one CLI surface
- reuses an existing command name

Cons:

- mixes two different problem spaces: generated artifact triage and source-level AST matching
- increases confusion about what is being validated
- encourages agents to treat artifact search as if it were source proof

### 3. Keep a dedicated AST artifact CLI with TypeScript source-of-truth

Pros:

- clean separation between artifact navigation and source search
- output can be optimized for agent triage
- easy to pin generated guidance to the current scan

Cons:

- one additional CLI surface to document and test
- more summary-generation logic
- build sync must be maintained so `scripts/` does not drift from `src`

## Recommendation

Adopt alternative 3.

- `ast-tree-search` remains a dedicated CLI for generated `ast-trees.txt`
- `ast-search` remains the source-level structural search tool
- the TypeScript source under `src/` becomes the implementation source of truth
- generated `summary.md` points to the exact `ast-trees.txt` file for the current scan
- artifact search output is bounded and filterable by default

## Design Notes

- default `--limit` is `50`; `0` means unlimited output
- `--file` and `--section` support scan-specific narrowing
- output always includes the selected `ast-trees.txt` file
- JSON output includes parsed `file` metadata for each match
- raw `rg` remains documented only as a fallback for indentation/text checks

## Drawbacks

- more implementation and testing surface
- generated docs and runtime help must stay aligned
- users now need to understand when to use artifact search versus source search

## Implementation Plan

1. Add `src/ast-tree-search.ts` and tests.
2. Regenerate runtime `scripts/` from TypeScript source.
3. Update `summary.md` generation to print pinned commands for the current scan.
4. Add package aliases and reference docs for the new CLI.
5. Update skill docs so the artifact-search flow is consistent everywhere.
6. Validate with package tests and a real scoped scan.
