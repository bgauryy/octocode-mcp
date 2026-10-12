import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { sanitizeTerminalText, storedText } from '../shared/sanitize.js';
import type { Member } from './model.js';
import { AGENT_GOAL_ENV, AGENT_ROLE_ENV, PARENT_ID_ENV } from './store.js';

/** Who an agent is on the team: its name (the id), its goal, and the row it joins with. */

/**
 * Every agent's name comes from here: `adjective-creature` (`inky-kraken`), drawn from a closed list so names stay
 * short, friendly and easy to type. The name is the team id: it is the `sendMessage` address, the worktree ref
 * (`refs/octocode/pi/<name>`) and the scratch folder, so it holds only lowercase letters, hyphens and digits.
 */
export const ADJECTIVES: readonly string[] = [
  'inky', 'deep', 'swift', 'curious', 'salty', 'sly', 'glowing', 'tidal', 'misty', 'briny', 'nimble', 'plucky', 'jolly', 'wily', 'sneaky', 'bubbly',
  'dapper', 'mellow', 'cosmic', 'cheeky', 'zesty', 'snappy', 'wobbly', 'bouncy', 'sleepy', 'spry', 'nifty', 'sparkly', 'shy', 'bold', 'calm', 'merry',
];

export const CREATURES: readonly string[] = [
  'kraken', 'squid', 'tentacle', 'nautilus', 'cuttlefish', 'siphon', 'reef', 'abyss', 'octopus', 'ink', 'coral', 'clam', 'shell', 'barnacle', 'urchin',
  'seahorse', 'anemone', 'lagoon', 'tide', 'kelp', 'pearl', 'mantle', 'beak', 'jelly', 'crab', 'starfish', 'dolphin', 'otter', 'turtle', 'whale', 'eel', 'prawn',
];

/** Longest base name (`adjective-creature`); a numeric suffix added when the list runs out comes on top. */
export const MAX_NAME_CHARS = 16;

/** Every permutation that fits in `MAX_NAME_CHARS`. */
export const AGENT_NAMES: readonly string[] = ADJECTIVES.flatMap((adjective) => CREATURES.map((creature) => `${adjective}-${creature}`)).filter((name) => name.length <= MAX_NAME_CHARS);

/**
 * A name nobody in `taken` holds, chosen with `random` (0 ≤ r < 1). When every name is taken, a random one gets the
 * smallest free numeric suffix (`inky-kraken-2`).
 */
export function agentName(taken: Iterable<string> = [], random: () => number = Math.random): string {
  const used = new Set(taken);
  const free = AGENT_NAMES.filter((name) => !used.has(name));
  if (free.length > 0) return free[Math.floor(random() * free.length)]!;
  const base = AGENT_NAMES[Math.floor(random() * AGENT_NAMES.length)]!;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** An agent's goal: what it works on, in a few words the user and its peers can read at a glance. */
export const GOAL_MAX_WORDS = 5;
export const GOAL_MAX_CHARS = 40;
export const GOAL_EXAMPLE = 'audit auth token refresh';
export const GOAL_DESCRIPTION = `What this agent works on, at most ${GOAL_MAX_WORDS} words (about ${GOAL_MAX_CHARS} characters), shown to the user and to teammates; a crisp verb phrase such as "${GOAL_EXAMPLE}"`;

/**
 * The goal as it is stored and shown: terminal escapes removed and whitespace collapsed. A goal that is missing or too
 * long is refused with what to write instead, never cut short.
 */
export function checkGoal(input: unknown): string {
  const goal = typeof input === 'string' ? sanitizeTerminalText(input).split(/\s+/).filter(Boolean).join(' ') : '';
  if (goal === '') throw new Error(`A goal is required: write at most ${GOAL_MAX_WORDS} words on what this agent works on, for example "${GOAL_EXAMPLE}".`);
  const words = goal.split(' ').length;
  if (words > GOAL_MAX_WORDS) throw new Error(`The goal "${goal}" has ${words} words; write at most ${GOAL_MAX_WORDS} words, for example "${GOAL_EXAMPLE}".`);
  if (goal.length > GOAL_MAX_CHARS) throw new Error(`The goal "${goal}" is ${goal.length} characters; write at most ${GOAL_MAX_CHARS}, for example "${GOAL_EXAMPLE}".`);
  return goal;
}

/** Longest one-line goal or activity stored for an agent (the panel and `coordinate list` clip further). */
export const LINE_MAX = 200;

/**
 * The row a process joins the team with. A subagent's parent chose its name, role and goal and passed them in the
 * environment; a main session is `main`, named by the caller, with the goal it gives when it joins (if any).
 */
export function newMember(env: NodeJS.ProcessEnv, ctx: ExtensionContext, id: string, goal: string | undefined, now: number): Member {
  const parentId = env[PARENT_ID_ENV];
  const stored = storedText(goal ?? env[AGENT_GOAL_ENV], LINE_MAX);
  return {
    id,
    role: env[AGENT_ROLE_ENV] ?? 'main',
    ...(parentId ? { parentId } : {}),
    pid: process.pid,
    status: ctx.isIdle() ? 'idle' : 'working',
    ...(stored ? { goal: stored } : {}),
    ...(ctx.model ? { model: storedText(ctx.model.id, LINE_MAX) } : {}),
    joinedAt: now,
    updatedAt: now,
    toolCalls: 0,
    input: 0,
    cacheRead: 0,
    output: 0,
    cost: 0,
    unpriced: false,
  };
}
