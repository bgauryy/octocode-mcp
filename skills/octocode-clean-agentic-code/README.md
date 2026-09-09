# Octocode Clean Agentic Code

Cut dead weight from a codebase without changing observable behavior.

## Use when

- Shims, legacy stubs, re-exports, aliases, or compatibility adapters need removal.
- Duplicate logic, copy-pasted helpers, or redundant utility wrappers clutter the codebase.
- Patch regexes, monkey-patches, or always-true environment conditionals accumulate.
- Verbose comments, dead comment blocks, junk docs, or god documentation need trimming.
- Config files are bloated, contain redundant keys, or exceed sensible length.
- God files (one file doing multiple jobs) or god folders (one folder owning many domains) need splitting.
- Files are misplaced in the wrong layer or directory.
- A coding agent left residue behind: helpers reinvented instead of imported, a parallel implementation of an existing subsystem, files with no dependents, scope-creep edits, or change-narration comments.
- Code disguises a failure as a success: error-masking catch blocks, tests special-cased to pass, dependencies that do not resolve, or placeholder credentials.
- An artifact records how a decision was made instead of the decision: pasted tool output, provenance or research trails, process metadata, dated claims, counts nobody re-derives, or the same fact stated by two owners.

## Rules

- Confirm removal against exact source, applicable references, entrypoints, configuration, and the project's checks. Search, graph edges, and LSP results each have scope limits.
- Never change behavior; flag any removal that requires a behavioral change.
- Keep batches reviewable and within existing authorization; run the relevant project checks and inspect their output.
- Report defects that disguise a failure; never delete them as junk, because removing the disguise is a fix.

## Workflow

```text
SCOPE → AUDIT → INVENTORY → TRIAGE → CONSENT → EXCISE → VERIFY
```

## Install

```bash
npx -y octocode skill install octocode-clean-agentic-code
```

## Maintainer verification

Run the `octocode-skills` review against this folder.
