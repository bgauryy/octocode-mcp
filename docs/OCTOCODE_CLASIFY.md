# JEV in Octocode

JEV scouts evidence before the main agent reads it. The aim is fewer tokens spent on irrelevant content while the host handles reasoning and verification. The agent sends paths, URLs or image references plus questions; Octocode acquires the content internally and sends it to JEV.

## Choose a route once

| Need | Use | Host receives |
|---|---|---|
| Choose which unread resource to inspect | `clasify` with `source` or image `assets` | Typed answers and inspection references; no source body or image bytes |
| Read relevant passages from many hits or a large file | Search/fetch with `clasifyContext:{classifiers:[...]}` | Selected evidence, coverage counts and recovery links |
| Read a known line, small file, or exact symbol | Ordinary search/fetch, AST or LSP | Direct evidence; no JEV call |

Use one classification stage per relevance decision. If selected passages already answer the question, read them once and stop. A judgment over already-read `state` cannot save that reading.

## Shared mechanism

```mermaid
flowchart TD
    A[Agent sends references and questions] --> C[clasify: capture unread text or images]
    A --> S[Search or fetch with clasifyContext]
    S --> W[Retrieved snippets or source chunks]
    C --> E[Shared evaluator and answer cache]
    W --> E
    E -->|Uncached request| J[JEV typed questions]
    J -->|Answers| E
    E -->|clasify| T[Typed answers and inspection references]
    E -->|clasifyContext| P[Selected evidence and coverage]
    E -->|Unknown or error| R[Conditional inspection guidance]
    T --> H[Host decides what to read or conclude]
    P --> H
    R --> H
```

Both routes share validation, caching, concurrent-request deduplication, retries and usage accounting. Search/fetch passes captured evidence directly to the evaluator; it does not call the public `clasify` tool.

Identical evidence, questions, model, image bytes and options reuse complete validated answers for 30 minutes. Concurrent identical requests share one provider call. GitHub bytes are cached by resolved commit; local files and URLs are reacquired to check their content. Persistent storage also saves answers and captured URL/image evidence.

## JEV API support

Octocode supports all four [JEV question primitives](https://docs.typesafe.ai/primitives), evaluation through `POST /v1/systemone`, and model discovery through `GET /v1/models`.

| Primitive | Question / criteria | Returned answer |
|---|---|---|
| **Noul** (`noul`) | One yes/no predicate; optional `{true,false}` meanings | `noul`: probability of yes, 0–1 |
| **Choice** (`choice`) | Choose among 1–255 `{label:meaning}` alternatives | `choice`, every label's `probabilities`, `confidence` |
| **Score** (`score`) | Ordered `criteria` levels, low to high, up to 10 | Zero-based, possibly fractional `score`, `probabilities`, `confidence`, `legend` |
| **Box** (`box`) | Locate a named visible object in an image | Normalized `box:{top,bottom,left,right}` and nullable `confidence` |

Questions are keyed and independent. Group questions about the same resource in one row; a sibling answer cannot supply context to another question. `instructions` and criterion meanings accept structured JSON; this organizes input, not arbitrary generated JSON output. Confidence describes the distribution, not correctness.

Also supported:

- **Images:** PNG/JPEG `assets` from local/GitHub paths or HTTPS URLs. Octocode sends original bytes without resizing and enables `TypeSafe-Danger-Zone-Images: true`. Images and Box are experimental and model-dependent.
- **Long context:** `longContext:true` enables `TypeSafe-Danger-Zone-Long-Context: true`. It increases admitted state size, not inline chunk size or selection budgets.
- **Models:** `operation:"models"` returns names, descriptions and release dates. Row `model` overrides `OCTOCODE_CLASSIFICATION_MODEL`; the default is `jev-latest`. Pin a tested model for reproducibility.
- **Results:** keyed `answers`, answering `model`, provider `usage` and `replayed`. Source/image provenance identifies what was judged; bodies stay out of standalone results.

## clasify: scout unread resources

Each evaluation row has `questions` and exactly one of `source` or `state`:

| Input | Meaning |
|---|---|
| `source:{tool:"localFetch",query:{path,ranges}}` | Read those local lines; `fullContent:true` can replace `ranges` |
| `source:{tool:"ghGetFileContent",query:{owner,repo,path,ref,ranges}}` | Read at the resolved GitHub commit; `fullContent:true` can replace `ranges` |
| `source:{url:"https://…#section"}` | Extract page text, select the section and save the capture; requires persistent storage |
| `state` | Literal data already held; paths and URLs inside it are not fetched |

Discover concrete paths before screening a folder. Batch up to five resources; put independent questions about one resource in the same row.

<!-- tool: clasify -->
```json
{
  "queries": [{
    "source": {
      "tool": "localFetch",
      "query": {"path": "docs/upgrade-guide.md", "fullContent": true}
    },
    "questions": {
      "restart": {
        "type": "noul",
        "instructions": "Does this guide explicitly require restarting the service after an upgrade?"
      }
    }
  }]
}
```

`read` in `hints` opens the captured selection at the same snapshot/commit. It is not an answer-specific citation. Read the deciding passage before making a source claim; a task requesting only typed classification can finish with the answer. URL captures expire after 24 hours; their line numbers refer to extracted text, and a stale capture is not silently replaced.

For location scouting, Choice labels can name observed source ranges, with an insufficient-evidence option. Read the chosen range with context at the same revision. Choice selects one location; use classified fetch when several passages matter.

### Unread images

Reference an asset key in `state` or the questions. An image source uses the same local/GitHub reader identity, or a direct HTTPS PNG/JPEG URL. Images require persistent capture storage and available readers; embedded page images are not crawled.

<!-- tool: clasify -->
```json
{
  "queries": [{
    "model": "jev-1.14.0",
    "state": {"screen": "image_1"},
    "assets": {
      "image_1": {
        "type": "image",
        "source": {"tool": "localFetch", "query": {"path": "screenshots/settings.png"}}
      }
    },
    "questions": {
      "present": {"type": "noul", "instructions": "Is a Save button visible in screen?"},
      "location": {"type": "box", "instructions": "Locate the Save button in screen."}
    }
  }]
}
```

Results include each asset's saved `path`, origin, snapshot, format, dimensions, size and expiry. Inspect that image when details matter. Check presence before using Box coordinates: Box can return a location for an absent object. Octocode does not switch models after rejection.

## Classifiers on search and fetch

`clasifyContext` filters retrieved evidence before returning it. Only selected bodies return, in source order. Optional row `mainGoal` and a short `reasoning` rationale add context to every inline question; JEV receives no host conversation.

| Tool | What JEV evaluates | Use |
|---|---|---|
| `localSearch` | Each hit snippet (hit + context), before paging; counts describe kept hits. `resultView` `paginated` or `matchOnly` only: another view is rejected at admission, and `repair` in `hints` drops it | Noisy search after path/glob and known-term filtering |
| `localFetch` | Windows from the file or selected ranges/matches | Large files with unknown relevant locations |
| `ghGetFileContent` | The same windows, at a resolved commit | Scoped GitHub file reads |
| `ghSearchCode` | Available hit lines on one provider page | Experimental; filename-only hits stay unknown |

<!-- tool: localSearch -->
```json
{
  "queries": [{
    "path": "src/cache",
    "matchString": "expire",
    "contextLines": 3,
    "clasifyContext": {
      "classifiers": ["Do these lines show expiry metadata being removed?"]
    }
  }]
}
```

The same `clasifyContext` works on fetch. Use `matchString` with enough `contextLines`, or explicit `ranges`, to retain deciding conditions. Positive context can complete a small declaration; ranges bound that expansion. Original line numbers remain source coordinates. Search never reads hidden whole-file bodies or recovers lexical misses.

Whole-file `localFetch` keeps declarations and their documentation together when they fit the character budget. Oversized declarations, source gaps, unsupported syntax and extracted views use complete line windows targeting 2,048 characters; omitted spans split windows. Cross-window questions can still stay unresolved, and `longContext` does not join windows. Path/count-only search views, explicit minification, fresh byte windows and streamed sources reject classification with recovery.

Keyword relevance prioritizes source-content windows for the bounded assessment budget, with each classifier getting an admission turn. This ordering does not select or exclude evidence: the classifier makes those decisions, and selected output stays in source order. Unassessed evidence remains unknown and recoverable.

Each classifier becomes a shared three-level Score rubric: no useful evidence, background, direct evidence. A candidate is selected when any question assigns direct evidence probability above 0.5; excluded only when all assign no useful evidence above 0.5; otherwise unknown. `selection` reports scope, status and selected/excluded/unknown counts. “Complete” covers that view, not the whole repository.

AST/LSP remain ordinary identity and structure tools. Their candidate paths/ranges can feed `clasify` when expensive body reads need screening; classification does not prove identity, reachability or absence.

## Questions and recovery

Ask one observable fact per question: snippets show a check, documentation states a condition, an image contains an object. Keep correctness, vulnerability proof, exact counting and cross-file reasoning with the host. Choice needs distinct outcomes and an insufficient-evidence option when the resource may not answer; Score needs meaningful ordered levels, not an assumed 1–10 confidence scale.

| Situation | Next action |
|---|---|
| Selected evidence answers the scoped question | Stop; avoid a duplicate fetch or classification |
| More selected evidence is needed | Copy the selected-page continuation unchanged; it replays without JEV |
| Unknown/unavailable inline selection matters | Use `next.unfiltered` for the unknown evidence, and `next.unfiltered3`, `next.unfiltered4`, … for unknown ranges past one call. When `next.unfiltered2` is also present, it restores the complete original view, including already-selected evidence; otherwise `next.unfiltered` restores that view |
| The candidate budget left candidates unjudged | Follow `next.nextCandidatePage` unchanged: the same classified call judges the rest, each candidate once |
| `clasify` fails or a typed answer is insufficient | Inspect `read` in `error.hints` when present, or the successful `read` in `hints`; repair the named cause |
| Image judgment is uncertain or fails | Inspect the saved image or original reference with an image-capable tool |

Unknown/error is not “no.” Captured local/GitHub read leads preserve snapshot/commit and ranges; GitHub search recovery reruns its provider page and can reflect index changes. Following an inspection lead makes no JEV call; errors never automatically dump source bodies. Guidance uses successful-row `warnings`, empty/error `hints`, or `clasify`'s nested `error.hints`. Retry rejected input after correcting it; honor backoff for transient failures.

## Availability

| Configuration | Inline `clasifyContext` | Standalone `clasify` |
|---|---|---|
| No classification key | Unavailable | Hidden |
| `OCTOCODE_CLASSIFICATION_API` set | Available on the four readers | Hidden without beta |
| Key plus `OCTOCODE_BETA=1` | Available | Available |

Reader policies and tool allow/deny lists still apply. Calls without classification make no JEV request. See [key setup](AUTHENTICATION.md#classification-key-clasify) and [what leaves the machine](SECURITY.md#classification-egress). Restart MCP after configuration changes.

Inspect fields with `npx octocode schema clasify --view query`; execute a saved request with `npx octocode clasify --input request.json`. Discover models with `npx octocode clasify '{"queries":[{"operation":"models"}]}'`. CLI and MCP share the runtime and request contract.

## Limits

| Octocode limit | Value |
|---|---|
| Standalone rows / questions per row | 5 / 25 |
| Inline classifiers / characters each | 1–5 / 1,000 |
| Serialized state, normal / long context | 32,000 / 256,000 characters, including escaping and source identity |
| Inline selection budget | 64 candidates, 131,072 characters, 10 seconds |
| Image count / bytes | 8 per row; 8 MiB each, 16 MiB combined |
| Image dimensions | 256–1,568 pixels per side; 78,400–2,458,624 total pixels |

Oversized standalone inputs fail rather than classify a truncated prefix; inline budgets leave unassessed candidates unknown. Admission does not guarantee provider acceptance, particularly for experimental images. Full fields: [tool reference](OCTOCODE_TOOLS.md#semantic-assessment-reference).

## Results and rating

**8/10 for integration and DX** — engineering assessment on 2026-10-15, not model accuracy. Strengths: unread-resource inputs, typed primitives, one evaluator and actionable recovery. Limits: chunk boundaries, experimental images and workload-dependent quality/savings. [Recovery validation](../.octocode/octocode-dev/2026-10-15-jev-recovery/README.md) passed 48 Rust tests and 24 CLI/MCP checks.

| Measured workflow | Tool input + output tokens | Guidance |
|---|---:|---|
| Noisy local search | −90% | Narrow lexically, then select |
| Large local fetch | −93% | Select when the useful location is unknown |
| Scoped GitHub fetch | −72% | Pin the ref and narrow the view |
| Exact local read | +32% | Read directly |

These [paired cases](../.octocode/octocode-eval-benchmark/2026-10-15-jev-flow-review-v2/README.md) do not establish whole-agent savings. GitHub search left every candidate unknown. A separate [whole-agent evaluation](../.octocode/octocode-eval-benchmark/2026-10-15-jev-e2e/README.md) found 2.8–10.7% savings on a forced-classification document task, while eight optional-use runs did not choose classification.

Measure all host input/output, including questions and recovery reads, separately from JEV usage. `replayed:true` is cached usage, not a fresh provider spend. With stats and persistent storage enabled, `<octocode-home>/stats.json` records provider calls, token usage and unknown-usage calls; missing usage is not zero.
