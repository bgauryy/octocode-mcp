# Output

<!-- report-contract {"statuses":["Pass","Fail","Partial"],"required":["Finding","Steps","Gaps"],"anyOf":[]} -->

## Response

Markdown, task content only. BLUF: the supported finding first, each claim beside its source URL or capture path (Claim–evidence), then the observed post-action state and the coverage gap. No probe output or process metadata.

## Saved result

Captures keep their returned formats (JSON, images) in the runtime folder (normally `<workspace>/.octocode/octocode-chrome-devtools/tmp/`); link large ones, never paste. Reports go to `<workspace>/.octocode/octocode-chrome-devtools/<YYYY-MM-DD>-<slug>.md`; `<workspace>` is the repository root, else cwd, never inside an existing `.octocode/`. A user-named path wins; harness or subagent scratch (`.octocode/tmp/`) does not: save here, link from scratch.

## Presentation choices

Finding → reproducible steps → observed result → gaps. Keep each screenshot beside the claim it demonstrates.

| Format | Use when / why |
|---|---|
| Markdown images | Show UI evidence with meaningful alt text, viewport context and a nearby takeaway; link full captures. |
| `sequenceDiagram` / `stateDiagram-v2` | Explain browser/network ordering / visible state changes. |
| `chart` line or bar / linked HAR or JSON | Compare measured timings / retain machine-readable evidence without pasting large traces. |

Follow the [shared visual-first, content-only rules](references/report-output.md#choose-the-format), including image embedding and iframe alternatives; load the [Mermaid chooser](references/report-mermaid.md) for specialized syntax or [widget schemas](references/report-widgets.md) before authoring graph/chart JSON.

## Saved report

Save and render a result with a table, diagram, 40+ lines, or five findings, or when the user or project instructions ask; short answers stay in chat.

Use the [shared header rules](references/report-output.md#report-header) with these skill-specific status values:

```yaml
---
status: Pass | Fail | Partial
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Then a `#` title and a BLUF lead paragraph. Always include `## Finding`, `## Steps`, and `## Gaps` (write `None.` when nothing is missing). Steps is one table:

| # | Action | Observed state | Capture | Result |
|---|---|---|---|---|

Result: `Pass`, `Fail`, or `Partial`. Capture files (screenshots, HAR, traces): add `captures: <workspace-relative capture folder>` to the header and a `## Captures` section linking each; inline-only captures get `inline only` in the Capture cell.

Unfinished work (`next` set) is a Handoff packet: current state and evidence in `## Finding`, attempts in Steps, blockers in `## Gaps`, next action in `next`, plus constraints and the target, frame, or session ids the next call needs. A blocker that needs someone else's action leads the BLUF as an SBAR: situation, background, assessment, recommendation.

Follow [shared report guidance](references/report-output.md) for rendering, `--manifest`, evidence, diagrams, and presentation.
