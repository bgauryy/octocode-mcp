/**
 * Skills Menu UI
 * Manages Octocode skills installation and configuration for Claude Code
 */

import { c, bold, dim } from '../../utils/colors.js';
import { loadInquirer, select, Separator, input } from '../../utils/prompts.js';
import {
  copyDirectory,
  dirExists,
  listSubdirectories,
  removeDirectory,
} from '../../utils/fs.js';
import { getSkillsSourceDir, getSkillsDestDir } from '../../utils/skills.js';
import path from 'node:path';
import { Spinner } from '../../utils/spinner.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Skill installation info
 */
export interface SkillInfo {
  name: string;
  installed: boolean;
  srcPath: string;
  destPath: string;
}

/**
 * Skills state
 */
export interface SkillsState {
  sourceExists: boolean;
  destDir: string;
  skills: SkillInfo[];
  installedCount: number;
  notInstalledCount: number;
  allInstalled: boolean;
  hasSkills: boolean;
}

type SkillsMenuChoice = 'install' | 'uninstall' | 'view' | 'back';
type InstallSkillsChoice = 'install' | 'back';
type UninstallSkillsChoice = 'uninstall' | 'back';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wait for user to press enter
 */
async function pressEnterToContinue(): Promise<void> {
  console.log();
  await input({
    message: dim('Press Enter to continue...'),
    default: '',
  });
}

// ============================================================================
// State Builders
// ============================================================================

/**
 * Get skills state
 */
export function getSkillsState(): SkillsState {
  const srcDir = getSkillsSourceDir();
  const destDir = getSkillsDestDir();

  if (!dirExists(srcDir)) {
    return {
      sourceExists: false,
      destDir,
      skills: [],
      installedCount: 0,
      notInstalledCount: 0,
      allInstalled: false,
      hasSkills: false,
    };
  }

  const availableSkills = listSubdirectories(srcDir).filter(
    name => !name.startsWith('.')
  );

  const skills: SkillInfo[] = availableSkills.map(skill => ({
    name: skill,
    installed: dirExists(path.join(destDir, skill)),
    srcPath: path.join(srcDir, skill),
    destPath: path.join(destDir, skill),
  }));

  const installedCount = skills.filter(s => s.installed).length;
  const notInstalledCount = skills.filter(s => !s.installed).length;

  return {
    sourceExists: true,
    destDir,
    skills,
    installedCount,
    notInstalledCount,
    allInstalled: notInstalledCount === 0 && skills.length > 0,
    hasSkills: skills.length > 0,
  };
}

/**
 * Get skills status info
 */
function getSkillsInfo(): {
  srcDir: string;
  destDir: string;
  skillsStatus: Array<{
    name: string;
    installed: boolean;
    srcPath: string;
    destPath: string;
  }>;
  notInstalled: Array<{
    name: string;
    installed: boolean;
    srcPath: string;
    destPath: string;
  }>;
  sourceExists: boolean;
} {
  const srcDir = getSkillsSourceDir();
  const destDir = getSkillsDestDir();

  if (!dirExists(srcDir)) {
    return {
      srcDir,
      destDir,
      skillsStatus: [],
      notInstalled: [],
      sourceExists: false,
    };
  }

  const availableSkills = listSubdirectories(srcDir).filter(
    name => !name.startsWith('.')
  );

  const skillsStatus = availableSkills.map(skill => ({
    name: skill,
    installed: dirExists(path.join(destDir, skill)),
    srcPath: path.join(srcDir, skill),
    destPath: path.join(destDir, skill),
  }));

  const notInstalled = skillsStatus.filter(s => !s.installed);

  return { srcDir, destDir, skillsStatus, notInstalled, sourceExists: true };
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Show skills submenu
 */
async function showSkillsMenu(
  hasUninstalled: boolean,
  hasInstalled: boolean
): Promise<SkillsMenuChoice> {
  const choices: Array<{
    name: string;
    value: SkillsMenuChoice;
    description?: string;
  }> = [];

  if (hasUninstalled) {
    choices.push({
      name: '📥 Install skills',
      value: 'install',
      description: 'Install Octocode skills to Claude Code',
    });
  }

  if (hasInstalled) {
    choices.push({
      name: '🗑️  Uninstall skills',
      value: 'uninstall',
      description: 'Remove installed Octocode skills',
    });
  }

  choices.push({
    name: '📋 View skills status',
    value: 'view',
    description: 'Show installed and available skills',
  });

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: SkillsMenuChoice;
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back to main menu')}`,
    value: 'back',
  });

  const choice = await select<SkillsMenuChoice>({
    message: 'Skills Options:',
    choices,
    pageSize: 10,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
        message: (text: string) => bold(text),
      },
    },
  });

  return choice;
}

/**
 * Show skills status
 */
function showSkillsStatus(info: ReturnType<typeof getSkillsInfo>): void {
  const { destDir, skillsStatus, notInstalled } = info;

  if (skillsStatus.length === 0) {
    console.log(`  ${dim('No skills available.')}`);
    console.log();
    return;
  }

  // Show skills and their status
  console.log(`  ${bold('Skills:')}`);
  console.log();
  for (const skill of skillsStatus) {
    if (skill.installed) {
      console.log(
        `    ${c('green', '✓')} ${skill.name} - ${c('green', 'installed')}`
      );
    } else {
      console.log(
        `    ${c('yellow', '○')} ${skill.name} - ${dim('not installed')}`
      );
    }
  }
  console.log();

  // Show installation path
  console.log(`  ${bold('Installation path:')}`);
  console.log(`  ${c('cyan', destDir)}`);
  console.log();

  // Summary
  if (notInstalled.length === 0) {
    console.log(`  ${c('green', '✓')} All skills are installed!`);
  } else {
    console.log(
      `  ${c('yellow', 'ℹ')} ${notInstalled.length} skill(s) not installed`
    );
  }
  console.log();
}

// ============================================================================
// Install/Uninstall Functions
// ============================================================================

/**
 * Install skills
 * Returns true if installation was performed, false if user went back
 */
async function installSkills(
  info: ReturnType<typeof getSkillsInfo>
): Promise<boolean> {
  const { destDir, notInstalled } = info;

  if (notInstalled.length === 0) {
    console.log(`  ${c('green', '✓')} All skills are already installed!`);
    console.log();
    console.log(`  ${bold('Installation path:')}`);
    console.log(`  ${c('cyan', destDir)}`);
    console.log();
    await pressEnterToContinue();
    return true;
  }

  // Show what will be installed
  console.log(`  ${bold('Skills to install:')}`);
  console.log();
  for (const skill of notInstalled) {
    console.log(`    ${c('yellow', '○')} ${skill.name}`);
  }
  console.log();
  console.log(`  ${bold('Installation path:')}`);
  console.log(`  ${c('cyan', destDir)}`);
  console.log();

  // Ask user if they want to install with back option
  const choice = await select<InstallSkillsChoice>({
    message: `Install ${notInstalled.length} skill(s)?`,
    choices: [
      {
        name: `${c('green', '✓')} Yes, install skills`,
        value: 'install' as const,
      },
      new Separator() as unknown as {
        name: string;
        value: InstallSkillsChoice;
      },
      {
        name: `${c('dim', '← Back to skills menu')}`,
        value: 'back' as const,
      },
    ],
    loop: false,
  });

  if (choice === 'back') {
    return false;
  }

  // Install skills
  console.log();
  const spinner = new Spinner('Installing skills...').start();
  let installedCount = 0;
  const failed: string[] = [];

  for (const skill of notInstalled) {
    if (copyDirectory(skill.srcPath, skill.destPath)) {
      installedCount++;
    } else {
      failed.push(skill.name);
    }
  }

  if (failed.length === 0) {
    spinner.succeed('Skills installed!');
  } else {
    spinner.warn('Some skills failed to install');
  }

  console.log();
  if (installedCount > 0) {
    console.log(`  ${c('green', '✓')} Installed ${installedCount} skill(s)`);
    console.log(`  ${dim('Location:')} ${c('cyan', destDir)}`);
  }
  if (failed.length > 0) {
    console.log(`  ${c('red', '✗')} Failed: ${failed.join(', ')}`);
  }
  console.log();

  if (installedCount > 0) {
    console.log(`  ${bold('Skills are now available in Claude Code!')}`);
    console.log();
  }

  await pressEnterToContinue();
  return true;
}

/**
 * Uninstall skills
 * Returns true if uninstallation was performed, false if user went back
 */
async function uninstallSkills(
  info: ReturnType<typeof getSkillsInfo>
): Promise<boolean> {
  const { destDir, skillsStatus } = info;
  const installed = skillsStatus.filter(s => s.installed);

  if (installed.length === 0) {
    console.log(`  ${c('yellow', '⚠')} No skills are installed.`);
    console.log();
    await pressEnterToContinue();
    return false;
  }

  // Show what will be uninstalled
  console.log(`  ${bold('Skills to uninstall:')}`);
  console.log();
  for (const skill of installed) {
    console.log(`    ${c('yellow', '○')} ${skill.name}`);
  }
  console.log();
  console.log(`  ${bold('Installation path:')}`);
  console.log(`  ${c('cyan', destDir)}`);
  console.log();

  // Ask user if they want to uninstall with back option
  const choice = await select<UninstallSkillsChoice>({
    message: `Uninstall ${installed.length} skill(s)?`,
    choices: [
      {
        name: `${c('red', '🗑️')} Yes, uninstall skills`,
        value: 'uninstall' as const,
      },
      new Separator() as unknown as {
        name: string;
        value: UninstallSkillsChoice;
      },
      {
        name: `${c('dim', '← Back to skills menu')}`,
        value: 'back' as const,
      },
    ],
    loop: false,
  });

  if (choice === 'back') {
    return false;
  }

  // Uninstall skills
  console.log();
  const spinner = new Spinner('Uninstalling skills...').start();
  let uninstalledCount = 0;
  const failed: string[] = [];

  for (const skill of installed) {
    if (removeDirectory(skill.destPath)) {
      uninstalledCount++;
    } else {
      failed.push(skill.name);
    }
  }

  if (failed.length === 0) {
    spinner.succeed('Skills uninstalled!');
  } else {
    spinner.warn('Some skills failed to uninstall');
  }

  console.log();
  if (uninstalledCount > 0) {
    console.log(
      `  ${c('green', '✓')} Uninstalled ${uninstalledCount} skill(s)`
    );
    console.log(`  ${dim('Location:')} ${c('cyan', destDir)}`);
  }
  if (failed.length > 0) {
    console.log(`  ${c('red', '✗')} Failed: ${failed.join(', ')}`);
  }
  console.log();

  await pressEnterToContinue();
  return true;
}

// ============================================================================
// Main Flow
// ============================================================================

/**
 * Run skills installation flow
 */
export async function runSkillsMenu(): Promise<void> {
  await loadInquirer();

  // Section header
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  📚 ${bold('Octocode Skills for Claude Code')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Get skills info
  let info = getSkillsInfo();

  // Handle source not found
  if (!info.sourceExists) {
    console.log(`  ${c('yellow', '⚠')} Skills source directory not found.`);
    console.log(`  ${dim('This may happen if running from source.')}`);
    console.log();
    await pressEnterToContinue();
    return;
  }

  // Handle no skills available
  if (info.skillsStatus.length === 0) {
    console.log(`  ${dim('No skills available.')}`);
    console.log();
    await pressEnterToContinue();
    return;
  }

  // Skills menu loop - allows going back from install
  let inSkillsMenu = true;
  while (inSkillsMenu) {
    // Refresh skills info on each iteration
    info = getSkillsInfo();

    // Show submenu
    const hasUninstalled = info.notInstalled.length > 0;
    const hasInstalled = info.skillsStatus.filter(s => s.installed).length > 0;
    const choice = await showSkillsMenu(hasUninstalled, hasInstalled);

    switch (choice) {
      case 'install': {
        const installed = await installSkills(info);
        // If user went back, stay in skills menu
        // If installed, also stay in skills menu to show updated status
        if (installed) {
          // Refresh and continue showing menu
          continue;
        }
        break;
      }

      case 'uninstall': {
        const uninstalled = await uninstallSkills(info);
        // If user went back, stay in skills menu
        // If uninstalled, also stay in skills menu to show updated status
        if (uninstalled) {
          // Refresh and continue showing menu
          continue;
        }
        break;
      }

      case 'view':
        showSkillsStatus(info);
        await pressEnterToContinue();
        break;

      case 'back':
      default:
        // Exit skills menu and return to main menu
        inSkillsMenu = false;
        break;
    }
  }
}
