# Results dashboard

One page, two outputs, same code (`dashboard/page.html`):

- **Static file** for the repo: `build_datasets.py --static results/overview/index.html` inlines the
  data and a small stand-in for the dashboard runtime. Open it from disk.
- **Shareable dashboard** in Claude: a Dashboard artifact whose numbers each link to their
  source dataset. Readers can open Sources and download the rows as CSV.

The page has three tabs. **Benchmark** shows a takeaway sentence, anchor-versus-each-arm
tiles, a median-characters chart, how much leaner the anchor is (with intervals), every
question as a log-scale strip, a pairwise matrix, correctness in whole points, head-to-head
pairs, the tools table and live runs. **What's new** shows `release-notes.json`: old → new
tools and notable changes. **How it's measured** is the method in plain words. Tools and
groups come from the data, so new arms and versions need no page edits.

## Datasets

`build_datasets.py --out <dir>` writes one JSON file per dataset from `results/`:

| id | Title | Description |
|---|---|---|
| `groups` | Tool summary | One row per tool: median, mean and total characters per question, correctness (whole points and exact mean), and how many times leaner the anchor is, with a 95% bootstrap interval. From results/overview/matrix_summary.json. |
| `per_question` | Characters per question | Mean characters and whole-point correctness for each question and tool. |
| `matrix` | Pairwise leanness matrix | Every ordered pair of tools: per-question geometric mean of column ÷ row characters and how many questions the row was leaner. |
| `head_to_head` | Same-run head to head | Arms judged together in one campaign: questions each was more correct on, ties, and wins. |
| `live_runs` | Live runs | Every arm of the current-harness campaigns: runs, tool calls, failures, clasify calls, median characters, tokens, cost, correctness. From results/*/run.json. |
| `tool_map` | Tools, then and now | release-notes.json: how the previous release's tools map onto the current ones. |
| `changes` | Release changes | release-notes.json: notable changes in the benchmarked release, from CHANGELOG.md. |

Edit `release-notes.json` per release: `tool_map` rows are `{v18, v20, family, change}` (old
name, new name, area, one sentence) and `changes` rows are `{area, title, detail}`. Take
claims from CHANGELOG.md and the server's tools/list, not from memory.

## Publish a new dashboard

1. `Artifact` `action: "quickstart"`, `intent: "other"`, then publish with the Dashboard
   `type_url` it names, a `title` such as "Octocode Benchmark", and
   `auto_open: "after_first_write"`. Read the type's instructions in the result and follow them.
2. Upload each dataset file: `Artifact` publish with `url`, `asset: true` and `file_path`
   (one JSON per call). Keep each returned `/_blob/<id>` url.
3. One `ArtifactData` `batch`:
   - `dash/meta` → `{title}`
   - `datasets/<id>` → `{title, description, source: {kind: "file", url, name}, updated: {at, by}}`
     for every row of the table above
   - `files/index.html` → `{text: <page.html>}` (wrap the file in a JSON object and pass
     `file_path` so the page doesn't go through the conversation)

## Update an existing dashboard

Find it with `Artifact` `action: "list"`. Rebuild the datasets, upload each changed file as a
new asset, then `ArtifactData` `update` each `datasets/<id>` with the new `url`, `name` and
`updated`, pinned with the `if_version` you read. Replace `files/index.html` the same way
when `page.html` changed. The dashboard is private until its owner shares it from the page.

## Page rules (the Dashboard type enforces them)

- Every figure comes from a dataset. A displayed value is marked
  `data-source="<dataset>" data-field="<column>" data-where="<key>=<value>"`, and a table
  sets `data-source` and `data-row-key` on `<table>` and `data-field` on each `<th>`.
- No numbers in markup, no network, no storage. `d3` is the global for charts, and colors
  come from `dash.colors` and theme tokens.
- Draw everything inside `dash.onData`, and handle every status (`ok`, `loading`, `error`).
