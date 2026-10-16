Load when assigning workflow roles or Octocode tools, sequencing work, merging evidence, handing off, or resuming.

# Composition

## Orchestrator and actor contract

The orchestrator owns the user goal, authority, primary workflow, actor selection, sequence, one ledger, evidence merge, verification, and user-facing result. It assigns each actor a bounded input, read/write/process authority, requested observation, and done-when.

Every workflow execution has the orchestrator and at least one actor. Actors execute only their assigned steps, preserve raw evidence, and return observations keyed to the orchestrator's ledger row. They neither create another ledger nor mark the work accepted. An actor that needs another role requests it from the orchestrator; there is no nested, unsupervised orchestrator or recursive spawning.

| Before assignment | Actor handoff | Orchestrator merge |
|---|---|---|
| Goal/scope, authority, role, inputs, relevant Octocode access and anchors, target boundary, acceptance condition, next row | Row key, exact source/runtime anchors, relevant non-secret conditions, expected and observed result, counterevidence/gap, requested next action | Re-read deciding anchors, check applicability and identity, retain disproof/uncertainty, update the one ledger |

Use `octocode-agents-communication` for identity, leases, requests, completion, and durable delivery. A delivered handoff is not a verified result. One source/build owner writes a changed boundary; one process owner changes a target process. Inspectors return evidence rather than racing the writer with fixes.

For an independent check, give the checking actor the requirement, owner contract, and raw inputs before the producer's conclusion when feasible. It derives its own acceptance or distinguishing check and returns primary anchors. Two summaries of the same shared observation do not corroborate each other; the orchestrator records overlapping evidence rather than counting it twice.

Keep the acceptance oracle stable. A builder cannot weaken an assertion or redefine success to pass. An oracle correction needs owner-contract evidence, a versioned comparison, preservation of the old result, and invalidation of affected rows/comparisons; the orchestrator records the change without forcing acceptance.

## Octocode tools for every role

The [shared tool-access rule](../SKILL.md#use-octocode-across-workflows) applies to all catalog cards and metaphors. Assign the evidence question and relevant checkout/ref or entry point; let the actor choose and refine its calls. The orchestrator can use the same tools to scope work, resolve disagreements, and verify returned anchors without taking over actor duties.

Use an available Octocode MCP server or CLI (native `octocode` or the Node launcher). Inspect the live catalog and schema; availability depends on the environment. [Research's tool guide](../../octocode-research/references/octocode.md) owns invocation, availability, paging, and recovery.

| Evidence needed, in any workflow | Useful Octocode capability and application |
|---|---|
| Locate an owner or verify a written claim | `structureSearch`, `localSearch`, and `localFetch`: locate and read implementation, tests, configuration, docs, prompts, skills, or permitted memory files. Useful for writing, planning, critique, and maintenance as well as code investigation. |
| Understand shape or repeated logic | `astSearch`: find declarations, branches, duplicate patterns, and candidate paths for traversal, algorithms, cleanup, or architecture work. |
| Resolve identity or impact | `lspSearch`: confirm definitions, references, callers, and consumers before a refactor, deletion, protocol change, or acceptance judgment. |
| Check upstream facts or explain a change | GitHub search/read/history tools and `artifactSearch`: inspect pinned source, changes, package versions, and dependencies for research, brainstorming, RFCs, and reviews. |
| Connect observed behavior to implementation | Local search/read plus AST/LSP: trace a runtime or browser observation through handlers, state, and consumers; inspect scraper extraction and normalization. Pair source evidence with the domain's live observation or replay. |
| Find a resource-flow bottleneck | Local search/read plus AST/LSP: trace instruction loaders, cache keys, invalidation, queues, allocations, and lifetimes. The plumber pairs these anchors with measurements before claiming an efficiency or memory benefit. |
| Check an instruction or evaluation pipeline | Search/read the effective prompt loader, schema, fixture, grader, and result consumer. Inspect only evidence permitted by the evaluation phase; retain held-out boundaries. |
| Resume or independently verify work | Reopen exact source anchors and recheck affected consumers against current identity. Communication tools carry assignments and evidence; Octocode research tools check repository claims in them. |

Tool evidence keeps its original scope: syntax does not prove resolved identity, source does not prove runtime behavior, and a search result does not prove absence. For a capability gap, use the domain's supported alternative or return the missing evidence to the orchestrator; do not count an unavailable call as a completed check.

## Compose and resume

1. Select one primary workflow from the [catalog](catalog.md); load its owner skill when that phase begins. Add a helper only for a stated condition.
2. Choose actor duties with a distinct observation or independently derived check. Reject a split when the second role only paraphrases, lacks decisive access, cannot check independently, or costs more coordination than the bounded work. Actors request additional roles from the orchestrator; they do not create nested teams.
3. The orchestrator creates or reuses the [single ledger](verification.md#keep-one-compact-coverage-ledger), then sends row-keyed assignments.
4. Merge observations, run the applicable acceptance check, and invalidate dependent rows after a relevant change. Disagreement triggers a distinguishing observation or an explicit unresolved tradeoff—never a vote or eloquence contest.
5. On interruption, reread the existing ledger, reconcile it with current source/artifact/state identity, retain only evidence with a dependency basis, and assign the next outstanding row. Do not create a replacement ledger.

When a workflow needs unavailable actor tools, report the missing role and affected check. Do not convert the orchestrator into an undisclosed actor. A direct task outside this workflow has no orchestrator wrapper.

Next: choose a concrete split in [role patterns](role-patterns.md) or execute the selected procedure.
