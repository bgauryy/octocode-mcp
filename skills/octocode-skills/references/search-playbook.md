# Search Playbook

Load when discovering skill candidates. Why: sets depth, fan-out, and angles before shopping registries.

## Set depth

- Quick: enough to recommend one best candidate with caveats.
- Research: compare broadly; stop when more search does not change the pick.
- Install: inspect source, support files, destinations, conflicts before approval.
- Improve/rate/review/create: inspect target + local examples + `skill-anatomy.md` first.
- Weak results: broaden when another source or query could resolve the gap; stop when further search is unlikely to change the decision.

## Choose discovery surfaces

Start with the source most likely to answer the request. Add independent sources when comparing candidates or checking a gap; batch those reads and dedupe by `(owner/repo, skill name)`:

1. Octocode/GitHub — through `octocode.md` / `octocode-research`.
2. skills.sh API — install-ranked (below).
3. Web search — topic + "agent skill"/"SKILL.md"; confirm real `SKILL.md` before recommend.

Skip public surfaces for local/org-private scopes — Octocode only.

## Search angles

Name (exact, hyphenated, aliases) · subject · workflow verbs · ecosystem (agent/IDE/lang/MCP) · safety (gate, verify, scripts).

## Skills.sh API

```bash
curl 'https://www.skills.sh/api/search?q={{SEARCH_KEY}}&limit=100' --compressed \
  -H 'User-Agent: Mozilla/5.0'
```

Inspect the candidates that fit the task and fetch their `SKILL.md` through Octocode. Use installs only as a tiebreaker. If unavailable, use another discovery surface and report the coverage gap (`recovery.md`).

## Sparse discovery

Seed from `topic:agent-skills` and maintained collections: `anthropics/skills`, `vercel-labs/skills`, `obra/superpowers`, `microsoft/skills`, `trailofbits/skills`.

Next: when picking a registry load `references/discovery-surfaces.md`; when judging load `references/quality-rubric.md`; when ranking load `references/quality-signals.md`.
