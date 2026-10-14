Load when the lobby's "Classifiers or clasify?" section admits a semantic call, or a typed judgment is requested. Read the live schema for the chosen tool.

- Search/fetch `classifiers` order captured evidence before the tool returns; unscored candidates stay reachable; continuations keep the order.
- `clasify` answers JEV `noul`, `choice`, or `score` questions over literal `state` or one unread `source`; no body comes back.

## Admission

- File size, candidate count, a question word, or one miss is no reason to classify; a cheap exact search or bounded read wins.
- Never repeat an unchanged judgment; a later distinct question can justify another stage. A held-state label saves no context already consumed.
- Before asking: name the decision each outcome changes; repair scope, spelling, filters, synonyms; check the captured scope (AST/LSP rows may omit guards or callees: expand bounded source or refine). Missing evidence stays unresolved whatever the label.
- Classify only when response plus required reads costs less than the cheapest direct route; reordering a fully consumed page saves nothing. Price main-model and provider usage separately; unreported usage is unknown.

## Classifiers on search and fetch

- `localSearch`, `localFetch`, `ghSearchCode`, `ghGetFileContent`: `classifiers` holds 1–5 strings, one self-contained missing fact each, naming its subject and deciding conditions. Classifiers never see the conversation or each other.
- Reads rank complete raw windows (`ghGetFileContent` needs `minify:"none"`); `fullContent`, byte windows, minified reads, files/count views and explicit sorts skip ranking (see the `ranking` receipt).
- Inspect the returned source; stop when it supports every requested fact and condition. Otherwise read the specific missing context or copy the continuation. Carry only unresolved classifiers into the next exploratory call; no extra verification reread of returned source.

## Build a clasify request

- Shape: `{queries:[{questions, state} | {questions, source}, ...]}`, at most 5 rows; exactly one of `state` or `source`. `mainGoal`/`reasoning` are metadata and never reach the judge, so each question carries its whole intent.
- `state`: data you already hold (text, object, array). An object holding a path or URL is data, never fetched.
- `source`: `{tool:"localFetch", query:{path, ranges | fullContent:true}}`, `{tool:"ghGetFileContent", query:{owner, repo, path, ref?, ranges | fullContent:true}}`, or `{url:"https://…#section"}`. Never paste unread bodies into `state`.
- One row per selection; questions over the same selection share one row and one provider request. Optional `model` pins the provider model.
- Large request: save under `<workspace>/.octocode/octocode-research/tmp/`; run `npx octocode clasify --input <file>`.

## Questions

`questions` is a map: key → `{type, instructions, criteria?}`, one observable predicate each; exact tool name `clasify`.

- `noul`: P(yes); optional `criteria:{true, false}`.
- `choice`: one label from `criteria:{label: meaning}`; add `insufficient` when no label is safe.
- `score`: ordered level from `criteria:[low … high]`.
- `instructions` and criteria may be text, objects, or arrays. No other types exist; do not ask for correctness, arithmetic, or several facts at once.

```json
{"queries":[{"source":{"tool":"localFetch","query":{"path":"/abs/client.ts","ranges":["40-120"]}},
 "questions":{"retry":{"type":"noul","instructions":"Does the selected code retry a failed request only for idempotent methods?"},
              "limit":{"type":"choice","instructions":"What bounds the retry count in the selected code?",
                       "criteria":{"constant":"A fixed constant.","config":"A configurable option.","insufficient":"The selection does not show it."}}}}]}
```

## Read results

- A row returns `model`, `answers` keyed like `questions`, and provider `usage`; a source row adds `hints.read` (the exact selection, snapshot or commit) and a URL row adds `source:{url, snapshot, expiresAt}`. `replayed:true` means saved answers, not new spend.
- `noul` near 0: this state does not establish the fact, not absence elsewhere. `choice`/`score`: read `confidence` and `probabilities`; confidence is concentration, not correctness. A score is a zero-based, possibly fractional level of your criteria (`legend`).
- Row `error` (`classificationContextTooLarge`: narrow `ranges`): never "no".
- Answers rank attention only; never infer identity, reachability, or mutation safety. Before a source claim, run `hints.read` unchanged or read the deciding lines, then return to the calling route.
