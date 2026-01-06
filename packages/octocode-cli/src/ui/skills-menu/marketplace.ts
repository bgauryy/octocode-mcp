/**
 * Skills Marketplace UI
 * Browse and install skills from community marketplaces
 */

import { c, bold, dim } from '../../utils/colors.js';
import { select, Separator, input } from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import { dirExists } from '../../utils/fs.js';
import { getSkillsDestDir } from '../../utils/skills.js';
import {
  SKILLS_MARKETPLACES,
  type MarketplaceSource,
  type MarketplaceSkill,
  fetchAllMarketplaceStars,
} from '../../configs/skills-marketplace.js';
import {
  fetchMarketplaceSkills,
  installMarketplaceSkill,
  searchSkills,
} from '../../utils/skills-fetch.js';
import path from 'node:path';

// ============================================================================
// Types
// ============================================================================

type MarketplaceMenuChoice = MarketplaceSource | 'back';
type SkillMenuChoice = MarketplaceSkill | 'search' | 'back';
type InstallChoice = 'install' | 'back';

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
 * Format marketplace for display
 */
function formatMarketplace(source: MarketplaceSource, stars?: number): string {
  const starsText = stars ? ` ⭐ ${stars.toLocaleString()}` : '';
  return `${bold(source.name)}${c('yellow', starsText)} - ${dim(source.description)}`;
}

/**
 * Format skill for display
 */
function formatSkill(skill: MarketplaceSkill, installed: boolean): string {
  const status = installed ? c('green', ' ✓') : '';
  const category = skill.category ? ` [${skill.category}]` : '';
  const desc = skill.description.slice(0, 50);
  const ellipsis = skill.description.length > 50 ? '...' : '';
  return `${skill.displayName}${status}${dim(category)} - ${dim(desc)}${dim(ellipsis)}`;
}

/**
 * Check if skill is already installed
 */
function isSkillInstalled(skillName: string): boolean {
  const destDir = getSkillsDestDir();
  return dirExists(path.join(destDir, skillName));
}

// ============================================================================
// UI Flows
// ============================================================================

/**
 * Select marketplace source
 */
async function selectMarketplace(
  starsMap: Map<string, number>
): Promise<MarketplaceMenuChoice> {
  console.log();
  console.log(`  ${bold('Select a marketplace to browse:')}`);
  console.log();

  // Sort marketplaces by stars
  const sortedMarketplaces = [...SKILLS_MARKETPLACES].sort(
    (a, b) => (starsMap.get(b.id) ?? 0) - (starsMap.get(a.id) ?? 0)
  );

  const choices: Array<{
    name: string;
    value: MarketplaceMenuChoice;
    description?: string;
  }> = [];

  for (const source of sortedMarketplaces) {
    choices.push({
      name: formatMarketplace(source, starsMap.get(source.id)),
      value: source,
    });
  }

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: MarketplaceMenuChoice;
    }
  );
  choices.push({
    name: `${c('dim', '← Back to skills menu')}`,
    value: 'back',
  });

  const choice = await select<MarketplaceMenuChoice>({
    message: 'Marketplace:',
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
 * Browse skills from a marketplace
 */
async function browseSkills(
  source: MarketplaceSource,
  skills: MarketplaceSkill[]
): Promise<SkillMenuChoice> {
  console.log();
  console.log(`  ${bold(source.name)} - ${skills.length} skills available`);
  console.log(`  ${dim(source.url)}`);
  console.log();

  const choices: Array<{
    name: string;
    value: SkillMenuChoice;
  }> = [];

  // Add search option
  choices.push({
    name: `🔍 Search skills - ${dim('Filter by name or description')}`,
    value: 'search',
  });

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: SkillMenuChoice;
    }
  );

  // Add all skills (no truncation)
  for (const skill of skills) {
    const installed = isSkillInstalled(skill.name);
    choices.push({
      name: formatSkill(skill, installed),
      value: skill,
    });
  }

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: SkillMenuChoice;
    }
  );
  choices.push({
    name: `${c('dim', '← Back to marketplaces')}`,
    value: 'back',
  });

  const choice = await select<SkillMenuChoice>({
    message: 'Select a skill:',
    choices,
    pageSize: 20,
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
 * Search skills in a marketplace
 */
async function searchSkillsPrompt(
  skills: MarketplaceSkill[]
): Promise<MarketplaceSkill | 'back' | null> {
  console.log();
  console.log(`  ${c('blue', 'ℹ')} Enter search terms (name or description)`);
  console.log(`  ${dim('Leave empty to go back')}`);
  console.log();

  const query = await input({
    message: 'Search:',
  });

  if (!query || !query.trim()) return 'back';

  const results = searchSkills(skills, query.trim());

  if (results.length === 0) {
    console.log();
    console.log(`  ${c('yellow', '⚠')} No skills found matching "${query}"`);
    console.log();
    return null;
  }

  console.log();
  console.log(
    `  ${c('green', '✓')} Found ${bold(String(results.length))} skill${results.length > 1 ? 's' : ''}`
  );
  console.log();

  const choices: Array<{
    name: string;
    value: MarketplaceSkill | 'back';
  }> = [];

  for (const skill of results.slice(0, 20)) {
    const installed = isSkillInstalled(skill.name);
    choices.push({
      name: formatSkill(skill, installed),
      value: skill,
    });
  }

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: MarketplaceSkill | 'back';
    }
  );
  choices.push({
    name: `${c('dim', '← Back')}`,
    value: 'back',
  });

  const choice = await select<MarketplaceSkill | 'back'>({
    message: 'Select a skill:',
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

/**
 * Show skill details and install prompt
 */
async function showSkillDetails(
  skill: MarketplaceSkill
): Promise<InstallChoice> {
  const installed = isSkillInstalled(skill.name);
  const destDir = getSkillsDestDir();

  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  ${bold(skill.displayName)}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Skill info
  console.log(`  ${bold('Description:')}`);
  console.log(`  ${skill.description}`);
  console.log();

  if (skill.category) {
    console.log(`  ${bold('Category:')} ${skill.category}`);
    console.log();
  }

  console.log(`  ${bold('Source:')} ${skill.source.name}`);
  console.log(`  ${dim(skill.source.url)}`);
  console.log();

  console.log(`  ${bold('Install path:')}`);
  console.log(`  ${c('cyan', path.join(destDir, skill.name))}`);
  console.log();

  if (installed) {
    console.log(`  ${c('yellow', '⚠')} This skill is already installed`);
    console.log(`  ${dim('Installing will overwrite the existing version')}`);
    console.log();
  }

  const choices: Array<{
    name: string;
    value: InstallChoice;
  }> = [
    {
      name: installed
        ? `${c('yellow', '⬆')} Reinstall skill`
        : `${c('green', '✓')} Install skill`,
      value: 'install',
    },
    new Separator() as unknown as { name: string; value: InstallChoice },
    {
      name: `${c('dim', '← Back')}`,
      value: 'back',
    },
  ];

  const choice = await select<InstallChoice>({
    message: installed ? 'Reinstall this skill?' : 'Install this skill?',
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
 * Install a skill from marketplace
 */
async function installSkill(skill: MarketplaceSkill): Promise<boolean> {
  const destDir = getSkillsDestDir();

  console.log();
  const spinner = new Spinner(`Installing ${skill.displayName}...`).start();

  const result = await installMarketplaceSkill(skill, destDir);

  if (result.success) {
    spinner.succeed(`Installed ${skill.displayName}!`);
    console.log();
    console.log(`  ${c('green', '✓')} Skill installed successfully`);
    console.log(
      `  ${dim('Location:')} ${c('cyan', path.join(destDir, skill.name))}`
    );
    console.log();
    console.log(`  ${bold('The skill is now available in Claude Code!')}`);
  } else {
    spinner.fail(`Failed to install ${skill.displayName}`);
    console.log();
    console.log(`  ${c('red', '✗')} Installation failed: ${result.error}`);
  }

  console.log();
  await pressEnterToContinue();
  return result.success;
}

// ============================================================================
// Main Flow
// ============================================================================

/**
 * Run the marketplace browser flow
 */
export async function runMarketplaceFlow(): Promise<void> {
  // Section header
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🌐 ${bold('Skills Marketplace')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();
  console.log(`  ${dim('Browse and install skills from the community')}`);
  console.log();
  console.log(
    `  ${c('yellow', '⚠')} ${c('yellow', 'This is a public community list. Skills install on your behalf.')}`
  );

  // Fetch stars for all marketplaces
  const starsSpinner = new Spinner('Fetching marketplace info...').start();
  let starsMap: Map<string, number>;
  try {
    starsMap = await fetchAllMarketplaceStars();
    starsSpinner.succeed('Loaded marketplace info');
  } catch {
    starsSpinner.fail('Could not fetch stars');
    starsMap = new Map();
  }

  let inMarketplace = true;

  while (inMarketplace) {
    // Select marketplace
    const source = await selectMarketplace(starsMap);

    if (source === 'back') {
      inMarketplace = false;
      continue;
    }

    // Fetch skills from marketplace
    console.log();
    const spinner = new Spinner(
      `Loading skills from ${source.name}...`
    ).start();

    let skills: MarketplaceSkill[];
    try {
      skills = await fetchMarketplaceSkills(source);
      spinner.succeed(`Loaded ${skills.length} skills from ${source.name}`);
    } catch (error) {
      spinner.fail(`Failed to load skills`);
      console.log();
      console.log(
        `  ${c('red', '✗')} ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      console.log();
      await pressEnterToContinue();
      continue;
    }

    if (skills.length === 0) {
      console.log();
      console.log(`  ${c('yellow', '⚠')} No skills found in this marketplace`);
      console.log();
      await pressEnterToContinue();
      continue;
    }

    // Browse skills loop
    let inSkillsBrowser = true;
    while (inSkillsBrowser) {
      const skillChoice = await browseSkills(source, skills);

      if (skillChoice === 'back') {
        inSkillsBrowser = false;
        continue;
      }

      if (skillChoice === 'search') {
        const searchResult = await searchSkillsPrompt(skills);
        if (searchResult === 'back' || searchResult === null) {
          continue;
        }
        // Show skill details for search result
        const detailChoice = await showSkillDetails(searchResult);
        if (detailChoice === 'install') {
          await installSkill(searchResult);
        }
        continue;
      }

      // Show skill details
      const detailChoice = await showSkillDetails(skillChoice);
      if (detailChoice === 'install') {
        await installSkill(skillChoice);
      }
    }
  }
}
