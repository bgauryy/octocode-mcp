---
name: octocode-news
description: Researches what is new in AI, developer tools, web platform, security, and notable repositories. Use when the user asks for whats-new, latest updates, recent releases, tech news, AI news, changelogs, repo updates, or trend scanning.
---

# What's New — Tech Research Agent

**Goal**: Lock scope, sweep RSS + cataloged sources in parallel, research gaps, assemble a validated JSON report and an HTML report, then open the HTML in the default browser.

## Quick Input

Use defaults silently when the user did not provide a value. Only ask if the request is genuinely ambiguous.

1. **Domains**: A=AI, B=DevTools, C=Web/JS, D=Security, E=Repos. Default: all
2. **Window**: `24h` / `7d` / `14d` / `30d`. Default: `7d`
3. **Depth**: `brief` / `deep` / `comprehensive`. Default: `deep`

## Non-Negotiables

1. Run all three discovery scripts before manual browsing.
2. Treat `references/sources.md` as the baseline catalog, not a suggestion.
3. Use official/product/project sources first; secondary sources validate or widen coverage.
4. Read the full canonical page before writing a kept item summary. RSS snippets are discovery-only.
5. When a source is a daily digest hub, open the dated daily post for the reporting window rather than summarizing the landing page.
6. Every kept item must include:
   - `summary` based on full-page content (120+ chars)
   - `whyImportant` (or legacy `whyInteresting`) explaining why the story matters now
   - `references` (at least one)
   - `contentEvidence.method = "full-page"` with `chars >= 200`
7. `topItems` are the hero stories — must not be duplicated inside `sections[].items`.
8. Record every checked, blocked, stale, or skipped source in `sourcesChecked` with `status`, `found`, and `notes`. Never silently drop a failed source.
9. Keep original item fields in JSON; add concise display fields (`shortTitle`, `shortDescription`) rather than replacing `title` or `summary`.
10. Low-heat stories still need useful editorial framing via `shortTitle` and `shortDescription`.
11. Deduplicate across RSS, manual browsing, and GitHub — same story from multiple sources counts once. Keep the richest version.
12. Finish only when JSON exists, HTML exists, and browser open was attempted.
13. When more than one domain is in scope, research each selected section/domain with its own subagent.
14. Run section subagents in parallel after discovery. The coordinator owns dedupe, ranking, final JSON assembly, and HTML build.
15. Every subagent must return mergeable structured findings only: `domain`, `candidateItems`, `sourcesChecked`, `coverageSummary`, `dedupeHints`, and `blockedOrStale`.
16. Subagents must not write the final raw JSON, validated JSON, or HTML files directly.

## Workflow

### 1) Lock Scope

Generate `{ts}` once as `YYYYMMDD-HHmmss` (e.g. `20260404-143000`) and reuse it for every output file path. Use defaults when missing: `domains=all`, `window=7d`, `depth=deep`.

If dependencies are missing: `yarn --cwd skills/whats-new install`

### 2) Discovery (parallel)

Run all three scripts in parallel — they are independent and all read `references/sources.md`:

**RSS fetch** — candidate pool and volume by domain:

```bash
yarn --cwd skills/whats-new fetch-rss \
  --window {window} \
  --json-out ~/tmp/{ts}-whats-new-rss.json
```

**Source catalog** — full coverage checklist (websites, RSS, repos, custom resources per domain):

```bash
yarn --cwd skills/whats-new catalog-sources \
  --json-out ~/tmp/{ts}-whats-new-catalog.json
```

**RSS health check** — flags broken, stale, or empty feeds so you skip them during research:

```bash
yarn --cwd skills/whats-new check-rss \
  --window-label {window} \
  --json-out ~/tmp/{ts}-whats-new-rss-check.json
```

Note: `check-rss` exits with code 1 when any feeds fail. This is expected — paywalled, challenge-protected, and temporarily down feeds always fail. Read the JSON output for the actual results; do not treat a non-zero exit as a fatal error.

After all three finish, you have:

- `rss.json` → `summary` shows volume by domain, `items` gives the candidate pool for top stories
- `catalog.json` → every website, RSS feed, repo, and custom resource to track in `sourcesChecked`
- `rss-check.json` → which feeds are broken/stale/empty — do not rely on those during research

### 3) Research (parallel by section)

Create a worklist from the selected sections/domains, then spawn one subagent per selected section:

- `ai`
- `devtools`
- `web`
- `security`
- `repos`
- optional `cross` when a story clearly spans sections

Each subagent runs the same four-step pass for its own section only:

1. **Triage RSS candidates** — scan the RSS candidate pool from step 2 and mark clear top stories for full-page reads.
2. **Check non-RSS sources** — visit cataloged websites that do not expose RSS. Skip feeds flagged broken/stale by the health check.
3. **Validate repo/release claims** — use Octocode GitHub tools for release notes, merged PRs, changelogs, and repo context.
4. **Log everything** — record checked, blocked, stale, empty, and skipped sources. These become `sourcesChecked` entries.

Each subagent returns a mergeable payload:

- `domain` — the owned section/domain id
- `candidateItems[]` — normalized candidate stories for that domain only
- `sourcesChecked[]` — every checked, stale, blocked, empty, or skipped source with notes
- `coverageSummary` — what was covered, what was quiet, what needs follow-up
- `dedupeHints[]` — URLs, repos, release pages, or products that may overlap another domain
- `blockedOrStale[]` — sources or candidate stories that need coordinator review

The coordinator waits for all selected subagents, merges their outputs, resolves cross-domain overlap, and only then moves to ranking and report assembly.

Prefer Octocode for GitHub data, local scripts for catalog/RSS work, and direct web fetching for non-GitHub sources.

**Subagent stopping condition**: stop when the domain slice has met its depth floor or exhausted the cataloged sources for that domain, and every checked/blocked/skipped source is logged.

**Coordinator stopping condition**: stop only when every selected domain subagent has finished or explicitly reported blocked status, cross-domain duplicates are resolved, and the global depth floor is met (brief: 15+, deep: 30+, comprehensive: 50+).

When changing the local tooling:

- Edit TypeScript, HTML, and CSS in `src/`
- Regenerate runnable artifacts with `yarn --cwd skills/whats-new build:scripts`
- Treat `scripts/` as built output, not the authoring source

### 4) Merge Domain Outputs

Combine all domain subagent payloads before ranking:

1. Merge `candidateItems[]` from all selected domains.
2. Deduplicate by canonical URL, release page, repo, or product announcement.
3. Promote genuinely multi-domain stories into `cross` only when they span more than one section.
4. Union all `sourcesChecked[]` entries without dropping failures, timeouts, stale sources, or quiet passes.
5. Preserve `dedupeHints[]` and `coverageSummary` notes until final editorial ranking is complete.
6. Normalization adds a `theme` metadata field (`ai`, `tech`, `security`, `repositories`, `others`) to each item based on its domain. The HTML template renders sections in canonical domain order (`ai`, `devtools`, `web`, `security`, `repos`, optional `cross`), not by theme grouping.

### 5) Filter + Rank

Rank by recency, authority, shipped impact, and usefulness to a senior engineer.

Keep broadly useful signal:

- launches and releases
- product changes and deprecations
- advisories and incidents
- notable posts and research
- repo momentum and release notes
- infrastructure, pricing, and platform shifts

Quality gates:

- `tldr`: 2-5 sentences, 120+ chars, editorial not fragmentary
- item `title`: write a unique, SEO-friendly headline that differs from the source headline while staying accurate and non-clickbait
- item `summary`: 2-3 sentences, 120+ chars, written in your own words and covering who, what, where, and when
- item `whyImportant`: one short paragraph focused on why the story matters to the reader right now
- keep the combined reader-facing copy for `title` + `summary` + `whyImportant` under 150 words
- maintain a neutral, objective tone throughout
- low-heat items carry concise display copy via `shortTitle` and `shortDescription`
- hero `topItems` must not be duplicated inside sections
- preserve richer upstream fields in JSON even if the reader UI uses shorter display text
- preserve machine-friendly metadata needed by the HTML and downstream bots: `references`, `contentEvidence`, dates, source info, and any derived section/report stats added during normalization

Presentation rules for every kept item:

- Act as a professional news editor when writing the displayed story copy.
- Always include structured `references`; the rendered HTML must expose a visible `Source Link` action.
- When an item has several references, collapse them behind a single refs affordance that reveals a hover/focus tooltip list so the reader can choose the source they want.
- Keep the HTML concise in prose but dense in signal: theme summaries, section stats, source counts, freshness, and verification cues should be scannable without opening raw JSON.

### 6) Assemble Raw JSON

Write the report object to `~/tmp/{ts}-whats-new.raw.json`. Follow the schema in `references/dataStructure.md` (example + constraints) and the Zod source of truth in `src/report-schema.ts`.

Required top-level fields:

- `window` — human-readable date range (e.g. `"Mar 28-Apr 3, 2026"`)
- `windowLabel` — one of `24h`, `7d`, `14d`, `30d`
- `generated` — `YYYY-MM-DD`
- `tldr` — executive summary (120+ chars)
- `topItems` — 3-30 hero stories
- `sections` — one per domain: `ai`, `devtools`, `web`, `security`, `repos` (required); `cross` (optional, only when a story spans multiple domains)
- `sourcesChecked` — audit trail from step 3

Assembly rules:

- Each `sections[].items` list comes from its domain subagent plus coordinator dedupe.
- `cross` is coordinator-owned. Do not let a single domain subagent silently claim it as final output.
- `sourcesChecked` is the union of all subagent logs, preserved as an audit trail.

Set `quiet: true` + `quietMsg` on any domain section with no notable items.

### 7) Build, Validate, and Open

```bash
yarn --cwd skills/whats-new build-report \
  --input ~/tmp/{ts}-whats-new.raw.json \
  --json-out ~/tmp/{ts}-whats-new.json \
  --output ~/tmp/{ts}-whats-new.html \
  --require-full-content \
  --open
```

**If validation fails**: the error output lists every failing item and the reason (missing `whyImportant`, short `summary`, missing `references`, bad `contentEvidence`). Fix the failing items in the raw JSON and re-run. Do not skip `--require-full-content`.

Fallback only if the script itself is broken:

1. Copy `scripts/report-template.html`
2. Replace `__REPORT_DATA__` with the validated JSON string
3. Open the HTML manually

## Reference Files

| File | Purpose | Used in |
|------|---------|---------|
| `references/sources.md` | Source catalog — baseline for all research | Steps 2, 3 |
| `references/dataStructure.md` | Schema guide + example JSON + constraints | Step 6 |
| `src/report-schema.ts` | Zod schema — source of truth | Step 6 |
| `src/` | Editable TypeScript, HTML, and CSS source | All steps (edit here, then `build:scripts`) |
| `scripts/` | Bundled/minified runnable artifacts | Steps 2, 7 |
| `scripts/report-template.html` | Self-contained UI template (CSS inlined at build) | Step 7 (fallback) |
