/**
 * The footer status keys (`ui.setStatus`) that Octocode features set and the footer (`ui/footer.ts`) places itself;
 * another extension's key is appended to the footer's second line. The permission mode's key is `PERMISSION_ID`.
 */
export const STATUS = {
  /** Live agents of the team (the agents panel's one-line count). */
  team: 'octocode-team',
  /** Background subagents running, set while the panel (which counts them) is unavailable. */
  subagents: 'octocode-subagents',
  bash: 'octocode-bash',
  /** Messages queued behind the running turn. */
  queued: 'octocode-queued',
  speed: 'octocode-speed',
  backlog: 'octocode-backlog',
  /** A hook command running, with its elapsed time. */
  hooks: 'octocode-hooks',
} as const;
