import type { DiscoveredSkill } from './tools/skill-discovery.js';
import type { SessionArtifactContext } from './tools/session-artifacts.js';
import type { SkillInfo } from './types.js';

/**
 * State whose lifetime is exactly one Pi session.
 *
 * The extension also holds extension-scoped state (registered once, outlives
 * every session) and turn-scoped state (cleared at turn boundaries). Only the
 * fields below are discarded wholesale on `session_start`, so `/new`, `/resume`,
 * and `/fork` adopt refreshed MCP/skill/config state while every turn inside one
 * session reuses byte-identical provider prompt content.
 *
 * Replacing the whole record rather than clearing fields individually is what
 * keeps that guarantee: a field added here cannot survive a session boundary by
 * being left out of a reset list.
 */
export interface SessionScopedState {
  /**
   * Bundled system prompt text, read lazily on the first `before_agent_start`.
   * The file does not change during a session, so caching it avoids a sync disk
   * read on every turn start across long sessions. A mid-session prompt file
   * update (for example after a skill update) takes effect on the next session.
   */
  cachedSystemPromptText: string | null;
  /** Composed prompt frozen for the session; every later turn returns these exact bytes. */
  frozenSystemPrompt: string | undefined;
  /** Signature of the last plan projection delivered through attributed turn context. */
  deliveredPlanSignature: string | undefined;
  /** Signature of the last session memory delivered through attributed turn context. */
  deliveredSessionMemorySignature: string | undefined;
  sessionArtifactContext: SessionArtifactContext | undefined;
  sessionArtifactPathsContext: string;
  /** Effective enabled skill inventory discovered on the first turn of the session. */
  latestAvailableSkills: DiscoveredSkill[] | undefined;
  /** Skill list supplied by the host with the turn's system prompt options. */
  latestPiSkills: SkillInfo[] | undefined;
  /**
   * Unread peer-message count last surfaced via the cron callback. Proactive TUI
   * notification only — separate from per-turn LLM injection. `-1` means nothing
   * has been surfaced yet, which is distinct from a surfaced count of `0`.
   */
  lastCronUnreadAlerted: number;
}

export function freshSessionScopedState(): SessionScopedState {
  return {
    cachedSystemPromptText: null,
    frozenSystemPrompt: undefined,
    deliveredPlanSignature: undefined,
    deliveredSessionMemorySignature: undefined,
    sessionArtifactContext: undefined,
    sessionArtifactPathsContext: '',
    latestAvailableSkills: undefined,
    latestPiSkills: undefined,
    lastCronUnreadAlerted: -1,
  };
}
