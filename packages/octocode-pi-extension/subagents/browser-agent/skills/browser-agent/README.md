# Browser Agent Skill

Read [SKILL.md](SKILL.md) for choosing direct browser calls or a browser worker, collecting evidence, and managing worker lifecycle.

This skill belongs to the Pi browser-agent profile. It expects the host's `agent` and `chromeDebug` tools; inspect their live schemas before constructing calls. Its [CDP reference](references/CDP_QUICK_REF.md) supplies domain-level guidance after choosing a browser phase.

Maintain this source folder in `packages/octocode-pi-extension/subagents/browser-agent/skills/browser-agent`; package builds distribute the profile assets. Keep task artifacts in the workspace, outside the skill folder.
