import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFrontmatter } from '@earendil-works/pi-coding-agent';
import { globalPaths, piAgentDir, projectAgentDirs } from '../shared/home.js';
import { packageRoot } from '../shared/package.js';

export interface AgentProfile {
  name: string;
  description: string;
  prompt: string;
  tools?: string;
  /** Comma-separated tools the child must not have (Pi's --exclude-tools), e.g. `file` for read-only profiles. */
  excludeTools?: string;
  /** Preferred model: `provider/id` or a bare id, optionally `:thinking`. Unavailable here: the child runs on the parent's model. */
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
