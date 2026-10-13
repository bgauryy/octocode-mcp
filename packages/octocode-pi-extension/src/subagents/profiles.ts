import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, parseFrontmatter, SettingsManager, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Permission } from '../permission/ask.js';
import type { ActionClass } from '../permission/mode.js';
import { globalPaths, piAgentDir, projectAgentDirs } from '../shared/home.js';
import { packageRoot } from '../shared/package.js';

export interface AgentProfile {
  name: string;
  description: string;
  prompt: string;
  tools?: string;
  /** Comma-separated tools the child must not have (Pi's --exclude-tools), e.g. `file` for read-only profiles. */
  excludeTools?: string;
  /** Preferred model: `provider/id`, a bare id, or a purpose (`small`, `medium`), optionally `:thinking`. Unavailable here: the child runs on the parent's model. */
  model?: string;
  /** When set, the child's `browser` tool opens a visible Chrome on the persistent profile (logins stay). */
  visibleBrowser?: boolean;
  /** False: the child starts no MCP servers (their tool schemas would be paid on every request for nothing). */
  mcp?: false;
  /** True: the child runs the user's command hooks (`OCTOCODE_HOOKS`); by default subagents do not. */
  hooks?: true;
}

const BUNDLED_DIR = path.join(packageRoot(), 'subagents');

/**
 * Profiles by name, later directories overriding earlier: bundled → ~/.pi/agent/agents → ~/.octocode/agents →
 * <repo root>/.pi/agents → <repo root>/.octocode/agents. Project profiles (prompts, tools, models) load only when Pi
 * trusts the project.
 */
export function loadProfiles(
  cwd: string,
  home = os.homedir(),
  projectTrusted = true,
  env: NodeJS.ProcessEnv = process.env,
  onSkip: (file: string, error: unknown) => void = () => undefined,
): Map<string, AgentProfile> {
  const profiles = new Map<string, AgentProfile>();
  const dirs = [BUNDLED_DIR, path.join(piAgentDir(home), 'agents'), globalPaths(env, home).agents, ...(projectTrusted ? projectAgentDirs(cwd) : [])];
  for (const dir of dirs) {
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((file) => file.endsWith('.md'));
    } catch {
      continue;
    }
    for (const file of files) {
      // Bad YAML or an unreadable entry skips that profile only; the rest still load.
      try {
        const profile = parseProfile(path.basename(file, '.md'), fs.readFileSync(path.join(dir, file), 'utf8'));
        profiles.set(profile.name, profile);
      } catch (error) {
        onSkip(path.join(dir, file), error);
      }
    }
  }
  return profiles;
}

export function parseProfile(fallbackName: string, text: string): AgentProfile {
  const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(text);
  const field = (key: string) => (typeof frontmatter[key] === 'string' ? (frontmatter[key] as string).trim() : undefined);
  const tools = field('tools');
  const excludeTools = field('excludeTools');
  const model = field('model');
  selectedTools(tools);
  // Switches take YAML booleans only: a quoted "false" is a string, and a string never flips a switch.
  const flag = (key: string) => {
    const value = frontmatter[key];
    if (value === undefined || typeof value === 'boolean') return value;
    throw new Error(`${key} must be true or false, not ${JSON.stringify(value)}`);
  };
  return {
    name: field('name') ?? fallbackName,
    description: field('description') ?? '',
    prompt: body.trim(),
    ...(tools ? { tools } : {}),
    ...(excludeTools ? { excludeTools } : {}),
    ...(model ? { model } : {}),
    ...(flag('visibleBrowser') === true ? { visibleBrowser: true } : {}),
    ...(flag('mcp') === false ? { mcp: false as const } : {}),
    ...(flag('hooks') === true ? { hooks: true as const } : {}),
  };
}

const toolList = (list: string | undefined): string[] => (list ?? '').split(',').map((name) => name.trim()).filter(Boolean);

/** Pi owns selector validation. Its matcher is private; only `*` is special in a tool-name pattern. */
function selectedTools(tools: string | undefined): string[] | undefined {
  if (!tools) return undefined;
  const parsed = parseArgs(['--tools', tools]);
  const error = parsed.diagnostics.find((diagnostic) => diagnostic.type === 'error');
  if (error) throw new Error(error.message);
  return parsed.tools;
}

const matchesTool = (patterns: readonly string[], name: string): boolean =>
  patterns.some((pattern) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(name));

/** Excluding our file tool also excludes the native tools it replaces, including when a pattern matches it. */
export function profileExcludes(excludeTools: string | undefined): string[] {
  const excluded = toolList(excludeTools);
  return [...new Set(matchesTool(excluded, 'file') ? [...excluded, 'edit', 'write'] : excluded)];
}

/** The workspace classes exposed by the child's native selection and Octocode's direct extension tools. */
export function profileReach(profile: AgentProfile | undefined, defaultTools?: readonly string[]): ActionClass[] {
  const selected = selectedTools(profile?.tools);
  const modifiers = selected?.some((name) => /^[+-]/.test(name)) === true;
  const excluded = profileExcludes(profile?.excludeTools);
  // Native SettingsManager resolves ordered +/- entries. Only powershell among the checked tools depends on
  // defaults: file/bash register directly, and excluding file also removes native edit/write.
  const defaults = SettingsManager.inMemory({ defaultTools: [...(defaultTools ?? []), ...(modifiers ? selected! : [])] }).getDefaultTools() ?? [];
  const has = (names: string[]) => names.some((name) => !matchesTool(excluded, name) && (
    selected && !modifiers ? matchesTool(selected, name) : name === 'file' || name === 'bash' || defaults.includes(name)
  ));
  return [...(has(['file', 'edit', 'write']) ? ['file.workspace' as const] : []), ...(has(['bash', 'powershell']) ? ['shell' as const] : [])];
}

const REACH_TEXT: Record<string, string> = { 'file.workspace': 'edit files in the repository', shell: 'run shell commands' };

/**
 * The `agent.spawn` ask, showing the profile, what its tools reach and the task. Returns the grant for the child: the
 * classes the profile reaches when the user allowed this spawn, none when the mode itself allows spawning (the child
 * inherits the mode). A refusal throws, before anything starts.
 */
export async function askSpawn(permission: Permission, ctx: Pick<ExtensionContext, 'hasUI' | 'ui'>, profile: AgentProfile | undefined, task: string, signal?: AbortSignal, defaultTools?: readonly string[]): Promise<ActionClass[]> {
  const name = profile?.name ?? 'general';
  const reach = profileReach(profile, defaultTools);
  const may = reach.length > 0 ? `may ${reach.map((action) => REACH_TEXT[action]).join(' and ')}` : 'may only read and research';
  const verdict = await permission.check(ctx, {
    action: 'agent.spawn',
    title: 'Start this subagent?',
    what: [`${name} ${may}; everything else still asks, and asks are denied in the child.`, `task: ${task}`],
    // Keyed by reach too: a profile edited to reach further later is a new question.
    grant: { key: `${name} ${reach.join(',')}`, label: `${name} subagents` },
    ...(signal ? { signal } : {}),
  });
  if (!verdict.allowed) throw new Error(verdict.message);
  return verdict.via === 'mode' ? [] : reach;
}
