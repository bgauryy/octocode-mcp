/** `octocode skill install [<name>...] [options]` */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SKILL_PLATFORMS,
  installBundledSkills,
  parseSkillPlatforms,
  type InstallBundledSkillsResult,
  type SkillInstallMode,
  type SkillInstallTarget,
} from '@octocodeai/octocode-skill-installer';
import {
  listSkills,
  getSkill,
  getSkillFromPath,
  type SkillInfo,
} from '../registry.js';
import { getSkillsEnvStatus } from '../env-params.js';
import { bold, dim, c } from '../../../../utils/colors.js';
import { reportFailure } from './fail.js';
import { shortPath } from '../utils/paths.js';
import { EXIT } from '../../../exit-codes.js';

export interface InstallOptions {
  all: boolean;
  /** Local standalone skill source used by `skill install --add <source>`. */
  sourcePath: string | null;
  platform: string | null;
  global: boolean;
  projectDir: string | null;
  customPath: string | null;
  mode: SkillInstallMode;
  /** Replace existing canonical copies or destinations that differ. */
  force: boolean;
  /** Refresh changed bundled content without replacing arbitrary destination drift. */
  upgrade: boolean;
  dryRun: boolean;
  json: boolean;
}

/** Edit distance, for naming the closest bundled skill to a mistyped one. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous = current;
    }
  }
  return row[b.length]!;
}

/** The bundled skill a mistyped name most likely meant, if any is close. */
function closestSkill(
  name: string,
  known: readonly string[]
): string | undefined {
  const wanted = name.toLowerCase().replace(/^octocode-/, '');
  let best: { name: string; score: number } | undefined;
  for (const candidate of known) {
    const bare = candidate.replace(/^octocode-/, '');
    const score =
      bare.includes(wanted) || wanted.includes(bare)
        ? 0
        : distance(wanted, bare);
    if (!best || score < best.score) best = { name: candidate, score };
  }
  return best && best.score <= Math.max(2, Math.floor(wanted.length / 3))
    ? best.name
    : undefined;
}

/** Shown when skills land only in Octocode home, where no agent reads them. */
const UNLINKED_HINT = `Installed to Octocode home only; no agent reads it there. Link it with --platform <${SKILL_PLATFORMS.map(entry => entry.platform).join('|')}> --global (or --project-dir <dir>).`;

const fail = (message: string, json: boolean): void =>
  reportFailure(message, json, {
    human: `\n  ${c('red', '✗')}  ${message}\n`,
  });

function resolveSkills(
  skillNames: string[],
  opts: InstallOptions
): SkillInfo[] | null {
  if (opts.sourcePath) {
    if (opts.all || skillNames.length > 1) {
      fail(
        opts.all
          ? '--add cannot be combined with --all.'
          : '--add accepts at most one name override.',
        opts.json
      );
      return null;
    }
    const resolved = getSkillFromPath(opts.sourcePath, skillNames[0]);
    if (!resolved.skill) {
      fail(resolved.error ?? 'Unable to load local skill.', opts.json);
      return null;
    }
    return [resolved.skill];
  }

  if (opts.all) {
    const skills = listSkills();
    if (skills.length === 0) {
      fail('No bundled skills found.', opts.json);
      return null;
    }
    return skills;
  }

  if (skillNames.length === 0) {
    fail('Specify a skill name or use --all.', opts.json);
    return null;
  }

  const skills: SkillInfo[] = [];
  const missing: string[] = [];
  for (const name of skillNames) {
    const skill = getSkill(name);
    if (skill) skills.push(skill);
    else missing.push(name);
  }
  if (missing.length > 0) {
    const known = listSkills().map(skill => skill.folder);
    const suggestions = missing
      .map(name => closestSkill(name, known))
      .filter((name): name is string => name !== undefined);
    const hint =
      suggestions.length > 0
        ? ` Did you mean ${[...new Set(suggestions)].map(name => `"${name}"`).join(', ')}?`
        : '';
    fail(
      `Skill(s) not found: ${missing.map(name => `"${name}"`).join(', ')}.${hint} List them: octocode skill list.`,
      opts.json
    );
    return null;
  }
  return skills;
}

function resolveTargets(opts: InstallOptions): SkillInstallTarget[] | null {
  if (!opts.platform) {
    if (opts.global || opts.projectDir) {
      fail('--global and --project-dir require --platform.', opts.json);
      return null;
    }
    return [];
  }
  if (opts.global === Boolean(opts.projectDir)) {
    fail(
      'Choose exactly one scope for --platform: --global or --project-dir <dir>.',
      opts.json
    );
    return null;
  }

  const parsed = parseSkillPlatforms(opts.platform);
  if (parsed.error) {
    fail(parsed.error, opts.json);
    return null;
  }

  if (opts.projectDir) {
    const projectDir = resolve(opts.projectDir);
    if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
      fail(`Project directory does not exist: ${projectDir}`, opts.json);
      return null;
    }
    return parsed.platforms.map(platform => ({
      platform,
      scope: 'project',
      projectDir,
    }));
  }
  return parsed.platforms.map(platform => ({ platform, scope: 'global' }));
}

function statusIcon(status: string): string {
  if (
    status === 'installed' ||
    status === 'upgraded' ||
    status === 'linked' ||
    status === 'copied'
  )
    return c('green', '✓');
  if (status === 'unchanged') return c('yellow', '~');
  return c('red', '✗');
}

function renderHuman(
  result: InstallBundledSkillsResult,
  skills: SkillInfo[],
  unlinked: boolean
): void {
  console.log();
  console.log(
    `  ${bold(result.dryRun ? 'Skill install preview' : 'Skill installation')}`
  );
  console.log(`  ${dim(`canonical: ${shortPath(result.canonicalSkillsDir)}`)}`);
  console.log();

  for (const skill of result.skills) {
    console.log(`  ${statusIcon(skill.canonicalStatus)}  ${bold(skill.name)}`);
    const canonicalNote = skill.canonicalError
      ? c('red', `  ${skill.canonicalError}`)
      : skill.canonicalStatus === 'conflict'
        ? dim('  (differs; use --upgrade to refresh or --force to replace)')
        : '';
    console.log(
      `     ${statusIcon(skill.canonicalStatus)}  ${'canonical'.padEnd(18)} ${dim(shortPath(skill.canonical))}${canonicalNote}`
    );
    for (const destination of skill.destinations) {
      const label = `${destination.platform}:${destination.scope}`;
      const note = destination.error
        ? c('red', `  ${destination.error}`)
        : destination.status === 'conflict'
          ? dim('  (differs; use --force to replace)')
          : destination.mode === 'symlink'
            ? dim(`  → ${shortPath(destination.linkTarget ?? skill.canonical)}`)
            : dim('  (copy)');
      console.log(
        `     ${statusIcon(destination.status)}  ${label.padEnd(18)} ${dim(shortPath(destination.destination || '—'))}${note}`
      );
    }
    console.log();
  }

  const summary = result.summary;
  console.log(`  ${dim('─'.repeat(60))}`);
  console.log(
    `  ${summary.installed} materialized · ${summary.upgraded} upgraded · ${summary.linked} linked · ${summary.copied} copied · ${summary.unchanged} unchanged · ${summary.conflicts} conflicts · ${summary.failed} failed`
  );
  console.log();

  if (!result.ok) {
    console.log(
      `  ${c('red', 'Installation did not complete cleanly.')} Resolve drift, use --upgrade for bundled content, or rerun with --force.`
    );
    console.log();
    return;
  }
  if (unlinked) {
    console.log(`  ${c('yellow', '⚠')} ${UNLINKED_HINT}`);
    console.log();
  }
  if (!result.dryRun) {
    console.log(`  ${dim('Verify:')} ${c('cyan', 'octocode skill check')}`);
    const envStatus = getSkillsEnvStatus(skills.map(skill => skill.folder));
    const names = (readiness: string) =>
      envStatus
        .filter(status => status.readiness === readiness)
        .map(status => status.skillName);
    const needsConfig = names('needs-config');
    const partial = names('partial');
    if (needsConfig.length > 0) {
      console.log(
        `  ${c('yellow', '⚠')} ${needsConfig.join(', ')} need environment configuration.`
      );
    }
    if (partial.length > 0) {
      console.log(
        `  ${dim(`ℹ ${partial.join(', ')} ${partial.length === 1 ? 'works' : 'work'} now; optional env settings unlock more.`)}`
      );
    }
    if (needsConfig.length > 0 || partial.length > 0) {
      console.log(
        `  ${dim('Configure ~/.octocode/.env, then run octocode skill check.')}`
      );
    }
    console.log();
  }
}

export function runInstall(skillNames: string[], opts: InstallOptions): void {
  if (opts.customPath && opts.platform) {
    fail('--path cannot be combined with --platform.', opts.json);
    return;
  }
  const skills = resolveSkills(skillNames, opts);
  if (!skills) return;
  const targets = resolveTargets(opts);
  if (!targets) return;

  const result = installBundledSkills({
    skills: skills.map(skill => ({
      name: skill.folder,
      sourcePath: skill.dir,
    })),
    targets,
    canonicalSkillsDir: opts.customPath || undefined,
    mode: opts.mode,
    force: opts.force,
    upgrade: opts.upgrade,
    dryRun: opts.dryRun,
  });

  // A canonical-only install (no --platform, no --path) reaches no agent.
  const unlinked = targets.length === 0 && !opts.customPath;
  if (opts.json)
    console.log(
      JSON.stringify(
        unlinked ? { ...result, warnings: [UNLINKED_HINT] } : result,
        null,
        2
      )
    );
  else renderHuman(result, skills, unlinked);
  if (!result.ok) process.exitCode = EXIT.GENERAL;
}
