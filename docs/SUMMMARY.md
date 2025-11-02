# Research Quick Doc (Prompt-Ready)

## 500-char Prompt Snippet
```
Flow: A Repo → B Structure → C Search → D Extract → E PRs. Start: know file→D; repo→B; topic→A; pattern→C; unknown→A. Search: path=filenames (fast) or file=impl; filter path/ext/owner; bulk queries. Extract: matchString+context or range; fullContent for small; minified=true (code), false (config). Loop to follow imports; adjust scope; validate quality (stars/updated). Synthesize when done.
```

## Instructions & Thinking Steps
- Define goal → Orient (choose A/B/C/D) → Execute (bulk) → Analyze → Decide → Iterate → Validate → Synthesize

## Hints
- Use path mode for filenames; file mode for implementation
- Add filters (path, extension, owner); remove if no results
- Exclude tests/vendor; follow imports; check README/PRs

## Decision Trees (Compact)
```
Start → Know repo+file? D : Know repo? B : Know topic? A : Know pattern? C : A
C → D → complete? yes:end | need more files:C | other repos:A | history:E
Extraction: small→full; medium→matchString/range; large→targeted only
Code→minified=true; Config/JSON→minified=false
```

## Sources
Derived from: `RESEARCH_DECISION_TREES.md`, `RESEARCH_WORKFLOWS_GUIDE.md`, `TOOLS_AND_RESEARCH_WORKFLOWS.md`, `TOOLS_TECHNICAL_REFERENCE.md`.
