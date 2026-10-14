# Write and verify docs

Load when gathering repo facts, choosing a mode or page type, writing an ADR or `AGENTS.md`, drafting, or verifying.

## Mode

| Request | Mode |
|---|---|
| `AGENTS.md`, `CLAUDE.md`, rules the agent keeps missing | agent-docs (link human pages, never inline) |
| README, tutorial, how-to, API docs, runbook, onboarding | human-docs |
| Decision, trade-off, "why this over that" | adr |
| Whole codebase, one page per package | codebase-pack |
| Copyedit, tone, wording | style-pass |

## Page type

| Signal | Type | Pattern |
|---|---|---|
| New to X; first success | Tutorial | Goal, prerequisites, steps with visible results, outcome |
| How do I...; known task | How-to | Goal, assumptions, steps, expected result |
| Params, endpoints, flags, schema | Reference | Entries: meaning, defaults, links |
| Why; how it works | Explanation | Context, idea, alternatives; no procedures |

- No API tables in tutorials, no essays in reference.
- Codebase-pack order: index, reference, how-to; verify each file before the next.

## Gather evidence

- Inventory the root and `<workspace>/docs/`: README, CONTRIBUTING, `AGENTS.md`, ADRs, SECURITY, CI, manifests.
- Find entrypoints, config keys, and contracts by path search; read focused slices.
- Durable docs name manifest scripts ("Run `yarn test`"), not shell programs.
- Spot-check symbols by lexical or structural search; LSP use: `octocode-research`.
- Build a claim map before assertive prose; only answered (or carefully worded partial) claims become firm.

| Claim | Evidence (path, module, doc) | Status |
|---|---|---|
| `--dry-run` writes nothing | `src/install.ts`, `install.test.ts` | answered / partial / missing |

## Draft

- Identify the reader, target paths, purpose, evidence, and gaps; outline large documents or sets.
- Follow existing terminology and heading style; examples beside their concept; steps in execution order.

## Agent-readable pages

- One idea per bullet; tables for command and path maps; short pages linking deeper ones; no intros, slogans, or restated README.
- Link the parent index, siblings, and ADRs; never "see docs".
- A command or signature only when the reader must copy it; else link the source. No code dumps (full config, long JSON or YAML).
- Links and bullets answer "where do I look?" and "what must I not break?".

## ADR

- Only for a settled choice that is expensive to reverse (stack, schema, auth, API style, infra); not obvious code or prototypes.

| Situation | Action |
|---|---|
| Convention found (`docs/adr`, `docs/decisions`, `.adr-dir`, MADR), consistent | Match its location, numbering, and headings |
| Convention found, conflicting | Surface the conflict; no second scheme |
| No convention | Numbered ADR under `docs/decisions`, named `ADR-NNN-short-title` (`ADR-007-use-postgres.md`) |

- Decision (ADR) sections: Status (proposed, accepted, superseded, or deprecated), Date, Context, Decision, Alternatives considered, Consequences. Keep Status accurate; supersede, never delete.
- Link it from the relevant index or architecture doc.
- Done when: convention matched or default justified, at least one alternative or an explicit "none", no secrets.

## Agent instruction files

- Follow the [agents.md](https://agents.md/) spec for `AGENTS.md` and `CLAUDE.md`; the closest nested `AGENTS.md` wins, so nested files are short deltas.
- Draft as an index; verify every linked path and command.
- Sections only for non-obvious value: package manager (one line); Commands table (task, command, file-scoped test or lint); External references table (need, path); Key conventions that prevent likely mistakes.
- Symlink between hosts only when both read the same rules and the repo supports it.
- Omit welcome text, skill lists, and linter-config restatements.

## Verify

- API or tool docs: trace schema, input, runtime behavior, result; exercise continuations and error examples.
- Separate static types from runtime checks, and measured reliability from untested claims.
