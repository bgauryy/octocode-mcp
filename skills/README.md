# Octocode skills

These published Agent Skills guide research, design, writing, measurement, tool use, and agent-workflow execution. Each folder has `SKILL.md` for agent activation and workflow, `output.md` for result formats, and a short `README.md` for people. The shared authoring standard is in [octocode-skills](octocode-skills/SKILL.md).

Saved skill output lives under the project's `.octocode/` folder: reports and authored artifacts (research reports, RFCs, briefs, reviews, eval runs) in `<workspace>/.octocode/<skill-name>/`, and runtime captures and scratch files in its `tmp/` subfolder, so every file a skill writes stays under its own folder. A path the user names takes precedence; edits to the project's own code, docs, prompts, or skills stay at their source paths.

Every skill ships the same zero-dependency renderer, `scripts/render-report.mjs`. For people, it turns a saved report, a report folder, or the whole `<workspace>/.octocode/` folder into one local HTML page with navigation, search, a contents rail, a sources list, editor links for code references and local docs, Mermaid diagrams, and light/dark and print styles. It stays closed; agents pass `--open` only when asked. The page header links the Markdown it was built from. For agents, `--manifest` prints one JSON catalog of every saved report (path, skill, title, date, `status`, `confidence`, `question`, `next`, lead, headings, links, and code references), so a later session finds earlier work without opening each file. Each skill's `output.md` says when to save, which header and sections to write, and which path goes to whom. The canonical copy is in `octocode-skills/scripts/`; after editing it, run `node octocode-skills/scripts/report-viewer-sync.mjs`. The skill reviewer fails on drifted copies.

| Skill | Use when |
|---|---|
| [Research](octocode-research/) | A code, repository, or change-impact claim needs evidence. |
| [Workflows](octocode-workflows/) | An orchestrator must select actors, sequence a multi-actor workflow, merge evidence, or resume it. |
| [Scraping](octocode-scraping/) | Public pages need fetching or a reusable source corpus. |
| [Chrome DevTools](octocode-chrome-devtools/) | A live browser is needed for rendering, interaction, or diagnostics. |
| [Brainstorming](octocode-brainstorming/) | An open idea or claim needs independent research directions and current, checked evidence. |
| [Architect](octocode-architect/) | A software boundary or refactor needs an architecture decision. |
| [RFC Generator](octocode-rfc-generator/) | A consequential technical choice needs its decision, design, and plan in one RFC. |
| [Roast](octocode-roast/) | A blunt, evidence-backed code critique is requested. |
| [Clean Agentic Code](octocode-clean-agentic-code/) | Proven code or instruction redundancy should be removed. |
| [Documentation](octocode-documentation/) | Technical documentation needs writing, repair, or review. |
| [Agentic Prompts](octocode-agentic-prompts/) | Prompts or agent flows need a behavioral rewrite. |
| [Skills](octocode-skills/) | Agent Skills need creation, review, tuning, or installation. |
| [Eval Benchmark](octocode-eval-benchmark/) | A change needs a measured baseline and verdict. |
| [Agents Communication](octocode-agents-communication/) | Agents or sessions need shared messages, evidence, or handoffs. |

These are public skills. Tested, unpublished skills live in [skills-beta](../skills-beta/); repository-only development helpers live in [skills-dev](../skills-dev/) and are not part of the public selection catalog.

## Install and review

```bash
npx -y octocode skill list
npx -y octocode skill install octocode-research
node skills/octocode-skills/scripts/skill-review.mjs skills
```

The reviewer checks structure and local links. Test representative user requests to judge trigger quality; a structural pass cannot prove activation behavior.
