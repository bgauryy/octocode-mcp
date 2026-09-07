import os from 'node:os';
import path from 'node:path';
import {
  defaultAgentSkillSources,
  discoverAgentSkillInventory,
  type AgentSkillSourceDescriptor,
} from '@octocodeai/agent-contracts/agent-skills';
import { getSkillEnablement } from '@octocodeai/agent-contracts/mcp-state';
import type { SkillInfo } from '../types.js';
import { getAssetPaths } from '../assets.js';
import { openOctocodeDb } from './storage-policy.js';

export interface DiscoveredSkill {
  name: string;
  description: string;
  path: string;
  dir: string;
  source: string;
}

export interface DiscoveredSkillState extends DiscoveredSkill {
  enabled: boolean;
}

function skillKey(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function skillDiscoveryRoots(
  cwd: string,
  home = os.homedir()
): Array<{ dir: string; source: string }> {
  return defaultAgentSkillSources(cwd, home).map(source => ({
    dir: source.root,
    source: source.id,
  }));
}

export function discoverAllSkills(
  cwd: string,
  piSkills?: SkillInfo[],
  home = os.homedir()
): DiscoveredSkill[] {
  const found = new Map<string, DiscoveredSkill>();
  const piMetadata = new Set<string>();
  const piConcrete = new Set<string>();
  for (const skill of piSkills ?? []) {
    const name = skill.name?.trim();
    if (!name) continue;
    const md =
      (skill as { path?: string; filePath?: string }).path ??
      (skill as { path?: string; filePath?: string }).filePath ??
      '';
    const key = skillKey(name);
    piMetadata.add(key);
    if (md) piConcrete.add(key);
    found.set(key, {
      name,
      description: skill.description ?? '',
      path: md,
      dir: md ? path.dirname(md) : '',
      source: [skill.source, skill.scope].filter(Boolean).join('/') || 'pi',
    });
  }
  const sources: AgentSkillSourceDescriptor[] = defaultAgentSkillSources(
    cwd,
    home
  );
  for (const [root, scope] of [
    [path.join(home, '.octocode', 'skills'), 'user'],
    [path.join(cwd, '.octocode', 'skills'), 'workspace'],
  ] as const) {
    sources.push({
      id: `octocode:${scope}:${root}`,
      vendor: 'octocode',
      scope,
      root,
      precedence: sources.length,
      defaultEnabled: true,
    });
  }
  try {
    sources.push({
      id: 'pi:bundled',
      vendor: 'pi',
      scope: 'user',
      root: getAssetPaths().skillsDir,
      precedence: sources.length,
      defaultEnabled: true,
    });
  } catch (error) {
    console.warn(
      '[octocode:skills] bundled skill directory unavailable (dev build without dist/skills?):',
      (error as Error)?.message ?? error
    );
  }
  for (const skill of piSkills ?? []) {
    const file =
      (skill as { path?: string; filePath?: string }).path ??
      (skill as { path?: string; filePath?: string }).filePath;
    if (!file || path.basename(file) !== 'SKILL.md') continue;
    const root = path.dirname(path.dirname(path.resolve(file)));
    if (sources.some(source => path.resolve(source.root) === root)) continue;
    sources.push({
      id: `pi:runtime:${root}`,
      vendor: 'pi',
      scope: 'user',
      root,
      precedence: sources.length,
      defaultEnabled: true,
    });
  }
  const inventory = discoverAgentSkillInventory(sources, () => true);
  for (const entry of [...inventory.entries].sort(
    (left, right) => left.precedence - right.precedence
  )) {
    if (!entry.enabled || entry.parseStatus !== 'valid' || !entry.skill)
      continue;
    const key = skillKey(entry.skill.name);
    const existing = found.get(key);
    if (piConcrete.has(key)) continue;
    const source =
      entry.source === 'pi:bundled'
        ? 'bundled'
        : entry.scope === 'workspace'
          ? entry.vendor === 'agents'
            ? 'project'
            : `project:${entry.vendor}`
          : entry.vendor === 'pi'
            ? 'user'
            : `user:${entry.vendor}`;
    found.set(
      key,
      existing && piMetadata.has(key)
        ? { ...existing, path: entry.skill.path, dir: entry.skill.dir }
        : {
            name: entry.skill.name,
            description: entry.skill.description,
            path: entry.skill.path,
            dir: entry.skill.dir,
            source,
          }
    );
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function discoverSkillStates(
  cwd: string,
  piSkills?: SkillInfo[],
  home = os.homedir()
): DiscoveredSkillState[] {
  const skills = discoverAllSkills(cwd, piSkills, home);
  try {
    const db = openOctocodeDb();
    const scopeKey = path.resolve(cwd);
    return skills.map(skill => ({
      ...skill,
      enabled: getSkillEnablement(db, scopeKey, skill.name, true),
    }));
  } catch {
    return skills.map(skill => ({ ...skill, enabled: true }));
  }
}

export function discoverSkills(
  cwd: string,
  piSkills?: SkillInfo[],
  home = os.homedir()
): DiscoveredSkill[] {
  return discoverSkillStates(cwd, piSkills, home).filter(
    skill => skill.enabled
  );
}
