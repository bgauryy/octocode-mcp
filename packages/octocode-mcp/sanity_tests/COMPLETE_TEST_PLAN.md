# Octocode MCP Tests

Run using MCP tools, doc by doc.

## Enhanced Testing Requirements

**ALL tests must validate:**
1. **Queries Structure** - Every test case must include and validate `mainResearchGoal`, `researchGoal`, and `reasoning` fields
2. **Pagination/Limits** - Each tool must have specific test cases for pagination parameters and limits
3. **Hints Validation** - **GOLDEN RULE**: All tests must check for hints in responses - hints are critical for user guidance

### Hints Validation Checklist
- [ ] Response includes helpful hints for next steps
- [ ] Hints are contextually relevant to the query
- [ ] Hints guide users toward effective tool usage patterns
- [ ] Error scenarios include recovery hints

---

## Response Validation Protocol

**EVERY test case must instruct the LLM to CHECK the response.** The assessor must verify:

1. **`instructions` field** — Present in the response; describes bulk response summary or per-query guidance
2. **`results` array** — Contains per-query status; each result has appropriate status (success/error)
3. **`data` object** — Includes tool-specific fields (e.g., `localPath`, `fileCount`, `totalSize` for directory fetch; `matches`, `lineHint` for search; etc.)
4. **Status-specific hints arrays** — Hints vary by success/error/partial; error responses include recovery hints
5. **Hints actionability and relevance** — Hints suggest the next logical tool call, pagination navigation, or search refinement

**Integration tests:** At each step of a chained flow, validate that hints from step N inform parameters for step N+1.

---

## Hints Are Golden

Every MCP tool response includes **contextual hints** that guide the LLM to the next logical action. Hints are critical for effective tool chaining and user guidance.

- **Hints guide the LLM** — They suggest the next tool call (e.g., search → LSP → read)
- **Hints include pagination navigation** — When results are paginated, hints indicate how to fetch more
- **Hints include search refinement** — When results are empty or broad, hints suggest narrowing or broadening
- **Hints include LSP suggestions** — Search results hint at `lspGotoDefinition`; definition results hint at `lspFindReferences` or `lspCallHierarchy`
- **Tests MUST verify hints** — Every test case must check that hints are present and relevant; hints validation is non-negotiable
- **Hints are embedded in every TC** — Do NOT create standalone "Hints Validation Test" TCs. Instead, each TC's Expected section includes a Response Validation sub-checklist with hints checks.

---

## Sanity Test Docs

Each doc covers: **Queries** (mainResearchGoal/researchGoal/reasoning), **Pagination** (where applicable), **Hints** (embedded in every TC's response validation).

- [01_localSearchCode.md](./01_localSearchCode.md)
- [02_localViewStructure.md](./02_localViewStructure.md)
- [03_localFindFiles.md](./03_localFindFiles.md)
- [04_localGetFileContent.md](./04_localGetFileContent.md)
- [05_githubSearchRepositories.md](./05_githubSearchRepositories.md)
- [06_githubSearchCode.md](./06_githubSearchCode.md)
- [07_githubViewRepoStructure.md](./07_githubViewRepoStructure.md)
- [08_githubGetFileContent.md](./08_githubGetFileContent.md)
- [09_githubSearchPullRequests.md](./09_githubSearchPullRequests.md)
- [10_packageSearch.md](./10_packageSearch.md)
- [11_githubCloneRepo.md](./11_githubCloneRepo.md)
- [12_lspGotoDefinition.md](./12_lspGotoDefinition.md)
- [13_lspFindReferences.md](./13_lspFindReferences.md)
- [14_lspCallHierarchy.md](./14_lspCallHierarchy.md)
- [15_githubGetFileContent_directory.md](./15_githubGetFileContent_directory.md) — directory mode, localPath, hints for local tools
- [16_integration_tests.md](./16_integration_tests.md) — cross-tool flows, hints chain validation

---

## Audit Log

All test audit data (ratings, scores, last-tested dates, failure analysis, known issues) is tracked in a separate file:

**[AUDIT.md](./AUDIT.md)** — Central audit log for all sanity tests

After running tests, record results in AUDIT.md with:
- Tool name and test case number
- Pass/Fail status
- Date tested
- Hints quality score (1-5)
- Response validation score (1-5)
- Notes on failures or unexpected behavior
