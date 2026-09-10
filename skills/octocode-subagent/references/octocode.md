# Octocode research delegation

Load when subagent work needs local code, GitHub, package, history, or artifact research through Octocode. Optional — skip on hosts without Octocode.

This skill does not redefine research rules. Use `octocode-research` for routing, evidence grades, and citations.

## How To Route

1. If `octocode-research` is installed, load it inside the researcher/architect worker (or parent) for the probe. <!-- style-lint: ignore-line passive-voice -->
2. If the skill is absent but Octocode is available, use the exposed tools directly. `localSearch` finds text; `astSearch` discovers files and inspects syntax/topology; `localFetch` reads exact source; `lspSearch` answers scoped semantic questions. Read unfamiliar schemas once and follow returned executable continuations.
3. Use `ghSearch` and `ghSearchHistory` for remote discovery, `ghGetFileContent` and `ghGetHistoryItem` for exact reads, `ghCloneRepo` for an enabled local checkout, and `artifactSearch` for package lookup. Select only the tools needed by the question. Read the observed source with `localFetch` before anchored LSP: `uri` plus `symbolName` and 1-based `lineHint`, or 0-based UTF-16 `position`. An empty result has meaning only within its completed scope.
4. Install the research skill only when requested or otherwise authorized:

```bash
npx -y octocode skill install octocode-research
```

Return evidence into the subagent result packet, then synthesize in the parent.
