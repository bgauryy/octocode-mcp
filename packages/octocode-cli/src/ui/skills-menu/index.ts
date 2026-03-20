import { c, bold, dim } from '../../utils/colors.js';
import { loadInquirer, select, Separator, input } from '../../utils/prompts.js';
import {
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
import { parseSkillFrontmatter } from '../../utils/parsers/frontmatter.js';
import path from 'node:path';
import open from 'open';
import { Spinner } from '../../utils/spinner.js';
import { runMarketplaceFlow } from './marketplace.js';

const WHAT_ARE_SKILLS_URL = 'https://agentskills.io/what-are-skills';

const RECOMMENDED_SKILLS = new Set([
  'octocode-research',
  'octocode-pull-request-reviewer',
  'octocode-researcher',
]);

interface InstalledSkill {
  name: string;

  description: string;

  folder: string;

  path: string;

  isBundled: boolean;

  isRecommended: boolean;
}

type SkillsMenuChoice =
  | 'manage'
  | 'view'
  | 'marketplace'
  | 'change-path'
  | 'learn'
  | 'back';
type ManageSkillsChoice = InstalledSkill | 'back';

async function pressEnterToContinue(): Promise<void> {
  console.log();
  await input({
    message: dim('Press Enter to continue...'),
    default: '',
  });
}

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

    const isBundled =
      folder.startsWith('octocode-') &&
      dirExists(srcDir) &&
      dirExists(path.join(srcDir, folder));

    const isRecommended = RECOMMENDED_SKILLS.has(folder);

    if (fileExists(skillMdPath)) {
      const content = readFileContent(skillMdPath);
      if (content) {
        const parsed = parseSkillFrontmatter(content);
        if (parsed?.name && parsed.description) {
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

    skills.push({
      name: formatSkillName(folder),
      description: 'No description available',
      folder,
      path: skillPath,
      isBundled,
      isRecommended,
    });
  }

  skills.sort((a, b) => {
    if (a.isRecommended !== b.isRecommended) {
      return a.isRecommended ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return skills;
}

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

async function showSkillsMenu(
  installedCount: number
): Promise<SkillsMenuChoice> {
  const choices: Array<{
    name: string;
    value: SkillsMenuChoice;
    description?: string;
  }> = [];

  if (installedCount > 0) {
    choices.push({
      name: `📦 Manage installed skills ${dim(`(${installedCount})`)}`,
      value: 'manage',
      description: 'View, remove, or inspect individual skills',
    });
  }

  choices.push({
    name: ' Browse Marketplace',
    value: 'marketplace',
    description: 'Community skills • installs on your behalf',
  });

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

function showSkillsStatus(info: ReturnType<typeof getSkillsInfo>): void {
  const { destDir, skillsStatus, notInstalled } = info;

  if (skillsStatus.length === 0) {
    console.log(`  ${dim('No skills available.')}`);
    console.log();
    return;
  }

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

  console.log(`  ${bold('Installation path:')}`);
  console.log(`  ${c('cyan', destDir)}`);
  console.log();

  if (notInstalled.length === 0) {
    console.log(`  ${c('green', '✓')} All skills are installed!`);
  } else {
    console.log(
      `  ${c('yellow', 'ℹ')} ${notInstalled.length} skill(s) not installed`
    );
  }
  console.log();
}

function formatSkillName(name: string): string {
  const acronyms = ['PR', 'API', 'UI', 'CLI', 'MCP', 'AI'];
  const formatted = name
    .replace(/^octocode-/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return formatted.replace(
    new RegExp(`\\b(${acronyms.join('|')})\\b`, 'gi'),
    match => match.toUpperCase()
  );
}

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

    let inSkillActions = true;
    while (inSkillActions) {
      const action = await showSkillActions(selectedSkill);

      switch (action) {
        case 'remove': {
          const removed = await removeSkill(selectedSkill);
          if (removed) {
            await pressEnterToContinue();
            inSkillActions = false;
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

export async function runSkillsMenu(): Promise<void> {
  await loadInquirer();

  let info = getSkillsInfo();

  if (!info.sourceExists) {
    console.log(`  ${c('yellow', '⚠')} Skills source directory not found.`);
    console.log(`  ${dim('This may happen if running from source.')}`);
    console.log();
    await pressEnterToContinue();
    return;
  }

  if (info.skillsStatus.length === 0) {
    console.log(`  ${dim('No skills available.')}`);
    console.log();
    await pressEnterToContinue();
    return;
  }

  let inSkillsMenu = true;
  while (inSkillsMenu) {
    info = getSkillsInfo();

    const installedSkills = getAllInstalledSkills();
    const installedCount = installedSkills.length;

    const choice = await showSkillsMenu(installedCount);

    switch (choice) {
      case 'manage':
        await manageInstalledSkills();
        break;

      case 'marketplace':
        await runMarketplaceFlow();
        break;

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

            if (!trimmed) {
              return true;
            }

            const expanded = trimmed.startsWith('~')
              ? trimmed.replace('~', process.env.HOME || '')
              : trimmed;

            if (!path.isAbsolute(expanded)) {
              return 'Enter an absolute path (e.g., ~/.claude/skills)';
            }
            return true;
          },
        });

        const trimmedPath = newPath.trim();

        if (!trimmedPath) {
          setCustomSkillsDestDir(null);
          console.log();
          console.log(`  ${c('green', '✓')} Skills path reset to default:`);
          console.log(`  ${c('cyan', defaultPath)}`);
          console.log();
          await pressEnterToContinue();
          break;
        }

        const expandedPath = trimmedPath.startsWith('~')
          ? trimmedPath.replace('~', process.env.HOME || '')
          : trimmedPath;
        const normalizedPath = path.resolve(expandedPath);

        if (normalizedPath === info.destDir) {
          console.log();
          console.log(`  ${dim('No change - path is already set.')}`);
          console.log();
          await pressEnterToContinue();
          break;
        }

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
        inSkillsMenu = false;
        break;
    }
  }
}
