type MarketplaceSourceType = 'github' | 'local';

export interface MarketplaceSource {
  id: string;

  name: string;

  type: MarketplaceSourceType;

  owner: string;

  repo: string;

  branch: string;

  skillsPath: string;

  skillPattern: 'flat-md' | 'skill-folders';

  description: string;

  url: string;
}

export interface MarketplaceSkill {
  name: string;

  displayName: string;

  description: string;

  category?: string;

  path: string;

  source: MarketplaceSource;
}

export const SKILLS_MARKETPLACES: MarketplaceSource[] = [
  {
    id: 'octocode-skills',
    name: 'Octocode',
    type: 'github',
    owner: 'bgauryy',
    repo: 'octocode-mcp',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Research, planning, code review & documentation',
    url: 'https://github.com/bgauryy/octocode-mcp/tree/main/skills',
  },
  {
    id: 'anthropic-skills',
    name: 'Anthropic Official',
    type: 'github',
    owner: 'anthropics',
    repo: 'skills',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Official Anthropic skills — artifacts, design & docs',
    url: 'https://github.com/anthropics/skills/tree/main/skills',
  },
  {
    id: 'superpowers',
    name: 'Superpowers',
    type: 'github',
    owner: 'obra',
    repo: 'superpowers',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'TDD, debugging, worktrees & disciplined development',
    url: 'https://github.com/obra/superpowers',
  },
  {
    id: 'everything-claude-code',
    name: 'Everything Claude Code',
    type: 'github',
    owner: 'affaan-m',
    repo: 'everything-claude-code',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Performance, security, memory & agent harness',
    url: 'https://github.com/affaan-m/everything-claude-code/tree/main/skills',
  },
  {
    id: 'composio-skills',
    name: 'Composio Skills',
    type: 'github',
    owner: 'ComposioHQ',
    repo: 'awesome-claude-skills',
    branch: 'master',
    skillsPath: '',
    skillPattern: 'skill-folders',
    description: 'Brand, canvas, MCP builder, invoicing & testing',
    url: 'https://github.com/ComposioHQ/awesome-claude-skills',
  },
  {
    id: 'antigravity-awesome-skills',
    name: 'Antigravity Awesome',
    type: 'github',
    owner: 'sickn33',
    repo: 'antigravity-awesome-skills',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: '1,300+ agentic skills across all coding domains',
    url: 'https://github.com/sickn33/antigravity-awesome-skills/tree/main/skills',
  },
  {
    id: 'obsidian-skills',
    name: 'Obsidian Skills',
    type: 'github',
    owner: 'kepano',
    repo: 'obsidian-skills',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Markdown editing & Obsidian vault productivity',
    url: 'https://github.com/kepano/obsidian-skills/tree/main/skills',
  },
  {
    id: 'planning-with-files',
    name: 'Planning with Files',
    type: 'github',
    owner: 'OthmanAdi',
    repo: 'planning-with-files',
    branch: 'master',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Manus-style persistent markdown planning workflow',
    url: 'https://github.com/OthmanAdi/planning-with-files/tree/master/skills',
  },
  {
    id: 'marketing-skills',
    name: 'Marketing Skills',
    type: 'github',
    owner: 'coreyhaines31',
    repo: 'marketingskills',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'SEO, copywriting, CRO, analytics & growth engineering',
    url: 'https://github.com/coreyhaines31/marketingskills/tree/main/skills',
  },
  {
    id: 'claude-scientific-skills',
    name: 'Scientific Skills',
    type: 'github',
    owner: 'K-Dense-AI',
    repo: 'claude-scientific-skills',
    branch: 'main',
    skillsPath: 'scientific-skills',
    skillPattern: 'skill-folders',
    description: 'Biopython, astropy, deepchem & scientific computing',
    url: 'https://github.com/K-Dense-AI/claude-scientific-skills',
  },
  {
    id: 'dev-browser',
    name: 'Dev Browser',
    type: 'github',
    owner: 'SawyerHood',
    repo: 'dev-browser',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Browser control via Playwright with persistent state',
    url: 'https://github.com/SawyerHood/dev-browser',
  },
  {
    id: 'aris-research',
    name: 'ARIS Research',
    type: 'github',
    owner: 'wanshuiyin',
    repo: 'Auto-claude-code-research-in-sleep',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Autonomous ML research — papers, reviews & experiments',
    url: 'https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/tree/main/skills',
  },
  {
    id: 'buildwithclaude',
    name: 'Build With Claude',
    type: 'github',
    owner: 'davepoon',
    repo: 'buildwithclaude',
    branch: 'main',
    skillsPath: 'commands',
    skillPattern: 'flat-md',
    description: '170+ commands, agents & skills hub',
    url: 'https://github.com/davepoon/buildwithclaude',
  },
  {
    id: 'claude-code-plugins-plus-skills',
    name: 'Plugins + Skills',
    type: 'github',
    owner: 'jeremylongshore',
    repo: 'claude-code-plugins-plus-skills',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: '1,300+ skills with tutorials & orchestration',
    url: 'https://github.com/jeremylongshore/claude-code-plugins-plus-skills',
  },
  {
    id: 'ui-ux-pro-max',
    name: 'UI/UX Pro Max',
    type: 'github',
    owner: 'nextlevelbuilder',
    repo: 'ui-ux-pro-max-skill',
    branch: 'main',
    skillsPath: '.claude/skills',
    skillPattern: 'skill-folders',
    description: 'UI/UX, brand guidelines, design systems & styling',
    url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/.claude/skills',
  },
  {
    id: 'ctf-skills',
    name: 'CTF Skills',
    type: 'github',
    owner: 'ljagiello',
    repo: 'ctf-skills',
    branch: 'main',
    skillsPath: '',
    skillPattern: 'skill-folders',
    description: 'Web exploitation, crypto, pwn, reverse & forensics',
    url: 'https://github.com/ljagiello/ctf-skills',
  },
  {
    id: 'vltansky-skills',
    name: 'Vltansky Skills',
    type: 'github',
    owner: 'vltansky',
    repo: 'skills',
    branch: 'master',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'QA, interviews, retros, RFC research & code reviews',
    url: 'https://github.com/vltansky/skills/tree/master/skills',
  },
  {
    id: 'claude-skills-marketplace',
    name: 'Claude Skills Marketplace',
    type: 'github',
    owner: 'mhattingpete',
    repo: 'claude-skills-marketplace',
    branch: 'main',
    skillsPath: '',
    skillPattern: 'skill-folders',
    description: 'Git automation, testing & code review',
    url: 'https://github.com/mhattingpete/claude-skills-marketplace',
  },
  {
    id: 'daymade-claude-code-skills',
    name: 'Daymade Skills',
    type: 'github',
    owner: 'daymade',
    repo: 'claude-code-skills',
    branch: 'main',
    skillsPath: '',
    skillPattern: 'skill-folders',
    description: 'Production-ready development workflows',
    url: 'https://github.com/daymade/claude-code-skills',
  },
  {
    id: 'webmaxru-agent-skills',
    name: 'Web AI Skills',
    type: 'github',
    owner: 'webmaxru',
    repo: 'agent-skills',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Web APIs for Web AI — auto-updated, manually reviewed',
    url: 'https://github.com/webmaxru/agent-skills/tree/main/skills',
  },
];

export function getMarketplaceById(id: string): MarketplaceSource | undefined {
  return SKILLS_MARKETPLACES.find(m => m.id === id);
}

export function getMarketplaceCount(): number {
  return SKILLS_MARKETPLACES.length;
}

interface GitHubRepoInfo {
  stargazers_count: number;
}

interface StarsCacheEntry {
  stars: number;
  timestamp: number;
}

const starsCache = new Map<string, StarsCacheEntry>();
const STARS_CACHE_TTL_MS = 5 * 60 * 1000;

export function clearStarsCache(): void {
  starsCache.clear();
}

export function isLocalSource(source: MarketplaceSource): boolean {
  return source.type === 'local';
}

export function getLocalMarketplaces(): MarketplaceSource[] {
  return SKILLS_MARKETPLACES.filter(m => m.type === 'local');
}

export function getGitHubMarketplaces(): MarketplaceSource[] {
  return SKILLS_MARKETPLACES.filter(m => m.type === 'github');
}

export async function fetchMarketplaceStars(
  source: MarketplaceSource
): Promise<number | null> {
  if (source.type === 'local') {
    return null;
  }

  const cacheKey = `${source.owner}/${source.repo}`;
  const cached = starsCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < STARS_CACHE_TTL_MS) {
    return cached.stars;
  }

  try {
    const apiUrl = `https://api.github.com/repos/${source.owner}/${source.repo}`;
    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'octocode-cli',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GitHubRepoInfo;
    const stars = data.stargazers_count;

    starsCache.set(cacheKey, { stars, timestamp: Date.now() });

    return stars;
  } catch {
    return null;
  }
}

export async function fetchAllMarketplaceStars(): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  const promises = SKILLS_MARKETPLACES.map(async source => {
    const stars = await fetchMarketplaceStars(source);
    if (stars !== null) {
      results.set(source.id, stars);
    }
  });

  await Promise.all(promises);
  return results;
}
