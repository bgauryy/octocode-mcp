# Architecture Techniques

Use this reference when the scan output is directionally useful but not yet strong enough to justify a confident architecture claim.

---

## Graph Techniques

### SCC Condensation

Collapse raw file cycles into strongly connected clusters before reasoning about architecture. This is better than treating every cycle edge as a separate problem.

Use when:

- many `dependency-cycle` findings point at overlapping files
- the same hotspot appears in multiple cycle paths
- the graph feels "sticky" but a single edge fix is unclear

Interpretation:

- a large SCC usually means a subsystem boundary is missing
- hub files inside an SCC are better refactor starting points than random cycle members

### Package / Folder Graph

Aggregate file edges into package or folder edges to see subsystem behavior.

Use when:

- file-level cycles hide the real architectural issue
- the repo has many cross-package imports
- the user asks about bounded contexts or team ownership

Interpretation:

- high cross-package chatter means packages are acting like one subsystem
- one package importing many internals of another usually means boundary erosion

### Broker / Articulation Analysis

Look for modules that many dependency paths flow through.

Use when:

- `hotFiles[]` is dominated by one or two files
- changes in one file ripple unexpectedly broadly
- the architecture feels centralized without an obvious god module

Interpretation:

- articulation points are brittle bridges between subsystems
- high-scoring chokepoints are priority refactor targets even if they have few direct findings

---

## AST And Semantic Techniques

### Relational AST Rules

Use structure-aware rules instead of single-node patterns.

Good targets:

- boundary leaks
- import-time orchestration
- controller -> repository shortcuts
- modules mixing transport, persistence, and domain logic

Ask:

- is the suspicious node `inside` the wrong context?
- does the module `have` multiple unrelated responsibilities?
- do bad patterns `follow` or `precede` each other in a repeated shape?

### Symbol-Level Usage Graphs

Reason below the file level by tracking which exports are consumed together.

Use when:

- `low-cohesion` is flagged
- `feature-envy` looks real but the file is still widely used
- a barrel or utility file may hide unrelated APIs

Interpretation:

- disjoint consumer groups usually mean the file exports multiple concepts
- one symbol cluster dominating imports can mean the logic belongs closer to that target

### CFG / Dataflow Checks

Use lightweight flow reasoning to avoid flat heuristic claims.

Best questions:

- does validation dominate sink usage?
- does cleanup happen on all exits?
- is initialization happening only on some paths?
- does import-time work trigger hidden side effects?

Interpretation:

- if the path is not explainable, lower confidence
- if validation or cleanup is path-dependent, prefer a hybrid conclusion over a local one

---

## How To Decide

- Use the **graph lens** first for cycles, chokepoints, package chatter, and startup risk.
- Use the **AST lens** first for low cohesion, feature envy, repeated orchestration, and side effects.
- Use the **hybrid lens** when graph and AST evidence point to the same file or boundary.
- If graph and AST signals conflict, say so explicitly and validate before concluding.

---

## Validation Rule

These techniques are investigation tools, not proof. Any statement about live code should still be validated with Octocode local tools when available:

1. `localSearchCode` to anchor the claim
2. `lspGotoDefinition`, `lspFindReferences`, or `lspCallHierarchy` to confirm it
3. `localGetFileContent` only after the exact location is known
