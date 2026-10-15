Load when choosing which unread evidence to inspect, using `clasifyContext` on search/fetch, or requesting a typed judgment. Check the chosen tool's live schema and availability.

## Choose the route

| Next decision | Route |
|---|---|
| A known literal, line or small file answers it | Ordinary search or bounded fetch |
| Broad lexical search leaves many plausible hits | Narrow path/globs/known file terms, then optional `clasifyContext` |
| Known files contain passages needed now | Batch classified fetches; receive selected evidence immediately |
| Decide which unread files, documents or images deserve a read | `clasify` with source/asset references; receive typed answers only |
| Every match, absence, symbol identity or reachability | Ordinary traversal, AST/LSP and exact source proof |

Discover paths with structure/search first; a folder is not one `source`. For a document list, choose whether you need passages now or only labels that decide the next action. Use classified fetch for passages and standalone `clasify` for labels; avoid a separate screening pass before fetching the same relevant passages. Include call inputs, outputs and follow-up reads when comparing host cost; lower returned bytes alone do not establish token savings. A label over already-read `state` cannot save that reading. Never repeat an unchanged relevance decision through both routes. If the live schema omits classification, use ordinary retrieval.

## Select inside search and fetch

Use `clasifyContext:{classifiers:["one self-contained evidence question"],longContext?:true}`. Supply 1–5 atomic questions naming the subject and deciding conditions. Optional per-row `mainGoal` and `reasoning` reach every inline question; reasoning is a short search rationale. JEV sees neither the conversation nor answers to sibling questions.

| Tool | Evidence JEV sees |
|---|---|
| `localSearch` | Sanitized matched-line bundles per collected file, before output paging |
| `ghSearchCode` | Available hit lines on this provider page; filename-only candidates stay unknown |
| `localFetch`, `ghGetFileContent` | Source-addressed windows from the extracted ranges/matches or file, before output paging |

Inline search does not read hidden whole-file bodies. For localSearch, apply cheap `include`/`exclude` and known `fileHas`/`fileLacks` terms first. Add `contextLines` when the deciding condition is beside a hit: zero surrounding lines is the default, and increasing pageSize does not widen the evidence JEV sees. To inspect content behind an unread path, use standalone `clasify` or a classified fetch. Keep lexical scope broad enough to retrieve the deciding evidence; classification cannot recover a file the search never found.

```json
[
  {"tool":"localSearch","query":{"path":"src/http","matchString":"body","contextLines":3,"clasifyContext":{"classifiers":["Does this code reject request bodies that exceed the configured size limit?"]}}},
  {"tool":"ghSearchCode","query":{"owner":"OWNER","repo":"REPO","keywords":["body"],"path":"src/http","clasifyContext":{"classifiers":["Does this code reject request bodies that exceed the configured size limit?"]}}},
  {"tool":"localFetch","query":{"path":"docs/<upgrade-guide>.md","clasifyContext":{"classifiers":["Does this passage specify when a rolling upgrade may mix server versions?"]}}},
  {"tool":"ghGetFileContent","query":{"owner":"OWNER","repo":"REPO","path":"docs/<upgrade-guide>.md","ref":"OBSERVED_REF","clasifyContext":{"classifiers":["Does this passage specify when a rolling upgrade may mix server versions?"]}}}
]
```

Replace targets with discovered paths/refs. Omit fetch `minify` for context selection; fresh byte windows, explicit minification and streamed sources are unsupported. Local search requires a content view, not files/counts. `fullContent` is compatible but output still pages. `longContext:true` opts into the larger provider context; candidate/character/deadline budgets still apply and the provider may reject it.

For a known file with many literal hits, use fetch `matchString` plus enough `contextLines`, then classify that view. JEV cannot recover conditions outside it. Positive context may complete a small enclosing declaration; explicit ranges bound that expansion. Prefer ordinary matched fetch when those windows are already sufficient. `contextLines:0` explicitly requests complete matching lines, including very long lines. Original line gutters and `sourceLineRanges` remain file coordinates; never count output rows as source lines.

Fetch evaluates independent source-addressed windows targeting 2,048 characters, separated at omitted spans. Line views preserve whole lines; implicit long-line excerpts retain omission markers and original coordinates. Windows are not whole functions or sections. For a predicate that needs joint context across windows, use a complete standalone source selection if a typed answer can avoid reading, or inspect the deciding ranges together. `longContext` does not join inline windows or expand selection budgets. Large size alone is not a reason to classify: the question must distinguish useful material from background.

Only selected bodies return, in source order; a window can include neighboring background. Inspect `selection` status, scope, unit and selected/excluded/unknown counts. `complete` means all candidates in that declared view were decided, not that the repository or question is complete. Failed, ineligible and budget-limited candidates stay unknown; an unavailable selector returns no default bodies.

Read returned evidence once. If it answers the question, stop. Otherwise follow needed selected-page continuations unchanged, or narrow a new call to the missing fact. `next.unfiltered` returns the complete original view without classification, including selected items; use it when unknowns, withheld conditions or an exhaustive claim require that evidence. Do not drain it merely because it is under `next`. Local snapshots and GitHub file commits protect recovery; GitHub search recovery reruns its provider page and can reflect index changes. A changed question starts a new call; never edit a bound selection token.

## Screen unread sources with clasify

Each evaluation row needs keyed `questions` and exactly one of `state` or `source`; batch up to 5 independent resources. Questions about the same resource share one row. Keep standalone question intent self-contained: row metadata is not a substitute for `instructions`.

- `state`: data already held. A path or URL inside it is literal data and is never fetched.
- `source`: `{tool:"localFetch",query:{path,ranges | fullContent:true}}`, `{tool:"ghGetFileContent",query:{owner,repo,path,ref?,ranges | fullContent:true}}`, or `{url:"https://…#section"}`. File sources require an explicit complete selection. Octocode reads internally; no body reaches the host.
- Optional `longContext:true` raises the admitted state size. A too-large row fails rather than classifying a truncated prefix; narrow the selection or opt in deliberately.

```json
{"tool":"clasify","query":{"queries":[
  {"id":"upgrade-guide","source":{"tool":"localFetch","query":{"path":"docs/<upgrade-guide>.md","fullContent":true}},"questions":{"mixed_versions":{"type":"noul","instructions":"Does this guide explicitly state when a rolling upgrade may mix server versions?"}}},
  {"id":"deployment-guide","source":{"tool":"localFetch","query":{"path":"docs/<deployment-guide>.md","fullContent":true}},"questions":{"mixed_versions":{"type":"noul","instructions":"Does this guide explicitly state when a rolling upgrade may mix server versions?"}}}
]}}
```

Use the answers to choose the next read. For a source claim, read the deciding passage, preserving the returned snapshot/ref and selection scope. `hints.read` identifies the captured selection; it does not require consuming a whole winning file when a smaller anchored passage suffices. For a task requesting only typed classification, the answer may finish it. Save large requests under `<workspace>/.octocode/octocode-research/tmp/` and run `npx octocode clasify --input <file>`.

## Locate before reading

A source row's `hints.read` covers everything judged, not the supporting lines for each answer. To choose a smaller read, use `choice` with labels describing known original line ranges and an `unknown` label, plus an independent `noul` question asking whether the selected source addresses the fact at all. Send source paths; do not copy their bodies into questions. Use coarse ranges before enumerating hundreds of line labels, then read the chosen range with needed context at the same snapshot/ref.

Choice locates one preferred passage; probabilities compete and do not identify every relevant site. Use classified fetch for several passages, or split genuinely independent questions. Simultaneous questions cannot use one another's answers. A whole-source negative/universal judgment must not be reinterpreted as a per-window judgment. Twenty-line groups are an experimental address scheme, not a default quality guarantee.

## Ask atomic questions

`questions` maps a key to `{type,instructions,criteria?}`. One observable predicate per question; split independent conditions. Avoid correctness verdicts, arithmetic through scores, or requests to reason across unseen callees. Instructions/criteria may be structured data; that does not request generated JSON.

| Type | Use and result |
|---|---|
| `noul` | One yes/no predicate; optional `{true,false}` meanings; returns P(yes) |
| `choice` | Mutually exclusive `{label:meaning}` criteria; include an insufficient-evidence label when needed |
| `score` | Ordered criteria `[low … high]`; returns a zero-based, possibly fractional level, not a 1–10 confidence rating |
| `box` | Locate a named visible object in image assets; returns normalized top/bottom/left/right |

Read `probabilities`, `confidence` and `legend` where returned. Confidence is distribution concentration, not correctness. Low Noul or an excluded candidate does not establish absence elsewhere. Row `error` is never “no”; `replayed:true` means saved answers, not another provider spend. Use source for factual proof and AST/LSP for identity.

## Images and models

`assets` maps opaque placeholder keys to PNG/JPEG references from local paths, GitHub paths or HTTPS URLs. Reference each key in `state` or a question; Octocode acquires images internally. Image assets require persistent capture storage and available readers. Inline text selection does not inspect images, and a text URL does not crawl embedded images.

```json
[
  {"tool":"clasify","query":{"operation":"models"}},
  {"tool":"clasify","query":{"state":"Inspect settings_image.","assets":{"settings_image":{"type":"image","source":{"tool":"localFetch","query":{"path":"screenshots/settings.png"}}}},"questions":{"save_visible":{"type":"noul","instructions":"Is a Save button visibly present in settings_image?"},"save_location":{"type":"box","instructions":"Locate the Save button in settings_image."}}}}
]
```

Use model discovery when choosing a model, then an optional `model` to pin it. Primitive/image support can differ by model; a rejection is not a negative classification. Results report the answering model, usage and captured asset identities/inspection paths without image bytes. Inspect the saved image when a visual detail supports your claim. This capability does not imply audio/video support.
