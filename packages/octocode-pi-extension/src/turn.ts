import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { OctocodeMcp } from './mcp/octocode.js';
import { isOctocodeTool } from './shared/octocode-tools.js';
import { envFlag, MCP_ENV } from './shared/env.js';
import { octocodePrompt } from './prompt.js';
import type { AgentProfile } from './subagents/profiles.js';
import { AGENT_COLLABORATE_ENV } from './team/store.js';

/** Pi tools that `file` covers. */
const FILE_COVERS = ['edit', 'write'];

/**
 * Tools the user named on purpose: `--tools`/`-t` on the command line and plain or `+name` entries in `defaultTools`.
 * A `-name` entry removes a tool and does not protect it from the default loadout's substitutions.
 */
export function explicitTools(argv: readonly string[], defaultTools: readonly string[] | undefined): Set<string> {
  const names = new Set<string>();
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--tools' || argv[i] === '-t') for (const name of argv[i + 1]!.split(',')) names.add(name.trim());
  }
  for (const entry of defaultTools ?? []) names.add(entry.replace(/^\+/, '').trim());
  return names;
}

/** Whether a subagent started with this profile gets the `browser` tool. */
export function profileHasBrowser(profile: AgentProfile): boolean {
  const listed = (value: string | undefined) => (value ?? '').split(',').map((name) => name.trim());
  if (listed(profile.excludeTools).includes('browser')) return false;
  return profile.tools === undefined || listed(profile.tools).includes('browser');
}

/**
 * The session's starting tool set, or undefined when nothing changes. `file` takes the place of Pi's edit/write when
 * it is itself active (an allowlist may leave it out, and the agent never loses editing). A main session also leaves
 * `browser` (the largest schema, paid on every request) to the subagent profiles that carry it, when any does. Tools
 * the user named on purpose stay.
 */
export function sessionTools(active: readonly string[], explicit: ReadonlySet<string>, delegateBrowser: boolean): string[] | undefined {
  const covered = active.includes('file') ? FILE_COVERS : [];
  const drop = [...covered, ...(delegateBrowser ? ['browser'] : [])].filter((name) => active.includes(name) && !explicit.has(name));
  return drop.length > 0 ? active.filter((name) => !drop.includes(name)) : undefined;
}

/**
 * At session start the tool set is settled once (see sessionTools; later tool changes are the user's). Each turn
 * adds the `octocode` prompt section, rebuilt only when its inputs change so the provider cache holds. The active
 * tool set is Pi's: it is never rewritten per turn.
 */
export function registerTurnSetup(pi: ExtensionAPI, options: { isSubagent: boolean; profiles: () => Map<string, AgentProfile>; octocode: Pick<OctocodeMcp, 'owner' | 'ready' | 'instructions'> }): { reset(): void; settleTools(): void } {
  let prompt: string | undefined;
  let promptKey: string | undefined;
  /** Once Octocode is known to be here it stays for the session, so the section does not flip (and break the cache). */
  let octocodeSeen = false;
  /** Why the session started. A `/reload` keeps Pi's active tools (the user may have changed them), so it settles nothing. */
  let startReason: string | undefined;
  pi.on('session_start', async (event) => {
    startReason = event.reason;
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const selected = event.systemPromptOptions.selectedTools ?? pi.getActiveTools();
    // Pi snapshots selectedTools before this hook runs, so the Octocode tools the extension's own client registers are
    // not in it yet: ask the client. The first prompt waits (bounded) for its connect; a failed connect leaves Octocode
    // out of the prompt and a later prompt asks again (the client retries once). A user's own `octocode` server (an
    // entry in Pi's mcp.json) is Pi's: the section follows its tools.
    if (!octocodeSeen) {
      const owner = options.octocode.owner(ctx);
      octocodeSeen = (owner.by === 'extension' && (await options.octocode.ready(ctx))) || (owner.by === 'user' && owner.enabled) || selected.some(isOctocodeTool);
    }
    const octocode = octocodeSeen;
    const instructions = octocode ? options.octocode.instructions : undefined;
    const canWrite = ['file', 'write', 'edit'].some((name) => selected.includes(name));
    const inputs = {
      octocode,
      profiles: [...options.profiles().values()].map(({ name, description }) => ({ name, description })),
      canDelegate: !options.isSubagent,
      canUseAgent: selected.includes('agent'),
      canWrite,
      canShell: selected.includes('bash'),
      // A profile with `mcp: false` starts its child with MCP switched off and without Pi's MCP (`subagents/process`).
      canMcp: octocode || envFlag(process.env, MCP_ENV, true),
      ...(octocode && instructions ? { octocodeInstructions: instructions } : {}),
      // Subagent-only, and the same for every child of one run mode: nothing per-child may enter the prompt.
      ...(options.isSubagent && envFlag(process.env, AGENT_COLLABORATE_ENV) ? { collaborate: true } : {}),
    };
    const key = JSON.stringify(inputs);
    if (prompt === undefined || key !== promptKey) {
      promptKey = key;
      prompt = octocodePrompt(inputs);
    }
    // A named section (not a whole-prompt override) lets Pi record a small transcript delta.
    event.systemPromptOptions.sections['octocode'] = prompt;
    return undefined;
  });

  return {
    reset() {
      prompt = undefined;
      promptKey = undefined;
      octocodeSeen = false;
    },
    /** Once per session (not on a reload), after its profiles load: settle the starting tool set. */
    settleTools() {
      if (startReason === 'reload') return;
      const delegateBrowser = !options.isSubagent && pi.getActiveTools().includes('agent') && [...options.profiles().values()].some(profileHasBrowser);
      const next = sessionTools(pi.getActiveTools(), explicitTools(process.argv, pi.getSettings().defaultTools), delegateBrowser);
      if (next) pi.setActiveTools(next);
    },
  };
}
