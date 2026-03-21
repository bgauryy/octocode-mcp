import { c, bold, dim } from '../../utils/colors.js';
import { select, Separator, input, search } from '../../utils/prompts.js';
import {
  MCP_REGISTRY,
  getAllCategories,
  getMCPsByCategory,
  getAllTags,
  getMCPsByTag,
  getTagCount,
  searchMCPs as searchRegistry,
  type MCPRegistryEntry,
  type MCPCategory,
} from '../../configs/mcp-registry.js';
import type { MCPClient } from '../../types/index.js';
import {
  MCP_CLIENTS,
  clientConfigExists,
  detectCurrentClient,
} from '../../utils/mcp-paths.js';

type MCPChoice = {
  name: string;
  value: MCPRegistryEntry | 'search' | 'category' | 'back';
  disabled?: boolean | string;
};

type CategoryChoice = {
  name: string;
  value: MCPCategory | 'all' | 'back';
};

type ClientChoice = {
  name: string;
  value: MCPClient | 'back';
  disabled?: boolean | string;
};

function formatCategory(category: string): string {
  return category
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getCategoryIcon(category: MCPCategory): string {
  const icons: Record<MCPCategory, string> = {
    'browser-automation': '',
    database: 'DB',
    'cloud-platform': 'CLOUD',
    'developer-tools': 'DEV',
    'file-system': 'FS',
    communication: 'CHAT',
    'search-web': 'Search',
    'ai-services': 'AI',
    'workflow-automation': 'Fast',
    'version-control': 'EDIT',
    'data-visualization': 'DATA',
    'coding-agents': 'AGENT',
    security: 'SEC',
    productivity: 'List',
    monitoring: 'MON',
    finance: 'FIN',
    'social-media': 'SOCIAL',
    aggregator: 'LINK',
    other: 'Package',
  };
  return icons[category] || 'Package';
}

function formatMCPChoice(mcp: MCPRegistryEntry): string {
  let name = `${getCategoryIcon(mcp.category)} ${mcp.name}`;
  if (mcp.official) {
    name += ` ${c('cyan', '[Official]')}`;
  }
  name += ` - ${dim(mcp.description.slice(0, 45))}${mcp.description.length > 45 ? '...' : ''}`;
  return name;
}

export async function selectTargetClient(): Promise<{
  client: MCPClient;
  customPath?: string;
} | null> {
  const currentClient = detectCurrentClient();

  console.log();
  console.log(c('blue', ' ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('blue', ' │ ') +
      dim('[Step 1/6]') +
      ' ' +
      bold('Select Target Client') +
      ' '.repeat(28) +
      c('blue', '│')
  );
  console.log(c('blue', ' └' + '─'.repeat(60) + '┘'));
  console.log();

  const clientOrder: MCPClient[] = [
    'cursor',
    'claude-desktop',
    'claude-code',
    'opencode',
    'windsurf',
    'trae',
    'antigravity',
    'zed',
    'vscode-cline',
    'vscode-roo',
    'vscode-continue',
  ];

  const choices: ClientChoice[] = [];

  for (const clientId of clientOrder) {
    const client = MCP_CLIENTS[clientId];
    const isAvailable = clientConfigExists(clientId);

    let name = `${client.name} - ${dim(client.description)}`;

    if (isAvailable) {
      name += ` ${c('green', '○')}`;
    } else {
      name += ` ${c('dim', 'X')}`;
    }

    if (currentClient === clientId) {
      name = `${c('green', '★')} ${name} ${c('yellow', '(Current)')}`;
    }

    choices.push({
      name,
      value: clientId,
      disabled: !isAvailable ? 'Not installed' : false,
    });
  }

  choices.sort((a, b) => {
    if (a.disabled && !b.disabled) return 1;
    if (!a.disabled && b.disabled) return -1;
    if (currentClient === a.value) return -1;
    if (currentClient === b.value) return 1;
    return 0;
  });

  choices.push(new Separator() as unknown as ClientChoice);
  choices.push({
    name: `${c('cyan', '-')} Custom Path - ${dim('Specify your own config path')}`,
    value: 'custom' as MCPClient,
  });
  choices.push(new Separator() as unknown as ClientChoice);
  choices.push({
    name: `${c('dim', '- Back')}`,
    value: 'back',
  });

  const selected = await select<MCPClient | 'back'>({
    message: 'Where would you like to install the MCP?',
    choices: choices as Array<{ name: string; value: MCPClient | 'back' }>,
    loop: false,
    pageSize: 15,
  });

  if (selected === 'back') return null;

  if (selected === 'custom') {
    const customPath = await promptCustomPath();
    if (!customPath) return null;
    return { client: 'custom', customPath };
  }

  return { client: selected };
}

async function promptCustomPath(): Promise<string | null> {
  console.log();
  console.log(
    `  ${c('blue', 'INFO')} Enter the full path to your MCP config file`
  );
  console.log(`  ${dim('Leave empty to go back')}`);
  console.log();

  const customPath = await input({
    message: 'Config path (or Enter to go back):',
    validate: (value: string) => {
      if (!value.trim()) return true;
      if (!value.endsWith('.json')) {
        return 'Path must be a .json file';
      }
      return true;
    },
  });

  if (!customPath || !customPath.trim()) return null;

  if (customPath.startsWith('~')) {
    return customPath.replace('~', process.env.HOME || '');
  }

  return customPath;
}

export async function selectBrowseMode(): Promise<
  'search' | 'category' | 'tag' | 'popular' | 'all' | 'back' | null
> {
  console.log();
  console.log(`  ${dim('[Step 2/6]')} ${bold('Browse Method')}`);
  console.log();

  type BrowseChoice =
    | 'search'
    | 'category'
    | 'tag'
    | 'popular'
    | 'all'
    | 'back';
  const choices: Array<{ name: string; value: BrowseChoice }> = [
    {
      name: `- Search MCPs - ${dim('Find by name, description, or tags')}`,
      value: 'search',
    },
    {
      name: `- Browse by Category - ${dim(`${getAllCategories().length} categories`)}`,
      value: 'category',
    },
    {
      name: `- Browse by Tag - ${dim(`${getAllTags().length} tags`)}`,
      value: 'tag',
    },
    {
      name: `- Popular MCPs - ${dim('Top 20 most popular')}`,
      value: 'popular',
    },
    {
      name: `- Full List (A-Z) - ${dim(`All ${MCP_REGISTRY.length} MCPs alphabetically`)}`,
      value: 'all',
    },
    new Separator() as unknown as { name: string; value: BrowseChoice },
    {
      name: `${c('dim', '- Back')}`,
      value: 'back',
    },
  ];

  const choice = await select<BrowseChoice>({
    message: '',
    choices,
    loop: false,
  });

  return choice;
}

export async function searchMCPs(): Promise<MCPRegistryEntry | 'back' | null> {
  console.log();
  console.log(`  ${dim('[Step 3/6]')} ${bold('Select MCP')}`);
  console.log();
  console.log(
    `  ${c('blue', 'INFO')} Type to search by name, description, or tags`
  );
  console.log();

  type SearchResult = MCPRegistryEntry | 'back';

  const selected = await search<SearchResult>({
    message: 'Search MCPs:',
    source: term => {
      const backOption = {
        name: `${c('dim', '- Back to browse options')}`,
        value: 'back' as const,
      };

      if (!term || !term.trim()) {
        return [
          ...MCP_REGISTRY.slice(0, 15).map(mcp => ({
            name: formatMCPChoice(mcp),
            value: mcp,
            description: mcp.tags?.slice(0, 3).join(', '),
          })),
          { name: '─'.repeat(40), value: 'back' as const, disabled: true },
          backOption,
        ];
      }

      const results = searchRegistry(term.trim());

      if (results.length === 0) {
        return [
          {
            name: `${c('yellow', 'WARN')} No MCPs found matching "${term}"`,
            value: 'back' as const,
            disabled: 'Try different keywords',
          },
          backOption,
        ];
      }

      return [
        ...results.map(mcp => ({
          name: formatMCPChoice(mcp),
          value: mcp,
          description: mcp.tags?.slice(0, 3).join(', '),
        })),
        { name: '─'.repeat(40), value: 'back' as const, disabled: true },
        backOption,
      ];
    },
    pageSize: 12,
  });

  return selected;
}

export async function selectByCategory(): Promise<
  MCPRegistryEntry | 'back' | null
> {
  console.log();
  console.log(`  ${dim('[Step 3/6]')} ${bold('Select MCP')}`);
  console.log();

  const categories = getAllCategories();

  const choices: CategoryChoice[] = categories.map(cat => ({
    name: `${getCategoryIcon(cat)} ${formatCategory(cat)} (${getMCPsByCategory(cat).length})`,
    value: cat,
  }));

  choices.sort((a, b) => {
    const countA = getMCPsByCategory(a.value as MCPCategory).length;
    const countB = getMCPsByCategory(b.value as MCPCategory).length;
    return countB - countA;
  });

  choices.push(new Separator() as unknown as CategoryChoice);
  choices.push({
    name: `${c('dim', '- Back')}`,
    value: 'back',
  });

  const category = await select<MCPCategory | 'back'>({
    message: 'Select a category:',
    choices: choices as Array<{ name: string; value: MCPCategory | 'back' }>,
    loop: false,
    pageSize: 15,
  });

  if (category === 'back') return 'back';

  const mcps = getMCPsByCategory(category);
  return await selectFromList(mcps, formatCategory(category));
}

function formatTag(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

export async function selectByTag(): Promise<MCPRegistryEntry | 'back' | null> {
  console.log();
  console.log(`  ${dim('[Step 3/6]')} ${bold('Select MCP')}`);
  console.log();
  console.log(
    `  ${c('blue', 'INFO')} Type to filter ${getAllTags().length} tags`
  );
  console.log();

  const allTags = getAllTags();

  type TagResult = string | 'back';

  const selectedTag = await search<TagResult>({
    message: 'Search tags:',
    source: term => {
      const backOption = {
        name: `${c('dim', '- Back to browse options')}`,
        value: 'back' as const,
      };

      const filteredTags =
        !term || !term.trim()
          ? allTags.slice(0, 20)
          : allTags.filter(tag =>
              tag.toLowerCase().includes(term.toLowerCase().trim())
            );

      if (filteredTags.length === 0) {
        return [
          {
            name: `${c('yellow', 'WARN')} No tags found matching "${term}"`,
            value: 'back' as const,
            disabled: 'Try different keywords',
          },
          backOption,
        ];
      }

      return [
        ...filteredTags.map(tag => ({
          name: `- ${formatTag(tag)} (${getTagCount(tag)} MCPs)`,
          value: tag,
        })),
        { name: '─'.repeat(40), value: 'back' as const, disabled: true },
        backOption,
      ];
    },
    pageSize: 15,
  });

  if (selectedTag === 'back') return 'back';

  const mcps = getMCPsByTag(selectedTag);
  return await selectFromList(mcps, `Tag: ${formatTag(selectedTag)}`);
}

export async function selectPopular(): Promise<
  MCPRegistryEntry | 'back' | null
> {
  console.log();
  console.log(`  ${dim('[Step 3/6]')} ${bold('Select MCP')}`);

  const popular = MCP_REGISTRY.slice(0, 20);
  return await selectFromList(popular, 'Popular MCPs');
}

export async function selectAll(): Promise<MCPRegistryEntry | 'back' | null> {
  console.log();
  console.log(`  ${dim('[Step 3/6]')} ${bold('Select MCP')}`);

  const allMcps = [...MCP_REGISTRY].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  return await selectFromList(
    allMcps,
    `All MCPs (A-Z) - ${allMcps.length} total`
  );
}

async function selectFromList(
  mcps: MCPRegistryEntry[],
  title: string
): Promise<MCPRegistryEntry | 'back' | null> {
  console.log();
  console.log(`  ${bold(title)}`);
  console.log();

  const choices: MCPChoice[] = mcps.map(mcp => ({
    name: formatMCPChoice(mcp),
    value: mcp,
  }));

  choices.push(new Separator() as unknown as MCPChoice);
  choices.push({
    name: `${c('dim', '- Back')}`,
    value: 'back',
  });

  const selected = await select<MCPRegistryEntry | 'back'>({
    message: 'Select an MCP to install:',
    choices: choices as Array<{
      name: string;
      value: MCPRegistryEntry | 'back';
    }>,
    loop: false,
    pageSize: 15,
  });

  return selected;
}

export async function promptEnvVars(
  mcp: MCPRegistryEntry
): Promise<Record<string, string> | 'back' | null> {
  const envVars = mcp.requiredEnvVars;

  if (!envVars || envVars.length === 0) {
    return {};
  }

  console.log();
  console.log(`  ${dim('[Step 5/6]')} ${bold('Environment Variables')}`);
  console.log();
  console.log(c('yellow', ' ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('yellow', ' │ ') +
      `${c('yellow', 'WARN')} ${bold('Environment Variables Required')}` +
      ' '.repeat(26) +
      c('yellow', '│')
  );
  console.log(c('yellow', ' └' + '─'.repeat(60) + '┘'));
  console.log();

  console.log(
    `  ${dim('This MCP requires the following environment variables:')}`
  );
  console.log();

  for (const env of envVars) {
    console.log(`  ${c('cyan', env.name)}`);
    console.log(`    ${dim(env.description)}`);
    if (env.example) {
      console.log(`    ${dim('Example:')} ${c('dim', env.example)}`);
    }
    console.log();
  }

  type EnvChoice = 'configure' | 'skip' | 'back';
  const proceed = await select<EnvChoice>({
    message: 'Would you like to configure these now?',
    choices: [
      {
        name: `${c('green', '✅')} Configure environment variables`,
        value: 'configure' as const,
      },
      {
        name: `${c('yellow', '○')} Skip - ${dim('Configure later manually')}`,
        value: 'skip' as const,
      },
      new Separator() as unknown as { name: string; value: EnvChoice },
      {
        name: `${c('dim', '- Back')}`,
        value: 'back' as const,
      },
    ],
    loop: false,
  });

  if (proceed === 'back') return 'back';
  if (proceed === 'skip') return {};

  const values: Record<string, string> = {};

  for (const env of envVars) {
    console.log();
    console.log(`  ${c('cyan', env.name)}: ${dim(env.description)}`);
    if (env.example) {
      console.log(`  ${dim('Example:')} ${env.example}`);
    }

    const value = await input({
      message: `${env.name}:`,
      validate: (val: string) => {
        if (!val.trim() && !env.name.includes('OPTIONAL')) {
          return `${env.name} is required`;
        }
        return true;
      },
    });

    if (value.trim()) {
      values[env.name] = value.trim();
    }
  }

  return values;
}

export async function confirmInstall(
  mcp: MCPRegistryEntry,
  client: MCPClient
): Promise<'proceed' | 'back' | 'cancel'> {
  const clientInfo = MCP_CLIENTS[client];

  console.log();
  type ConfirmChoice = 'proceed' | 'back' | 'cancel';
  const choice = await select<ConfirmChoice>({
    message: `Install ${mcp.name} to ${clientInfo?.name || client}?`,
    choices: [
      {
        name: `${c('green', '✅')} Proceed with installation`,
        value: 'proceed' as const,
      },
      new Separator() as unknown as { name: string; value: ConfirmChoice },
      {
        name: `${c('dim', '- Back to edit options')}`,
        value: 'back' as const,
      },
      {
        name: `${c('dim', 'X Cancel')}`,
        value: 'cancel' as const,
      },
    ],
    loop: false,
  });

  return choice;
}
