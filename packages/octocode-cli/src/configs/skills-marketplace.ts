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
    name: 'Octocode Skills',
    type: 'github',
    owner: 'bgauryy',
    repo: 'octocode-mcp',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Research, planning, implementation & PR review skills',
    url: 'https://github.com/bgauryy/octocode-mcp/tree/main/skills',
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
    description: 'Largest collection - 170+ commands, agents, skills',
    url: 'https://github.com/davepoon/buildwithclaude',
  },
  {
    id: 'claude-code-plugins-plus-skills',
    name: 'Claude Code Plugins + Skills',
    type: 'github',
    owner: 'jeremylongshore',
    repo: 'claude-code-plugins-plus-skills',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Organized skill categories with tutorials',
    url: 'https://github.com/jeremylongshore/claude-code-plugins-plus-skills',
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
    description: 'Git automation, testing, code review skills',
    url: 'https://github.com/mhattingpete/claude-skills-marketplace',
  },
  {
    id: 'daymade-claude-code-skills',
    name: 'Daymade Claude Skills',
    type: 'github',
    owner: 'daymade',
    repo: 'claude-code-skills',
    branch: 'main',
    skillsPath: '',
    skillPattern: 'skill-folders',
    description: 'Production-ready development skills',
    url: 'https://github.com/daymade/claude-code-skills',
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
    description: 'TDD, debugging, git worktrees, code review skills',
    url: 'https://github.com/obra/superpowers',
  },
  {
    id: 'claude-scientific-skills',
    name: 'Claude Scientific Skills',
    type: 'github',
    owner: 'K-Dense-AI',
    repo: 'claude-scientific-skills',
    branch: 'main',
    skillsPath: 'scientific-skills',
    skillPattern: 'skill-folders',
    description: 'Scientific computing - biopython, astropy, deepchem & more',
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
    description:
      'Browser automation with persistent page state using Playwright',
    url: 'https://github.com/SawyerHood/dev-browser',
  },
  {
    id: 'webmaxru-agent-skills',
    name: 'Agent Skills',
    type: 'github',
    owner: 'webmaxru',
    repo: 'agent-skills',
    branch: 'main',
    skillsPath: 'skills',
    skillPattern: 'skill-folders',
    description: 'Web APIs and agent workflows skill collection',
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
