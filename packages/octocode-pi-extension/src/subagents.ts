/**
 * Subagent registry — typed configuration for every specialised Pi subagent
 * this extension ships.
 *
 * Each subagent has:
 *   - A typed name (union literal)
 *   - Tool allowlist (no nested spawning; role prompts bound repository edits and shell use)
 *   - Resource mode (always 'octocode' so the extension's own tools are available)
 *   - SYSTEM_PROMPT.md path loaded at runtime from dist/subagents/<name>/
 *   - Canonical enabled skills, plus any subagent-local skill dirs
 *
 * The spawnSubagent tool reads this registry, loads the system prompt,
 * and calls spawnRpcAgent (same internal fn as spawnAgent, same agents Map →
 * AgentMessage works on anything spawned here).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResourceMode } from './tools/agents/types.js';
import { discoverSkills } from './tools/skill-discovery.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubagentConfig {
  /** Unique id — used as the spawnSubagent `agent` param value. */
  name: SubagentName;
  /** Human label shown in AgentMessage list output. */
  label: string;
  /** One-line description of what this subagent does. */
  description: string;
  /**
   * Tool allowlist for the subprocess. spawnAgent/AgentMessage are always
   * excluded by Pi regardless.
   */
  tools: string[];
  /**
   * Resource mode for the subprocess.
   * 'octocode' loads this extension so the subagent has chromeDebug etc.
   * 'lean' = no extensions, no skills — only built-in tools.
   */
  resourceMode: ResourceMode;
  /** Thinking level for the subprocess. */
  thinking?: string;
  /** Default model override. */
  model?: string;
  /** Default Pi provider override. Set when a subagent's default model lives on a custom
   *  provider whose id collides with a builtin namespace (e.g. claude-*), so pi resolves
   *  --model to the right provider without the caller passing --provider each time. */
  provider?: string;
  /**
   * Absolute path to SYSTEM_PROMPT.md for this subagent.
   * Loaded at runtime from dist/subagents/<name>/SYSTEM_PROMPT.md.
   */
  systemPromptPath: string;
  /**
   * Static extra skill paths specific to this subagent (e.g. browser-agent's local
   * skill dir). Combined with all canonically discovered skills at spawn time by
   * resolveSubagentSkills(). If `skills` is set explicitly, these are ignored.
   */
  extraSkillPaths?: string[];
  /**
   * Explicit skill override. When set, resolveSubagentSkills returns it as-is.
   * If undefined (the normal case for SUBAGENT_REGISTRY entries), skills are
   * resolved lazily at spawn time from the canonical discovery owner.
   */
  skills?: string[];
}

/** Union of all registered subagent names (extend when adding new subagents). */
export type SubagentName =
  'browser-agent' | 'researcher' | 'planner' | 'architect';

// ─── Runtime path resolution ──────────────────────────────────────────────────

function resolveSubagentsDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.join(moduleDir, 'subagents');
  if (fs.existsSync(distDir)) return distDir;
  return path.resolve(moduleDir, '..', 'subagents');
}

/** dist/subagents/ in published builds; packageRoot/subagents/ in source tests. */
const SUBAGENTS_DIR = resolveSubagentsDir();

function subagentSkillPath(name: SubagentName, skillName: string): string {
  return path.join(SUBAGENTS_DIR, name, 'skills', skillName);
}

/**
 * Resolves the full skill list for a subagent at CALL TIME (not at import time).
 *
 * - If config.skills is set explicitly, returns it as-is (override path).
 * - Otherwise runs canonical discovery and appends valid extraSkillPaths,
 *   so late-installed skills (added after process start) are discovered without restart.
 */
export function resolveSubagentSkills(
  config: SubagentConfig | { skills?: string[]; extraSkillPaths?: string[] },
  cwd = process.cwd(),
): string[] {
  if (config.skills !== undefined) return config.skills;
  const discovered = discoverSkills(cwd)
    .map((skill) => skill.dir)
    .filter((dir) => Boolean(dir) && fs.existsSync(path.join(dir, 'SKILL.md')));
  const extras = (config.extraSkillPaths ?? []).filter((dir) => fs.existsSync(path.join(dir, 'SKILL.md')));
  return [...new Set([...discovered, ...extras])];
}

function subagentPromptPath(name: SubagentName): string {
  return path.join(SUBAGENTS_DIR, name, 'SYSTEM_PROMPT.md');
}

export function loadSystemPrompt(config: SubagentConfig): string {
  const p = config.systemPromptPath;
  if (!fs.existsSync(p)) {
    throw new Error(
      `subagent system prompt not found: ${p}\n` +
        `Run: yarn workspace @octocodeai/pi-extension build`
    );
  }
  return fs.readFileSync(p, 'utf8');
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const SUBAGENT_REGISTRY = {
  'browser-agent': {
    name: 'browser-agent' as SubagentName,
    label: 'Browser Agent',
    description:
      'Specialised browser debugging subagent. Has chromeDebug + web + local search tools. ' +
      'Use for multi-turn Chrome DevTools Protocol work: security audits, network analysis, ' +
      'DOM inspection, coverage, workers, service workers, emulation, and automation.',
    tools: [
      'chromeDebug', // CDP execution — primary tool
      'web',         // CDP docs + web research
      'MCPTool',     // Octocode MCP server: localGetFileContent, localSearch, localAnalyzeGraph, etc.
      'file',        // only parent-assigned durable handback artifacts
      'skill',       // load bundled/user workflows, including Awareness
      'bash',        // harness-provided Awareness CLI; other shell use remains role-bound
    ],
    resourceMode: 'octocode' as ResourceMode,
    thinking: 'low',
    systemPromptPath: subagentPromptPath('browser-agent'),
    extraSkillPaths: [subagentSkillPath('browser-agent', 'browser-agent')],
  },
  researcher: {
    name: 'researcher' as SubagentName,
    label: 'Researcher',
    description:
      'Fast Octocode research specialist. Has web, GitHub, npm, local, binary, and LSP tools. ' +
      'Use for evidence gathering, prior art, package/repo lookup, and concise claim ledgers.',
    tools: [
      'web',
      'MCPTool', // octocode MCP server: all GitHub, local, LSP, npm research tools
      'file',   // only parent-assigned durable handback artifacts
      'skill',  // load bundled/user workflows, including Awareness
      'bash',   // harness-provided Awareness CLI; other shell use remains role-bound
    ],
    resourceMode: 'octocode' as ResourceMode,
    thinking: 'low',
    systemPromptPath: subagentPromptPath('researcher'),
  },
  planner: {
    name: 'planner' as SubagentName,
    label: 'Planner',
    description:
      'Implementation planning specialist. Has all Octocode research surfaces and all bundled skills. ' +
      'Use for dependency-ordered plans, risks, verification strategy, and RFC handoff packets.',
    tools: [
      'web',
      'MCPTool', // octocode MCP server: all GitHub, local, LSP, npm research tools
      'file',   // only parent-assigned durable handback artifacts
      'skill',  // load bundled/user workflows, including Awareness
      'bash',   // harness-provided Awareness CLI; other shell use remains role-bound
    ],
    resourceMode: 'octocode' as ResourceMode,
    thinking: 'low',
    systemPromptPath: subagentPromptPath('planner'),
  },
  architect: {
    name: 'architect' as SubagentName,
    label: 'Architect',
    description:
      'Root-cause and local-code architecture specialist. Has all Octocode skills, local/LSP/binary tools, ' +
      'GitHub history, web, and bash for targeted debug/test loops.',
    tools: [
      'bash',
      'web',
      'MCPTool', // octocode MCP server: all GitHub, local, LSP, npm research tools
      'file',   // only parent-assigned durable handback artifacts
      'skill',  // load bundled/user workflows, including Awareness
    ],
    resourceMode: 'octocode' as ResourceMode,
    thinking: 'medium',
    systemPromptPath: subagentPromptPath('architect'),
  },
} satisfies Record<SubagentName, SubagentConfig>;
