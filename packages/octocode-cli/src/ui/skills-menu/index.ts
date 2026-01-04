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
  fileExists,
  readFileContent,
} from '../../utils/fs.js';
import {
  getSkillsSourceDir,
  getSkillsDestDir,
  getAllSkillsMetadata,
  type SkillMetadata,
} from '../../utils/skills.js';
import path from 'node:path';
import { Spinner } from '../../utils/spinner.js';
import { runMarketplaceFlow } from './marketplace.js';

// ============================================================================
// Installed Skill Types (agentskills.io protocol)
// ============================================================================

/**
 * Installed skill info - parsed from SKILL.md following agentskills.io protocol
 */
export interface InstalledSkill {
  /** Skill name from frontmatter */
  name: string;
  /** Description from frontmatter */
  description: string;
  /** Folder name on disk */
  folder: string;
  /** Full path to skill directory */
  path: string;
  /** Whether this is an Octocode bundled skill */
  isBundled: boolean;
}

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

type SkillsMenuChoice =
  | 'install'
  | 'manage'
  | 'view'
  | 'view-all'
  | 'marketplace'
  | 'back';
type InstallSkillsChoice = 'install' | 'select' | 'back';
type ManageSkillsChoice = InstalledSkill | 'back';

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

/**
 * Parse YAML frontmatter from SKILL.md content (agentskills.io protocol)
 */
function parseSkillMdFrontmatter(
  content: string
): { name: string; description: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!nameMatch || !descMatch) return null;

  return {
    name: nameMatch[1].trim(),
    description: descMatch[1].trim(),
  };
}

/**
 * Get all installed skills from the destination directory
 * Includes both bundled Octocode skills and marketplace/manually installed skills
 */
function getAllInstalledSkills(): InstalledSkill[] {
  const destDir = getSkillsDestDir();
  const srcDir = getSkillsSourceDir();

  if (!dirExists(destDir)) {
    return [];
  }

  const skillFolders = listSubdirectories(destDir).filter(
    name => !name.startsWith('.')
  );

  const skills: InstalledSkill[] = [];

  for (const folder of skillFolders) {
    const skillPath = path.join(destDir, folder);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    // Check if it's a bundled Octocode skill
    const isBundled =
      folder.startsWith('octocode-') &&
      dirExists(srcDir) &&
      dirExists(path.join(srcDir, folder));

    if (fileExists(skillMdPath)) {
      const content = readFileContent(skillMdPath);
      if (content) {
        const parsed = parseSkillMdFrontmatter(content);
        if (parsed) {
          skills.push({
            name: parsed.name,
            description: parsed.description,
            folder,
            path: skillPath,
            isBundled,
          });
          continue;
        }
      }
    }

    // Fallback for skills without valid SKILL.md
    skills.push({
      name: formatSkillName(folder),
      description: 'No description available',
      folder,
      path: skillPath,
      isBundled,
    });
  }

  return skills;
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
  installedCount: number
): Promise<SkillsMenuChoice> {
  const choices: Array<{
    name: string;
    value: SkillsMenuChoice;
    description?: string;
  }> = [];

  // Manage installed skills - shown if any skills are installed
  if (installedCount > 0) {
    choices.push({
      name: `📦 Manage installed skills ${dim(`(${installedCount})`)}`,
      value: 'manage',
      description: 'View, remove, or inspect individual skills',
    });
  }

  // Browse marketplace - always available
  choices.push({
    name: '🌐 Browse Marketplace',
    value: 'marketplace',
    description: 'Discover skills from community',
  });

  if (hasUninstalled) {
    choices.push({
      name: '📥 Install bundled skills',
      value: 'install',
      description: 'Install Octocode skills to Claude Code',
    });
  }

  // View all available skills
  choices.push({
    name: '🧠 View all bundled skills',
    value: 'view-all',
    description: 'Show all available Octocode skills',
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

/**
 * Format skill name for display (remove octocode- prefix, capitalize)
 */
function formatSkillName(name: string): string {
  return name
    .replace(/^octocode-/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Wrap text at specified width
 */
function wrapText(text: string, maxWidth: number, indent: string): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n' + indent);
}

/**
 * Show all available skills with their descriptions
 */
function showAllSkills(
  skills: SkillMetadata[],
  info: ReturnType<typeof getSkillsInfo>
): void {
  if (skills.length === 0) {
    console.log(`  ${dim('No skills available.')}`);
    console.log();
    return;
  }

  console.log(`  ${bold('Available Octocode Skills')}`);
  console.log();

  for (const skill of skills) {
    // Check if installed
    const isInstalled = info.skillsStatus.some(
      s => s.name === skill.folder && s.installed
    );
    const statusIcon = isInstalled ? c('green', '✓') : c('yellow', '○');
    const statusText = isInstalled
      ? c('green', 'installed')
      : dim('not installed');

    // Display skill name
    const displayName = formatSkillName(skill.name);
    console.log(
      `  ${statusIcon} ${bold(c('cyan', displayName))} ${statusText}`
    );

    // Display description (wrapped for readability)
    const wrappedDesc = wrapText(skill.description, 60, '      ');
    console.log(`      ${dim(wrappedDesc)}`);
    console.log();
  }

  // Show summary
  const installedCount = info.skillsStatus.filter(s => s.installed).length;
  console.log(
    `  ${dim('Total:')} ${skills.length} skills, ${installedCount} installed`
  );
  console.log();

  // Show how to use
  console.log(`  ${bold('How to use:')}`);
  console.log(
    `  ${dim('Skills are prompts for Claude Code. Install them, then use')}`
  );
  console.log(`  ${dim('the /command in Claude Code to trigger the skill.')}`);
  console.log();
}

// ============================================================================
// Install/Uninstall Functions
// ============================================================================

/**
 * Show manage installed skills menu
 */
async function selectInstalledSkill(
  skills: InstalledSkill[]
): Promise<ManageSkillsChoice> {
  console.log();
  console.log(
    `  ${bold('Installed Skills')} ${dim(`(${skills.length} total)`)}`
  );
  console.log(`  ${dim('Select a skill to manage')}`);
  console.log();

  const choices: Array<{
    name: string;
    value: ManageSkillsChoice;
  }> = [];

  for (const skill of skills) {
    const sourceTag = skill.isBundled
      ? c('cyan', ' [bundled]')
      : c('magenta', ' [community]');
    const desc = skill.description.slice(0, 40);
    const ellipsis = skill.description.length > 40 ? '...' : '';

    choices.push({
      name: `${skill.name}${sourceTag} - ${dim(desc)}${dim(ellipsis)}`,
      value: skill,
    });
  }

  choices.push(
    new Separator() as unknown as { name: string; value: ManageSkillsChoice }
  );
  choices.push({
    name: `${c('dim', '← Back to skills menu')}`,
    value: 'back',
  });

  const choice = await select<ManageSkillsChoice>({
    message: 'Select skill:',
    choices,
    pageSize: 15,
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

type SkillActionChoice = 'remove' | 'view' | 'back';

/**
 * Show skill details and action menu
 */
async function showSkillActions(
  skill: InstalledSkill
): Promise<SkillActionChoice> {
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  ${bold(skill.name)}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Skill info
  console.log(`  ${bold('Description:')}`);
  console.log(`  ${skill.description}`);
  console.log();

  console.log(`  ${bold('Location:')}`);
  console.log(`  ${c('cyan', skill.path)}`);
  console.log();

  console.log(`  ${bold('Source:')}`);
  if (skill.isBundled) {
    console.log(`  ${c('cyan', 'Octocode bundled skill')}`);
  } else {
    console.log(`  ${c('magenta', 'Community / Marketplace')}`);
  }
  console.log();

  const choices: Array<{ name: string; value: SkillActionChoice }> = [
    {
      name: `${c('red', '🗑️')} Remove this skill`,
      value: 'remove',
    },
    {
      name: `📋 View SKILL.md content`,
      value: 'view',
    },
    new Separator() as unknown as { name: string; value: SkillActionChoice },
    {
      name: `${c('dim', '← Back')}`,
      value: 'back',
    },
  ];

  const choice = await select<SkillActionChoice>({
    message: 'Action:',
    choices,
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
 * Show SKILL.md content for a skill
 */
function showSkillContent(skill: InstalledSkill): void {
  const skillMdPath = path.join(skill.path, 'SKILL.md');

  if (!fileExists(skillMdPath)) {
    console.log();
    console.log(`  ${c('yellow', '⚠')} No SKILL.md file found`);
    console.log();
    return;
  }

  const content = readFileContent(skillMdPath);
  if (!content) {
    console.log();
    console.log(`  ${c('red', '✗')} Failed to read SKILL.md`);
    console.log();
    return;
  }

  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  ${bold('SKILL.md')} - ${skill.name}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Show content with proper formatting (first 50 lines)
  const lines = content.split('\n').slice(0, 50);
  for (const line of lines) {
    console.log(`  ${dim(line)}`);
  }

  if (content.split('\n').length > 50) {
    console.log();
    console.log(`  ${dim('... (truncated)')}`);
  }
  console.log();
}

/**
 * Remove a specific skill
 */
async function removeSkill(skill: InstalledSkill): Promise<boolean> {
  console.log();
  console.log(`  ${c('yellow', '⚠')} You are about to remove:`);
  console.log(`    ${bold(skill.name)}`);
  console.log(`    ${dim(skill.path)}`);
  console.log();

  const choices = [
    {
      name: `${c('red', '🗑️')} Yes, remove this skill`,
      value: true,
    },
    new Separator() as unknown as { name: string; value: boolean },
    {
      name: `${c('dim', '← Cancel')}`,
      value: false,
    },
  ];

  const confirmed = await select<boolean>({
    message: 'Confirm removal?',
    choices,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
        message: (text: string) => bold(text),
      },
    },
  });

  if (!confirmed) {
    return false;
  }

  console.log();
  const spinner = new Spinner(`Removing ${skill.name}...`).start();

  if (removeDirectory(skill.path)) {
    spinner.succeed(`Removed ${skill.name}`);
    console.log();
    console.log(`  ${c('green', '✓')} Skill removed successfully`);
    return true;
  } else {
    spinner.fail(`Failed to remove ${skill.name}`);
    console.log();
    console.log(`  ${c('red', '✗')} Could not remove skill directory`);
    return false;
  }
}

/**
 * Manage installed skills flow
 */
async function manageInstalledSkills(): Promise<void> {
  let inManageMenu = true;

  while (inManageMenu) {
    const installedSkills = getAllInstalledSkills();

    if (installedSkills.length === 0) {
      console.log();
      console.log(`  ${c('yellow', 'ℹ')} No skills installed`);
      console.log(`  ${dim('Browse the marketplace to install skills')}`);
      console.log();
      await pressEnterToContinue();
      return;
    }

    const selectedSkill = await selectInstalledSkill(installedSkills);

    if (selectedSkill === 'back') {
      inManageMenu = false;
      continue;
    }

    // Show skill actions
    let inSkillActions = true;
    while (inSkillActions) {
      const action = await showSkillActions(selectedSkill);

      switch (action) {
        case 'remove': {
          const removed = await removeSkill(selectedSkill);
          if (removed) {
            await pressEnterToContinue();
            inSkillActions = false; // Go back to skill list
          }
          break;
        }

        case 'view':
          showSkillContent(selectedSkill);
          await pressEnterToContinue();
          break;

        case 'back':
        default:
          inSkillActions = false;
          break;
      }
    }
  }
}

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

  // Get all skills metadata for descriptions
  const allSkillsMetadata = getAllSkillsMetadata();

  // Skills menu loop - allows going back from install
  let inSkillsMenu = true;
  while (inSkillsMenu) {
    // Refresh skills info on each iteration
    info = getSkillsInfo();

    // Get count of ALL installed skills (including marketplace)
    const installedSkills = getAllInstalledSkills();
    const installedCount = installedSkills.length;

    // Show submenu
    const hasUninstalled = info.notInstalled.length > 0;
    const choice = await showSkillsMenu(hasUninstalled, installedCount);

    switch (choice) {
      case 'manage':
        await manageInstalledSkills();
        break;

      case 'view-all':
        showAllSkills(allSkillsMetadata, info);
        await pressEnterToContinue();
        break;

      case 'marketplace':
        await runMarketplaceFlow();
        break;

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
