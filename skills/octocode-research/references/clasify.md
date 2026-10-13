# Goals and clasify

Load when the SKILL.md `SEMANTIC?` gate admits a call, or for an explicit typed judgment. Local `goals` returns reordered source; `clasify` returns locations or judgments first. Read the live schema for the selected tool.

A local request with `goals` reranks matched files or raw text windows before pagination. The best score across goals wins; ties retain original order. Unscored candidates remain reachable, and continuations reuse the ordering without another classification pass. **Scout** screens unread resources; **Judge** labels state already held in `value`.

## Admission

- Use semantic selection when an exact search or bounded read does not cheaply find the described behavior, and selecting earlier evidence could avoid later reads. File size, candidate count, or one miss alone is no reason.
- Choose the needed output: local `goals`, when exposed by the schema, returns source in relevance order; `clasify` returns locations or typed judgments first. Use one semantic stage per unresolved decision. Do not add `goals` inside a classification resource for the same relevance question.
- Prefer direct evidence when a known identifier, range, or captured snippet answers the question. Exhaustive audits still require coverage; identity and finding verdicts require their source checks. A useful held-state label is a separate deliverable and cannot save context already consumed.
- Check the captured scope before asking about behavior. AST/LSP rows may omit surrounding guards or callees; expand bounded source or refine the query first. Missing evidence remains unresolved regardless of the label.
- Compare the classification response plus required source reads and continuations with the cheapest adequate direct route. Keep provider usage separate; unreported usage is unknown. A smaller first response is not proof of savings. Scores never establish absence.

## Requests

- Shape: `{queries:[{mainGoal?, reasoning?, resources, questions}, ...]}`; a flat matrix is rejected. Each resource is `{id?, tool, query}` for an unread read or `{id?, value}` for held state; nested queries inherit `mainGoal`/`reasoning` when set. Without them, each `ask` carries the whole intent.
- State the decision each outcome changes; repair scope, spelling, filters, and synonyms first.
- Unread file (`localFetch` path or `ghGetFileContent` owner/repo/path/ref): one atomic `ask` per question; every target for the same files goes in one matrix. Never paste bodies into `value`.
- `prefilter:["term"]` sits on the read resource (not on a question) and judges windows around the hits. A term found everywhere → search it instead.
- For an admitted unread list, send the request as one resource. Ask `relevant`, adding `sufficient` only when page completeness changes the next step. Read promising `hints.read`; stop only when source verifies every required condition. Low scores defer, never discard. Complete required scope before claiming absence. A local page without a read hint is read by its path and lines. Bare path lists stay one page; a `choice` can select among paths when needed.
- `localSearch`/`ghSearchCode` hydrate candidate files within budget, otherwise judge windows near hits; `candidateEvidence:"search"` keeps snippets. AST/LSP resources instead judge returned rows grouped by file, not source behind their later read hints. A file score is not a verdict on every reference or match.
- For a large raw file, `locate` can find bounded answer lines. `sufficient` only judges the captured page; its read may repeat that whole page. PR summaries do not expand into patches automatically: request the needed sections. Screening one patch you must read adds work; a low score cannot justify skipping required review evidence.
- Each resource/page is judged independently. Separate patch, caller, and test resources do not form a joint review. For an explicitly useful cross-file second opinion, supply one held packet with the deciding context and pinned revisions. Confirm any finding or dismissal with exact source and executable checks; never automate it from a score. Dependent questions go in a later call only if a distinct uncertainty remains.

## Handoffs

Put the target in `mainGoal` when it helps the workflow. Multiple candidates or unfinished raw source can offer optional `hints.clasify`; a local call already carrying goals/ranking does not suggest another semantic pass. Apply Admission before using any hint, then run it unchanged and verify its source. `mainGoal` does not enable ranking. File counts, line counts, and English question words are not usefulness rules.

## Questions

`{id, type, ask}`, one atomic fact each. `locate` → ranked source windows (needs an unminified file read or search resource). `yesno` = P(yes), optional `labels:{true,false}`. `choice` = one label (`labels:{label: meaning}`; add `insufficient` when no label is safe). `score` = ordered level (`labels:[low … high]`). Screens: `relevant`, `supports` (claim in `ask`), `adds` (+`known`), `sufficient`. Confidence is concentration, not correctness; no discard threshold. Use the exact tool name `clasify`.

```json
{"queries":[{"mainGoal":"Find where failed requests are retried.","reasoning":"Locate before reading.",
 "resources":[{"tool":"localFetch","query":{"path":"/abs/client.ts"}}],
 "questions":[{"id":"retry","type":"locate","ask":"The condition that permits retrying a failed request."},
              {"id":"limit","type":"locate","ask":"The maximum retry count."}]}]}
```
Large requests: save under `<workspace>/.octocode/tmp/` and run `npx octocode clasify --input <file>`.

## Results

- Compact by default: each resource lists `path`, `totalLines`, and `pages[]` of `{line, endLine, answers}`; answers are bare (`exists`, P(yes), a label or level) unless a choice/score is uncertain, which keeps `probabilities`. No `coverage` = complete. `extras:["details"]` adds the per-page receipt and runner-up windows; `extras:["stats"]` adds provider `usage`. Read hints can be at query or page level; local reads may instead be implied by a page or `best` window's source location.
- `best[id]` lists answering windows as `{line, endLine, exists, probability}` (`path`/`resourceId` when several resources): `exists` = this window answers, `probability` = which window. Rows rank by `exists`, then `probability`; never multiply them. Run its `hints.read` unchanged and read other rows by their source locations. Preserve returned refs/snapshots; PR-number reads can change, so verify deciding source at the recorded revision.
- While a continuation remains and no window answers, `best` is absent and the ranking travels in `carry`: follow the `next.clasify` page unchanged instead of reading the closest passage.
- On an open walk (`coverage: partial` with `next.clasify`), `best` ranks only the pages judged so far. If its read lacks the answer, follow `next.clasify` before you search elsewhere.
- An identifier target adds a `hints.text` tip (and locally `hints.findText`): search it instead. An oversized capture fails with `classificationContextTooLarge` and keeps `hints.read`; narrow with `prefilter` or a range.
- `partial`, `error`, and `insufficient` mean narrow or read, never "no". High `probability` + low `exists` is the closest passage, not an answer. Verdicts rank attention only: never infer identity, reachability, or mutation safety; verify the deciding source.

Next: read the deciding windows, then return to the route that sent you.
