import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSkillsFromDir, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { envFlag, EXTRA_SKILLS_ENV, SUBAGENT_ENV } from './shared/env.js';
import { globalPaths, projectSkillDirs } from './shared/home.js';
import { projectTrust } from './shared/trust.js';

/**
 * Pi already loads skills from ~/.agents/skills, ~/.pi/agent/skills and the
 * project's .agents/skills and .pi/skills. Octocode adds the directories other
 * agents use (Claude Code, Codex, Octocode's home) so one skill install works everywhere.
 * Install Octocode skills with `npx octocode skill install <name>`. Pi loads them and reports any name conflict itself.
 */
export function extraSkillDirs(cwd: string, home = os.homedir(), projectTrusted = true, env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    path.join(home, '.claude', 'skills'),
    path.join(home, '.codex', 'skills'),
    globalPaths(env, home).skills,
    // Like Pi's own project skills, project directories (`.claude/skills` up to the root, `<root>/.octocode/skills`) load only for trusted projects.
    ...(projectTrusted ? projectSkillDirs(cwd) : []),
  ]
    .filter(isDirectory)
    .flatMap((dir) => (path.basename(path.dirname(dir)) === '.claude' ? withoutSynced(dir) : [dir]));
}

function isDirectory(file: string): boolean {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

/** Claude.ai's synced skills: they need claude.ai connectors Pi does not have, and their broad triggers win over local skills. */
const SYNCED_SKILLS_DIR = 'synced';

/**
 * A Claude `skills` folder without its `synced/` subtree. Pi walks a skill directory recursively and has no exclude
 * option, so discover from the original root with Pi's loader and pass explicit skill files outside `synced/`.
 * This preserves root-only loose Markdown and inherited ignore rules. A folder without `synced/`, or one that is a skill
 * itself (has SKILL.md), is returned as is.
 */
function withoutSynced(dir: string): string[] {
  if (!isDirectory(path.join(dir, SYNCED_SKILLS_DIR)) || fs.existsSync(path.join(dir, 'SKILL.md'))) return [dir];
  const synced = path.join(dir, SYNCED_SKILLS_DIR) + path.sep;
  return loadSkillsFromDir({ dir, source: 'path' }).skills.map((skill) => skill.filePath).filter((file) => !file.startsWith(synced));
}

/**
 * Extra skill directories are listed in every prompt, so they load only in the root session: a subagent
 * (`OCTOCODE_SUBAGENT=1`) gets just the skills Pi itself discovers. `OCTOCODE_EXTRA_SKILLS=0` turns them off everywhere.
 */
export function extraSkillsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !envFlag(env, SUBAGENT_ENV) && envFlag(env, EXTRA_SKILLS_ENV, true);
}

export function registerSkills(pi: ExtensionAPI): void {
  pi.on('resources_discover', async (event, ctx) => {
    if (!extraSkillsEnabled()) return { skillPaths: [] };
    const trusted = await projectTrust({ cwd: event.cwd, hasUI: ctx.hasUI, ui: ctx.ui, isProjectTrusted: () => ctx.isProjectTrusted() });
    return { skillPaths: extraSkillDirs(event.cwd, undefined, trusted) };
  });
}
