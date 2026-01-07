/**
 * Skills Marketplace Registry
 * Curated list of community skill marketplaces for Claude Code
 */

/**
 * Source type for marketplaces
 * - 'github': Skills fetched from GitHub repository
 * - 'local': Skills bundled with the CLI
 */
type MarketplaceSourceType = 'github' | 'local';

/**
 * Marketplace source configuration
 */
export interface MarketplaceSource {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Source type: 'github' for remote repos, 'local' for bundled skills */
  type: MarketplaceSourceType;
  /** GitHub owner/organization (required for github type) */
  owner: string;
  /** GitHub repository name (required for github type) */
  repo: string;
  /** Default branch (required for github type) */
  branch: string;
  /** Path to skills directory (relative to repo root) */
  skillsPath: string;
  /** File pattern for skills (e.g., '*.md' or 'SKILL.md') */
  skillPattern: 'flat-md' | 'skill-folders';
  /** Short description */
  description: string;
  /** Repository URL */
  url: string;
}

/**
 * Skill entry from a marketplace
 */
export interface MarketplaceSkill {
  /** Skill name (derived from filename or folder) */
  name: string;
  /** Formatted display name */
  displayName: string;
  /** Description from frontmatter */
  description: string;
  /** Category from frontmatter */
  category?: string;
  /** Path to skill file or folder in the repo */
  path: string;
  /** Source marketplace */
  source: MarketplaceSource;
}

/**
 * Curated marketplace sources
 * These are popular, well-maintained repositories with Claude skills/commands
 */
export const SKILLS_MARKETPLACES: MarketplaceSource[] = [
  // === OFFICIAL BUNDLED SKILLS ===
  {
    id: 'octocode-official',
    name: '🐙 Octocode Official',
    type: 'local',
    owner: 'ArekSrorth',
    repo: 'octocode-mcp',
    branch: 'main',
    skillsPath: 'packages/octocode-cli/skills',
    skillPattern: 'skill-folders',
    description:
      'Official research, planning, review, generation & roast skills',
    url: 'https://github.com/ArekSrorth/octocode-mcp',
  },
  // === COMMUNITY MARKETPLACES ===
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
];

/**
 * Get marketplace source by ID
 */
export function getMarketplaceById(id: string): MarketplaceSource | undefined {
  return SKILLS_MARKETPLACES.find(m => m.id === id);
}

/**
 * Get total count of marketplaces
 */
export function getMarketplaceCount(): number {
  return SKILLS_MARKETPLACES.length;
}

/**
 * GitHub repository info response
 */
interface GitHubRepoInfo {
  stargazers_count: number;
}

/**
 * Cached stars data with timestamp
 */
interface StarsCacheEntry {
  stars: number;
  timestamp: number;
}

// In-memory cache for stars (5 minute TTL)
const starsCache = new Map<string, StarsCacheEntry>();
const STARS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Clear the stars cache (for testing)
 */
export function clearStarsCache(): void {
  starsCache.clear();
}

/**
 * Check if a marketplace source is local (bundled)
 */
export function isLocalSource(source: MarketplaceSource): boolean {
  return source.type === 'local';
}

/**
 * Get local (bundled) marketplace sources
 */
export function getLocalMarketplaces(): MarketplaceSource[] {
  return SKILLS_MARKETPLACES.filter(m => m.type === 'local');
}

/**
 * Get GitHub (remote) marketplace sources
 */
export function getGitHubMarketplaces(): MarketplaceSource[] {
  return SKILLS_MARKETPLACES.filter(m => m.type === 'github');
}

/**
 * Fetch GitHub stars for a marketplace source
 * Uses in-memory cache with 5-minute TTL
 * Returns null for local sources
 */
export async function fetchMarketplaceStars(
  source: MarketplaceSource
): Promise<number | null> {
  // Local sources don't have stars
  if (source.type === 'local') {
    return null;
  }

  const cacheKey = `${source.owner}/${source.repo}`;
  const cached = starsCache.get(cacheKey);

  // Return cached value if still valid
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

    // Cache the result
    starsCache.set(cacheKey, { stars, timestamp: Date.now() });

    return stars;
  } catch {
    return null;
  }
}

/**
 * Fetch stars for all marketplaces in parallel
 * Returns a map of marketplace ID to star count
 */
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
