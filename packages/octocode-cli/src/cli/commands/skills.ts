import type { CLICommand, ParsedArgs } from '../types.js';
import { c, bold, dim } from '../../utils/colors.js';
import {
  copyDirectory,
  dirExists,
  listSubdirectories,
} from '../../utils/fs.js';
import { getSkillsSourceDir, getSkillsDestDir } from '../../utils/skills.js';
import { loadInquirer, select, checkbox } from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import { existsSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { HOME, isWindows, getAppDataPath } from '../../utils/platform.js';
import { removeDirectory } from '../../utils/fs.js';
import path from 'node:path';
import {
  type SkillInstallMode,
  type SkillInstallStrategy,
  type SkillInstallTarget,
  normalizeSkillTarget,
} from './shared.js';

function getSkillsDirForTarget(
  target: SkillInstallTarget,
  defaultDestDir: string
): string {
  if (target === 'claude-code') {
    return defaultDestDir;
  }
  if (isWindows) {
    const appData = getAppDataPath();
    switch (target) {
      case 'claude-desktop':
        return path.join(appData, 'Claude Desktop', 'skills');
      case 'cursor':
        return path.join(HOME, '.cursor', 'skills');
      case 'codex':
        return path.join(HOME, '.codex', 'skills');
      case 'opencode':
        return path.join(HOME, '.opencode', 'skills');
      default:
        return defaultDestDir;
    }
  }
  switch (target) {
    case 'claude-desktop':
      return path.join(HOME, '.claude-desktop', 'skills');
    case 'cursor':
      return path.join(HOME, '.cursor', 'skills');
    case 'codex':
      return path.join(HOME, '.codex', 'skills');
    case 'opencode':
      return path.join(HOME, '.opencode', 'skills');
    default:
      return defaultDestDir;
  }
}

function installSkillToDestination(
  sourcePath: string,
  destinationPath: string,
  mode: SkillInstallMode,
  force: boolean
): 'installed' | 'skipped' | 'failed' {
  try {
    if (existsSync(destinationPath)) {
      if (!force) {
        return 'skipped';
      }
      rmSync(destinationPath, { recursive: true, force: true });
    }
    if (mode === 'symlink') {
      const symlinkType: 'dir' | 'junction' = isWindows ? 'junction' : 'dir';
      symlinkSync(sourcePath, destinationPath, symlinkType);
      return 'installed';
    }
    if (copyDirectory(sourcePath, destinationPath)) {
      return 'installed';
    }
    return 'failed';
  } catch {
    return 'failed';
  }
}

function isClaudeTarget(target: SkillInstallTarget): boolean {
  return target === 'claude-code' || target === 'claude-desktop';
}

function resolveModeForTarget(
  strategy: SkillInstallStrategy,
  target: SkillInstallTarget
): SkillInstallMode {
  if (strategy === 'hybrid') {
    return isClaudeTarget(target) ? 'copy' : 'symlink';
  }
  return strategy;
}

async function promptInstallTargets(): Promise<SkillInstallTarget[]> {
  await loadInquirer();
  const targetPreset = await select<
    'claude-only' | 'all' | 'custom' | 'cancel'
  >({
    message: 'Install skills to which platforms?',
    choices: [
      {
        name: '- Claude locations (claude-code + claude-desktop)',
        value: 'claude-only',
      },
      { name: '- All supported platforms', value: 'all' },
      { name: '- Custom selection', value: 'custom' },
      { name: `${dim('- Cancel')}`, value: 'cancel' },
    ],
    loop: false,
  });
  if (targetPreset === 'cancel') return [];
  if (targetPreset === 'claude-only') return ['claude-code', 'claude-desktop'];
  if (targetPreset === 'all')
    return ['claude-code', 'claude-desktop', 'cursor', 'codex', 'opencode'];
  return await checkbox<SkillInstallTarget>({
    message: 'Select target platforms',
    choices: [
      { name: '- claude-code', value: 'claude-code', checked: true },
      { name: '- claude-desktop', value: 'claude-desktop', checked: true },
      { name: '- cursor', value: 'cursor' },
      { name: '- codex', value: 'codex' },
      { name: '- opencode', value: 'opencode' },
    ],
    required: true,
    loop: false,
  });
}

async function promptInstallStrategy(): Promise<SkillInstallStrategy | null> {
  await loadInquirer();
  const selected = await select<SkillInstallStrategy | 'cancel'>({
    message: 'How should skills be installed?',
    choices: [
      {
        name: '- Hybrid (copy for Claude targets, symlink for others)',
        value: 'hybrid',
      },
      { name: '- Full copies everywhere', value: 'copy' },
      { name: '- Symlinks everywhere', value: 'symlink' },
      { name: `${dim('- Cancel')}`, value: 'cancel' },
    ],
    loop: false,
  });
  return selected === 'cancel' ? null : selected;
}

export const skillsCommand: CLICommand = {
  name: 'skills',
  aliases: ['sk'],
  description: 'Install Octocode skills across AI clients',
  usage:
    'octocode skills [install|remove|list] [--skill <name>] [--targets <list>] [--mode <copy|symlink>]',
  options: [
    { name: 'force', short: 'f', description: 'Overwrite existing skills' },
    {
      name: 'skill',
      short: 'k',
      description: 'Skill folder name (used by install/remove)',
      hasValue: true,
    },
    {
      name: 'targets',
      short: 't',
      description:
        'Comma-separated targets: claude-code, claude-desktop, cursor, codex, opencode',
      hasValue: true,
    },
    {
      name: 'mode',
      short: 'm',
      description: 'Install mode: copy (default) or symlink',
      hasValue: true,
      default: 'copy',
    },
  ],
  handler: async (args: ParsedArgs) => {
    const subcommand = args.args[0] || 'list';
    const force = Boolean(args.options['force'] || args.options['f']);
    const rawSkill = args.options['skill'] ?? args.options['k'];
    const specificSkill =
      typeof rawSkill === 'string' && rawSkill.length > 0
        ? rawSkill
        : undefined;
    const rawTargets =
      subcommand === 'remove'
        ? undefined
        : (args.options['targets'] ?? args.options['t']);
    const rawMode =
      subcommand === 'remove'
        ? undefined
        : (args.options['mode'] ?? args.options['m']);

    let installMode: SkillInstallMode = 'copy';
    if (typeof rawMode === 'string' && rawMode.trim().length > 0) {
      const normalizedMode = rawMode.trim().toLowerCase();
      if (normalizedMode !== 'copy' && normalizedMode !== 'symlink') {
        console.log();
        console.log(
          `  ${c('red', 'X')} Invalid --mode value: ${c('yellow', rawMode)}`
        );
        console.log(`  ${dim('Allowed values:')} copy, symlink`);
        console.log(
          `  ${dim('Example:')} octocode skills install --mode symlink`
        );
        console.log();
        process.exitCode = 1;
        return;
      }
      installMode = normalizedMode;
    }
    const hasExplicitTargets =
      typeof rawTargets === 'string' && rawTargets.trim().length > 0;
    const hasExplicitMode = typeof rawMode === 'string' && rawMode.length > 0;

    const srcDir = getSkillsSourceDir();
    const destDir = getSkillsDestDir();

    let selectedTargets: SkillInstallTarget[] = ['claude-code'];
    if (typeof rawTargets === 'string' && rawTargets.trim().length > 0) {
      const parsed = rawTargets
        .split(',')
        .map(s => normalizeSkillTarget(s))
        .filter((s): s is SkillInstallTarget => s !== null);
      selectedTargets = [...new Set(parsed)];
      if (selectedTargets.length === 0) {
        console.log();
        console.log(`  ${c('red', 'X')} No valid targets provided`);
        console.log(
          `  ${dim('Valid targets:')} claude-code, claude-desktop, cursor, codex, opencode`
        );
        console.log();
        process.exitCode = 1;
        return;
      }
    }
    let installStrategy: SkillInstallStrategy = installMode;

    if (
      subcommand === 'install' &&
      process.stdout.isTTY &&
      (!hasExplicitTargets || !hasExplicitMode)
    ) {
      const promptedTargets = await promptInstallTargets();
      if (promptedTargets.length === 0) {
        console.log();
        console.log(`  ${c('yellow', 'WARN')} Skills install cancelled`);
        console.log();
        return;
      }
      selectedTargets = promptedTargets;
      const promptedStrategy = await promptInstallStrategy();
      if (!promptedStrategy) {
        console.log();
        console.log(`  ${c('yellow', 'WARN')} Skills install cancelled`);
        console.log();
        return;
      }
      installStrategy = promptedStrategy;
    }

    const targetDestinations = selectedTargets.map(target => ({
      target,
      destDir: getSkillsDirForTarget(target, destDir),
    }));

    if (!dirExists(srcDir)) {
      console.log();
      console.log(`  ${c('red', '✗')} Skills directory not found`);
      console.log(`  ${dim('Expected:')} ${srcDir}`);
      console.log();
      process.exitCode = 1;
      return;
    }

    const availableSkills = listSubdirectories(srcDir).filter(
      name => !name.startsWith('.')
    );

    if (subcommand === 'list') {
      console.log();
      console.log(`  ${bold('Available Octocode Skills')}`);
      console.log();
      console.log(`  ${bold('Install destinations:')}`);
      for (const destination of targetDestinations) {
        console.log(
          `    ${c('cyan', '•')} ${destination.target}: ${destination.destDir}`
        );
      }
      console.log();
      if (availableSkills.length === 0) {
        console.log(`  ${dim('No skills available.')}`);
      } else {
        for (const skill of availableSkills) {
          const installed = targetDestinations.every(destination =>
            dirExists(path.join(destination.destDir, skill))
          );
          const status = installed
            ? c('green', 'installed')
            : dim('not installed');
          console.log(`  ${c('cyan', '•')} ${skill} ${status}`);
        }
      }
      console.log();
      console.log(`  ${dim('To install all:')} octocode skills install`);
      console.log(
        `  ${dim('To install one:')} octocode skills install --skill <name> ${dim('(or -k <name>)')}`
      );
      console.log(
        `  ${dim('Multi-install:')} octocode skills install --targets claude-code,cursor,codex --mode symlink`
      );
      console.log();
      return;
    }

    if (subcommand === 'install') {
      if (specificSkill) {
        console.log();
        console.log(`  ${bold(`Installing skill: ${specificSkill}`)}`);
        console.log();
        if (!availableSkills.includes(specificSkill)) {
          console.log(`  ${c('red', '✗')} Skill not found: ${specificSkill}`);
          console.log();
          console.log(`  ${dim('Available skills:')}`);
          for (const s of availableSkills) {
            console.log(`    ${c('cyan', '•')} ${s}`);
          }
          console.log();
          process.exitCode = 1;
          return;
        }
        const spinner = new Spinner(`Installing ${specificSkill}...`).start();
        const sourcePath = path.join(srcDir, specificSkill);
        let installed = 0;
        let skipped = 0;
        let failed = 0;
        for (const destination of targetDestinations) {
          if (!dirExists(destination.destDir)) {
            mkdirSync(destination.destDir, { recursive: true, mode: 0o700 });
          }
          const result = installSkillToDestination(
            sourcePath,
            path.join(destination.destDir, specificSkill),
            resolveModeForTarget(installStrategy, destination.target),
            force
          );
          if (result === 'installed') installed++;
          else if (result === 'skipped') skipped++;
          else failed++;
        }
        if (failed === 0) {
          spinner.succeed(`Installed ${specificSkill}!`);
          console.log();
          console.log(
            `  ${c('green', '✅')} Installed to ${installed}/${targetDestinations.length} targets`
          );
          for (const destination of targetDestinations) {
            console.log(
              `    ${c('cyan', '•')} ${destination.target}: ${path.join(destination.destDir, specificSkill)}`
            );
          }
          if (skipped > 0) {
            console.log(
              `  ${c('yellow', 'WARN')} Skipped ${skipped} existing target(s) ${dim('(use --force to overwrite)')}`
            );
          }
        } else {
          spinner.fail(`Failed to install ${specificSkill}`);
          process.exitCode = 1;
        }
        console.log();
        return;
      }

      console.log();
      console.log(`  ${bold('Installing Octocode Skills')}`);
      console.log();
      if (availableSkills.length === 0) {
        console.log(`  ${c('yellow', '⚠')} No skills to install.`);
        console.log();
        return;
      }
      const spinner = new Spinner('Installing skills...').start();
      let installed = 0;
      let skipped = 0;
      let failed = 0;
      for (const skill of availableSkills) {
        const skillSrc = path.join(srcDir, skill);
        for (const destination of targetDestinations) {
          if (!dirExists(destination.destDir)) {
            mkdirSync(destination.destDir, { recursive: true, mode: 0o700 });
          }
          const result = installSkillToDestination(
            skillSrc,
            path.join(destination.destDir, skill),
            resolveModeForTarget(installStrategy, destination.target),
            force
          );
          if (result === 'installed') installed++;
          else if (result === 'skipped') skipped++;
          else failed++;
        }
      }
      if (failed === 0) {
        spinner.succeed('Skills installation complete!');
      } else {
        spinner.fail('Skills installation completed with errors');
      }
      console.log();
      if (installed > 0) {
        console.log(
          `  ${c('green', '✅')} Installed ${installed} skill target(s)`
        );
      }
      if (skipped > 0) {
        console.log(
          `  ${c('yellow', 'WARN')} Skipped ${skipped} existing skill target(s)`
        );
        console.log(
          `  ${dim('Use')} ${c('cyan', '--force')} ${dim('to overwrite.')}`
        );
      }
      if (failed > 0) {
        console.log(`  ${c('red', 'X')} Failed ${failed} skill target(s)`);
        process.exitCode = 1;
      }
      console.log();
      console.log(`  ${bold('Targets:')}`);
      for (const destination of targetDestinations) {
        console.log(
          `    ${c('cyan', '•')} ${destination.target}: ${destination.destDir}`
        );
      }
      console.log();
      console.log(`  ${bold('Skills installation finished.')}`);
      console.log();
      return;
    }

    if (subcommand === 'remove') {
      if (!specificSkill) {
        console.log();
        console.log(
          `  ${c('red', 'X')} Missing required option: ${c('cyan', '--skill <name>')}`
        );
        console.log();
        console.log(`  ${dim('Usage:')} octocode skills remove --skill <name>`);
        console.log();
        process.exitCode = 1;
        return;
      }
      console.log();
      console.log(`  ${bold(`Removing skill: ${specificSkill}`)}`);
      console.log();
      let removed = 0;
      let missing = 0;
      for (const destination of targetDestinations) {
        const skillPath = path.join(destination.destDir, specificSkill);
        if (!dirExists(skillPath)) {
          missing++;
          continue;
        }
        if (removeDirectory(skillPath)) {
          removed++;
        } else {
          console.log(
            `  ${c('red', 'X')} Failed to remove from ${destination.target}: ${skillPath}`
          );
          process.exitCode = 1;
        }
      }
      if (removed > 0) {
        console.log(
          `  ${c('green', '✅')} Removed from ${removed}/${targetDestinations.length} targets`
        );
      }
      if (missing > 0) {
        console.log(
          `  ${c('yellow', 'WARN')} Not found in ${missing} target(s) ${dim('(already absent)')}`
        );
      }
      console.log();
      return;
    }

    console.log();
    console.log(`  ${c('red', '✗')} Unknown subcommand: ${subcommand}`);
    console.log(
      `  ${dim('Usage:')} octocode skills [install|remove|list] [--skill <name>]`
    );
    console.log();
    process.exitCode = 1;
  },
};
