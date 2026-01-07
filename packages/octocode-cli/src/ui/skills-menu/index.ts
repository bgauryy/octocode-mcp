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
  getDefaultSkillsDestDir,
  setCustomSkillsDestDir,
} from '../../utils/skills.js';
import path from 'node:path';
import open from 'open';
import { Spinner } from '../../utils/spinner.js';
import { runMarketplaceFlow, runOctocodeOfficialFlow } from './marketplace.js';

// ============================================================================
// Constants
// ============================================================================

const WHAT_ARE_SKILLS_URL = 'https://agentskills.io/what-are-skills';

/** Recommended skills shown first with a star */
const RECOMMENDED_SKILLS = new Set([
  'octocode-research',
  'octocode-pr-review',
  'octocode-local-search',
]);

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
  /** Whether this is a recommended skill (shown first with star) */
  isRecommended: boolean;
}

type SkillsMenuChoice =
  | 'install'
  | 'manage'
  | 'view'
  | 'marketplace'
  | 'octocode-official'
  | 'change-path'
  | 'learn'
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

    const isRecommended = RECOMMENDED_SKILLS.has(folder);

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
            isRecommended,
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
      isRecommended,
    });
  }

  // Sort: recommended first, then alphabetically by name
  skills.sort((a, b) => {
    if (a.isRecommended !== b.isRecommended) {
      return a.isRecommended ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return skills;
}

// ============================================================================
// Local State Helpers (use state.ts for shared state)
// ============================================================================

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

  // Octocode Official - quick access to bundled skills
  choices.push({
    name: '🐙 Octocode Official 📦',
    value: 'octocode-official',
    description: 'Research, PR review, local search & more',
  });

  // Browse marketplace - always available
  choices.push({
    name: '🌐 Browse Marketplace',
    value: 'marketplace',
    description: 'Community skills • installs on your behalf',
  });

  if (hasUninstalled) {
    choices.push({
      name: '📥 Install bundled skills',
      value: 'install',
      description: 'Install Octocode skills to Claude Code',
    });
  }

  // Change default skills path option
  choices.push({
    name: '📁 Change default skills path',
    value: 'change-path',
    description: 'Set custom installation directory',
  });

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: SkillsMenuChoice;
      description?: string;
    }
  );

  // Learn about skills - opens browser
  choices.push({
    name: `${c('cyan', '❓')} What are skills?`,
    value: 'learn',
    description: 'Learn about Claude Code skills • opens browser',
  });

  choices.push({
    name: `${c('dim', '← Back to main menu')}`,
    value: 'back',
  });

  const choice = await select<SkillsMenuChoice>({
    message: '',
    choices,
    pageSize: 10,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
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
    const starTag = skill.isRecommended ? c('yellow', '⭐ ') : '';
    const sourceTag = skill.isBundled
      ? c('cyan', ' [bundled]')
      : c('magenta', ' [community]');
    const desc = skill.description.slice(0, 40);
    const ellipsis = skill.description.length > 40 ? '...' : '';

    choices.push({
      name: `${starTag}${skill.name}${sourceTag} - ${dim(desc)}${dim(ellipsis)}`,
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
    message: '',
    choices,
    pageSize: 15,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
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
  const recommendedTag = skill.isRecommended
    ? c('yellow', '⭐ recommended ')
    : '';
  const sourceTag = skill.isBundled
    ? c('cyan', '[bundled]')
    : c('magenta', '[community]');

  console.log();
  console.log(`  ${bold(skill.name)} ${recommendedTag}${sourceTag}`);
  console.log(`  ${dim(skill.description)}`);
  console.log(`  ${dim(skill.path)}`);
  console.log();

  const choices: Array<{ name: string; value: SkillActionChoice }> = [
    {
      name: `${c('red', '🗑️')} Remove this skill`,
      value: 'remove',
    },
    {
      name: `📂 Open skill location`,
      value: 'view',
    },
    new Separator() as unknown as { name: string; value: SkillActionChoice },
    {
      name: `${c('dim', '← Back')}`,
      value: 'back',
    },
  ];

  const choice = await select<SkillActionChoice>({
    message: '',
    choices,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
      },
    },
  });

  return choice;
}

/**
 * Open skill location in file explorer (cross-platform: macOS/Windows/Linux)
 */
async function openSkillLocation(skill: InstalledSkill): Promise<void> {
  console.log();
  console.log(`  ${c('cyan', '📂')} Opening ${bold(skill.name)} location...`);
  console.log(`  ${dim(skill.path)}`);
  console.log();

  try {
    await open(skill.path);
    console.log(`  ${c('green', '✓')} Opened in file explorer`);
  } catch {
    console.log(`  ${c('yellow', '!')} Could not open location automatically`);
    console.log(`  ${dim('Path:')} ${c('cyan', skill.path)}`);
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
          await openSkillLocation(selectedSkill);
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

      case 'octocode-official':
        await runOctocodeOfficialFlow();
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

      case 'learn': {
        console.log();
        console.log(
          `  ${c('cyan', '📖')} Opening ${bold('What are Skills?')} in your browser...`
        );
        console.log(`  ${dim(WHAT_ARE_SKILLS_URL)}`);
        console.log();

        try {
          await open(WHAT_ARE_SKILLS_URL);
          console.log(`  ${c('green', '✓')} Opened in browser`);
        } catch {
          console.log(
            `  ${c('yellow', '!')} Could not open browser automatically`
          );
          console.log(
            `  ${dim('Please visit:')} ${c('cyan', WHAT_ARE_SKILLS_URL)}`
          );
        }

        console.log();
        await pressEnterToContinue();
        break;
      }

      case 'change-path': {
        const defaultPath = getDefaultSkillsDestDir();

        console.log();
        console.log(`  ${dim(`Leave empty for default: ${defaultPath}`)}`);
        console.log();

        const newPath = await input({
          message: '  Skills path:',
          default: info.destDir,
          validate: (value: string) => {
            const trimmed = value.trim();
            // Empty is allowed - means reset to default
            if (!trimmed) {
              return true;
            }
            // Expand ~ to home directory
            const expanded = trimmed.startsWith('~')
              ? trimmed.replace('~', process.env.HOME || '')
              : trimmed;
            // Check if it's an absolute path
            if (!path.isAbsolute(expanded)) {
              return 'Enter an absolute path (e.g., ~/.claude/skills)';
            }
            return true;
          },
        });

        const trimmedPath = newPath.trim();

        // If empty, reset to default
        if (!trimmedPath) {
          setCustomSkillsDestDir(null);
          console.log();
          console.log(`  ${c('green', '✓')} Skills path reset to default:`);
          console.log(`  ${c('cyan', defaultPath)}`);
          console.log();
          await pressEnterToContinue();
          break;
        }

        // Expand ~ and normalize path
        const expandedPath = trimmedPath.startsWith('~')
          ? trimmedPath.replace('~', process.env.HOME || '')
          : trimmedPath;
        const normalizedPath = path.resolve(expandedPath);

        // If same as current, no change needed
        if (normalizedPath === info.destDir) {
          console.log();
          console.log(`  ${dim('No change - path is already set.')}`);
          console.log();
          await pressEnterToContinue();
          break;
        }

        // Create directory if it doesn't exist
        if (!dirExists(normalizedPath)) {
          const { mkdirSync } = await import('node:fs');
          try {
            mkdirSync(normalizedPath, { recursive: true });
            console.log();
            console.log(
              `  ${c('green', '✓')} Created directory: ${c('cyan', normalizedPath)}`
            );
          } catch (error) {
            console.log();
            const errMsg =
              error instanceof Error ? error.message : String(error);
            console.log(`  ${c('red', '✗')} Failed to create directory:`);
            console.log(`  ${dim(errMsg)}`);
            await pressEnterToContinue();
            break;
          }
        }

        // Save the custom path (or reset if it's the default)
        if (normalizedPath === defaultPath) {
          setCustomSkillsDestDir(null);
        } else {
          setCustomSkillsDestDir(normalizedPath);
        }
        console.log();
        console.log(`  ${c('green', '✓')} Skills path updated to:`);
        console.log(`  ${c('cyan', normalizedPath)}`);
        console.log();
        console.log(
          `  ${dim('Note: Existing skills are not moved automatically.')}`
        );
        console.log(
          `  ${dim('You may need to reinstall skills to the new location.')}`
        );
        console.log();
        await pressEnterToContinue();
        break;
      }

      case 'back':
      default:
        // Exit skills menu and return to main menu
        inSkillsMenu = false;
        break;
    }
  }
}
