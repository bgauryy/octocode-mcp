---
name: octocode-search-skill
description: Search for, preview, and install agent skills (SKILL.md files) from GitHub. Use when the user asks to find, browse, preview, or install skills.
---

# Octocode Search Skill

A skill is a folder with a required `SKILL.md`. The file must have frontmatter with `name` and `description`, then usage instructions, workflow, gates, examples, and any supporting files.

Flow: `BROWSE -> SEARCH -> PREVIEW -> INSTALL`

## Tool Rules

Use Octocode MCP only. Do not use web browsing for GitHub.

- Search by keyword: `githubSearchCode`
- Discover skill repos: `githubSearchRepositories`
- Browse repo skills: `githubViewRepoStructure`, then `githubGetFileContent`
- Preview a skill: `githubGetFileContent`
- Download a skill folder: `githubGetFileContent(type="directory")`

Quality rules:
- Identify skills by `(owner/repo, path-to-SKILL.md)`, not repo alone.
- Treat stars as context and a tiebreaker, not proof of quality.
- Recommend only skills whose `name`, `description`, path, or visible body matches the request.
- Dedup by `(owner/repo, path)`.
- Skip files without valid `name:` and `description:` frontmatter.
- Aggregate all confirmed results before ranking. Do not stop at the first good match.
- Search exact names, related subjects, and semantic capability terms.

## Discover Marketplaces

Never use a hardcoded list. Discover live:

```text
githubSearchRepositories(queries: [
  { id: "mkts_topic", topicsToSearch: ["agent-skills"], sort: "stars", limit: 20 },
  { id: "mkts_keyword", keywordsToSearch: ["agent", "skills", "SKILL.md"], sort: "stars", limit: 20 }
])
```

Find repos with `skills/` or root-level `SKILL.md` files. Present ranked results with repo, stars, description, and why to browse it. Let the user pick.

Fallback seeds only if discovery returns nothing: `bgauryy/octocode-mcp`, `addyosmani/agent-skills`, `anthropics/skills`.

## Browse A Repo

Use when the user names a marketplace or repo.

Step 1: list skill folders.

```text
githubViewRepoStructure(queries: [{
  id: "browse",
  owner,
  repo,
  path: "<skills-path>",
  depth: 1,
  entriesPerPage: 200
}])
```

Step 2: fetch frontmatter in batches of 3 to 5.

```text
githubGetFileContent(queries: [
  {
    id: "desc_1",
    owner,
    repo,
    path: "<skills-path>/<name>/SKILL.md",
    matchString: "---",
    matchStringContextLines: 6
  }
])
```

Show a clean numbered list ordered by fit rating, then stars descending. Include skill name, repo, exact path, stars, description, one short fit note, and a concrete reason the skill relates to the user's request. Then ask the user what to do next:

```text
Choose next step:
1. Search again with a new query
2. Preview or deep-dive into a skill
3. Install a skill
```

## Search By Keyword

Search is a loop: understand intent, fan out, confirm, aggregate, show all, ask next step.

1. Understand what the user needs to find.

Extract:
- Exact skill name or phrase, if provided.
- Core task or capability.
- Related subjects and adjacent workflows.
- Tools, frameworks, agents, or domains mentioned.
- Constraints such as language, IDE, security, docs, design, install, or review.

If intent is usable, search immediately. Ask a clarifying question only when the request is too vague to form search angles.

2. Build search angles.

Create 4 groups:
- Name: exact phrase, lowercase, hyphenated, likely folder name.
- Subject: core domain keywords.
- Related: synonyms, adjacent tasks, common workflow names.
- Semantic: capability words that may appear in descriptions, such as audit, review, install, generate, migrate, document, debug, optimize.

For each group, keep 1 to 3 concise queries. Prefer recall first; rank later.

3. Run discovery in parallel.

A. Exact name and path search. Use `filename: "SKILL.md"`, not a keyword.

```text
githubSearchCode(queries: [
  {
    id: "name_content",
    filename: "SKILL.md",
    keywordsToSearch: ["<exact-or-name-query>"],
    match: "file",
    limit: 30
  },
  {
    id: "name_path",
    filename: "SKILL.md",
    keywordsToSearch: ["<hyphenated-or-folder-query>"],
    match: "path",
    limit: 30
  }
])
```

If the query looks like a GitHub username, add:

```text
{ id: "owner", filename: "SKILL.md", owner: "<query>", match: "file", limit: 30 }
```

B. Subject and semantic search. Run several concise queries from the Subject, Related, and Semantic groups.

```text
githubSearchCode(queries: [
  {
    id: "subject_1",
    filename: "SKILL.md",
    keywordsToSearch: ["<subject-query>"],
    match: "file",
    limit: 30
  },
  {
    id: "related_1",
    filename: "SKILL.md",
    keywordsToSearch: ["<related-query>"],
    match: "file",
    limit: 30
  },
  {
    id: "semantic_1",
    filename: "SKILL.md",
    keywordsToSearch: ["<semantic-capability-query>"],
    match: "file",
    limit: 30
  }
])
```

C. Repo discovery.

```text
githubSearchRepositories(queries: [{
  id: "repos",
  keywordsToSearch: ["<query>"],
  topicsToSearch: ["agent-skills"],
  sort: "stars",
  limit: 20
}])
```

4. Confirm candidates.

Merge all candidates from A, B, and C. Dedup by `(owner/repo, path)`. For repo discovery results, inspect likely skill paths with `githubViewRepoStructure` before fetching frontmatter.

Fetch frontmatter in batches of 3 to 5:

```text
githubGetFileContent(queries: [
  {
    id: "skill_1",
    owner,
    repo,
    path: "<path-from-search>",
    matchString: "---",
    matchStringContextLines: 6
  }
])
```

If a candidate looks strong but frontmatter is missing from the fetched window, preview a small body window once. If still invalid, skip it.

Ranking:
- Exact skill name match: +3000
- Partial skill name match: +1000
- Subject/domain match: +300
- Description match: +150
- Related workflow match: +100
- Semantic capability match: +75
- Body or visible text match: +50
- Stars tiebreaker: `sqrt(stars) * 30`

Common paths: `skills/<name>/SKILL.md`, `skills/<ns>/<name>/SKILL.md`, `<name>/SKILL.md`.

5. Show all confirmed results.

Show every confirmed skill from the search cycle. Group by `Strong matches`, `Partial matches`, and `Explore`. Within each group, sort by fit rating first (`High` > `Medium` > `Low`), then stars descending, then relevance. Do not rank a lower-rated skill above a higher-rated skill because it has more stars.

Use compact, readable cards. Keep the output nicely formatted: short headings, consistent field order, concise prose, and no raw search dumps. Every card MUST include a `Why this matches` field that ties the skill back to the user's exact request, using evidence from the skill name, description, path, frontmatter, or visible body.

```text
## <skill-name> [<stars> stars, <owner>/<repo>]

What it does: <description>
When to use it: <trigger/use case>
How it works: <workflow/tools/gates>
Why this matches: <specific reason this skill is related to the user's request, citing the matching capability/trigger>
Source: <owner>/<repo> <path-to-SKILL.md>
Fit score: High|Medium|Low - <short reason>
```

If there are many results, still show all names and sources. Keep cards short and preserve the rating-then-stars ordering.

6. Ask what to do next.

```text
Choose next step:
1. Search again with a new query
2. Preview or deep-dive into a skill
3. Install a skill
4. Keep researching related skills
```

If results are weak or sparse, say why and continue one more search pass with broader related or semantic terms before giving up.

## Install Gates

Do not skip gates.

Install input is a skill path, not just a name.

Reference: `INSTALL_REFERENCE.md`.

1. Normalize input.

Accept `owner/repo/path/to/skill`, `owner/repo/path/to/skill/SKILL.md`, GitHub `tree` URLs, and GitHub `blob` URLs. Convert `.../SKILL.md` to the containing folder. Derive `<skill-name>` from the final folder name.

2. Confirm install.

```text
Install this skill?
description: <frontmatter description>
source: <owner>/<repo>/<path-to-skill-folder>
y / n
```

3. Ask targets.

```text
1. Claude only: claude-code, claude-desktop
2. All agents: claude-code, claude-desktop, cursor, codex, opencode
3. Pick one agent
4. Custom path
```

4. Ask install mode. Default to copy. Use symlink only for stable source paths.

```text
1. Copy
2. Symlink
3. Cancel
```

5. Check conflicts.

Run `ls "<dest>/<skill-name>"`. If it exists, ask: `Overwrite`, `Skip`, or `Cancel`.

6. Download.

```text
githubGetFileContent(queries: [{
  id: "download",
  owner,
  repo,
  path: "<path-to-skill-folder>",
  type: "directory"
}])
```

7. Verify download and install.

Confirm `SKILL.md` exists in the returned folder, then copy or symlink that exact folder:

```bash
ls "<localPath>/SKILL.md"
cp -r "<localPath>" "<dest>/<skill-name>"
```

8. Verify each destination.

```bash
ls "<dest>/<skill-name>/SKILL.md"
```

Report success or failure per target.

## Recovery

- Zero MCP search results: try synonyms, add owner scope, or use `githubSearchRepositories`.
- Skill path not found: run `githubViewRepoStructure` at repo root.
- Download fails: verify owner, repo, branch, and path; retry directory download.
- Octocode MCP unavailable: stop and say Octocode MCP is required.
