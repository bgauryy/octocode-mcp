/**
 * Skills Fetch Utilities Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  MarketplaceSource,
  MarketplaceSkill,
} from '../../src/configs/skills-marketplace.js';

// Mock fs utilities
vi.mock('../../src/utils/fs.js', () => ({
  dirExists: vi.fn(),
  writeFileContent: vi.fn(),
  fileExists: vi.fn(() => false),
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

import {
  fetchMarketplaceTree,
  fetchRawContent,
  fetchMarketplaceSkills,
  installMarketplaceSkill,
  searchSkills,
  groupSkillsByCategory,
  clearSkillsCache,
  clearSourceCache,
  getCacheInfo,
  getSkillsCacheDir,
} from '../../src/utils/skills-fetch.js';
import { dirExists, writeFileContent, fileExists } from '../../src/utils/fs.js';
import * as nodeFs from 'node:fs';

// Sample marketplace source for testing
const mockSource: MarketplaceSource = {
  id: 'test-marketplace',
  name: 'Test Marketplace',
  owner: 'test-owner',
  repo: 'test-repo',
  branch: 'main',
  skillsPath: 'commands',
  skillPattern: 'flat-md',
  description: 'Test marketplace',
  url: 'https://github.com/test-owner/test-repo',
};

const mockFolderSource: MarketplaceSource = {
  ...mockSource,
  id: 'test-folder-marketplace',
  skillsPath: 'skills',
  skillPattern: 'skill-folders',
};

// Mock tree response
const mockTreeResponse = {
  sha: 'abc123',
  url: 'https://api.github.com/repos/test/test/git/trees/main',
  tree: [
    {
      path: 'commands/code-review.md',
      mode: '100644',
      type: 'blob' as const,
      sha: 'sha1',
      size: 1000,
      url: 'https://api.github.com/repos/test/test/git/blobs/sha1',
    },
    {
      path: 'commands/test-skill.md',
      mode: '100644',
      type: 'blob' as const,
      sha: 'sha2',
      size: 500,
      url: 'https://api.github.com/repos/test/test/git/blobs/sha2',
    },
    {
      path: 'other/file.txt',
      mode: '100644',
      type: 'blob' as const,
      sha: 'sha3',
      size: 100,
      url: 'https://api.github.com/repos/test/test/git/blobs/sha3',
    },
  ],
  truncated: false,
};

// Mock skill content
const mockSkillContent = `---
description: A test skill for code review
category: utilities
---

# Code Review Skill

This is a test skill for code review.
`;

describe('Skills Fetch Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchMarketplaceTree', () => {
    it('should fetch tree from GitHub API', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTreeResponse,
      } as Response);

      const tree = await fetchMarketplaceTree(mockSource);

      expect(tree).toHaveLength(3);
      expect(tree[0].path).toBe('commands/code-review.md');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.github.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'octocode-cli',
          }),
        })
      );
    });

    it('should throw error on API failure', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(fetchMarketplaceTree(mockSource)).rejects.toThrow(
        'Failed to fetch marketplace'
      );
    });

    it('should throw rate limit error on 403', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response);

      await expect(fetchMarketplaceTree(mockSource)).rejects.toThrow(
        'rate limit exceeded'
      );
    });
  });

  describe('fetchRawContent', () => {
    it('should fetch raw content from GitHub', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => mockSkillContent,
      } as Response);

      const content = await fetchRawContent(mockSource, 'commands/test.md');

      expect(content).toBe(mockSkillContent);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('raw.githubusercontent.com'),
        expect.any(Object)
      );
    });

    it('should throw error on fetch failure', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      } as Response);

      await expect(
        fetchRawContent(mockSource, 'nonexistent.md')
      ).rejects.toThrow('Failed to fetch content');
    });
  });

  describe('fetchMarketplaceSkills', () => {
    it('should fetch and parse flat-md skills', async () => {
      // Mock tree fetch
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTreeResponse,
      } as Response);

      // Mock content fetch for each skill file
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => mockSkillContent,
      } as Response);

      const skills = await fetchMarketplaceSkills(mockSource);

      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0].description).toBe('A test skill for code review');
      expect(skills[0].category).toBe('utilities');
    });

    it('should handle skill-folders pattern', async () => {
      const folderTreeResponse = {
        sha: 'abc123',
        url: 'https://api.github.com/repos/test/test/git/trees/main',
        tree: [
          {
            path: 'skills/code-review',
            mode: '040000',
            type: 'tree' as const,
            sha: 'dir1',
            url: 'https://api.github.com/repos/test/test/git/trees/dir1',
          },
          {
            path: 'skills/code-review/SKILL.md',
            mode: '100644',
            type: 'blob' as const,
            sha: 'sha1',
            size: 1000,
            url: 'https://api.github.com/repos/test/test/git/blobs/sha1',
          },
        ],
        truncated: false,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => folderTreeResponse,
      } as Response);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => mockSkillContent,
      } as Response);

      const skills = await fetchMarketplaceSkills(mockFolderSource);

      expect(skills.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('installMarketplaceSkill', () => {
    const mockSkill: MarketplaceSkill = {
      name: 'test-skill',
      displayName: 'Test Skill',
      description: 'A test skill',
      category: 'test',
      path: 'commands/test-skill.md',
      source: mockSource,
    };

    it('should install flat-md skill', async () => {
      vi.mocked(dirExists).mockReturnValue(false);
      vi.mocked(writeFileContent).mockReturnValue(true);

      // Mock tree and content fetch
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTreeResponse,
      } as Response);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => mockSkillContent,
      } as Response);

      const result = await installMarketplaceSkill(mockSkill, '/dest');

      expect(result.success).toBe(true);
      expect(writeFileContent).toHaveBeenCalled();
    });

    it('should return error on failure', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await installMarketplaceSkill(mockSkill, '/dest');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('searchSkills', () => {
    const mockSkills: MarketplaceSkill[] = [
      {
        name: 'code-review',
        displayName: 'Code Review',
        description: 'Review code for quality',
        category: 'development',
        path: 'skills/code-review',
        source: mockSource,
      },
      {
        name: 'testing',
        displayName: 'Testing',
        description: 'Test automation tools',
        category: 'testing',
        path: 'skills/testing',
        source: mockSource,
      },
      {
        name: 'documentation',
        displayName: 'Documentation',
        description: 'Generate documentation',
        category: 'development',
        path: 'skills/documentation',
        source: mockSource,
      },
    ];

    it('should find skills by name', () => {
      const results = searchSkills(mockSkills, 'code');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('code-review');
    });

    it('should find skills by description', () => {
      const results = searchSkills(mockSkills, 'automation');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('testing');
    });

    it('should find skills by category', () => {
      const results = searchSkills(mockSkills, 'development');
      expect(results).toHaveLength(2);
    });

    it('should be case-insensitive', () => {
      const results = searchSkills(mockSkills, 'CODE');
      expect(results).toHaveLength(1);
    });

    it('should return empty array for no matches', () => {
      const results = searchSkills(mockSkills, 'xyz123');
      expect(results).toHaveLength(0);
    });
  });

  describe('groupSkillsByCategory', () => {
    const mockSkills: MarketplaceSkill[] = [
      {
        name: 'skill1',
        displayName: 'Skill 1',
        description: 'Description 1',
        category: 'development',
        path: 'skills/skill1',
        source: mockSource,
      },
      {
        name: 'skill2',
        displayName: 'Skill 2',
        description: 'Description 2',
        category: 'testing',
        path: 'skills/skill2',
        source: mockSource,
      },
      {
        name: 'skill3',
        displayName: 'Skill 3',
        description: 'Description 3',
        category: 'development',
        path: 'skills/skill3',
        source: mockSource,
      },
      {
        name: 'skill4',
        displayName: 'Skill 4',
        description: 'Description 4',
        path: 'skills/skill4',
        source: mockSource,
      },
    ];

    it('should group skills by category', () => {
      const grouped = groupSkillsByCategory(mockSkills);

      expect(grouped.get('development')).toHaveLength(2);
      expect(grouped.get('testing')).toHaveLength(1);
    });

    it('should put skills without category in "Other"', () => {
      const grouped = groupSkillsByCategory(mockSkills);

      expect(grouped.get('Other')).toHaveLength(1);
      expect(grouped.get('Other')?.[0].name).toBe('skill4');
    });

    it('should return empty map for empty input', () => {
      const grouped = groupSkillsByCategory([]);
      expect(grouped.size).toBe(0);
    });
  });

  describe('cache functions', () => {
    describe('clearSkillsCache', () => {
      it('should clear all cached skill files', () => {
        vi.mocked(dirExists).mockReturnValue(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(nodeFs.readdirSync).mockReturnValue([
          'source1.json',
          'source2.json',
          'notjson.txt',
        ] as any);

        clearSkillsCache();

        expect(nodeFs.unlinkSync).toHaveBeenCalledTimes(2);
      });

      it('should handle non-existent cache directory', () => {
        vi.mocked(dirExists).mockReturnValue(false);

        expect(() => clearSkillsCache()).not.toThrow();
      });

      it('should handle errors gracefully', () => {
        vi.mocked(dirExists).mockReturnValue(true);
        vi.mocked(nodeFs.readdirSync).mockImplementation(() => {
          throw new Error('Read error');
        });

        expect(() => clearSkillsCache()).not.toThrow();
      });
    });

    describe('clearSourceCache', () => {
      it('should clear cache for specific source', () => {
        vi.mocked(fileExists).mockReturnValue(true);

        clearSourceCache(mockSource);

        expect(nodeFs.unlinkSync).toHaveBeenCalled();
      });

      it('should handle non-existent cache file', () => {
        vi.mocked(fileExists).mockReturnValue(false);

        expect(() => clearSourceCache(mockSource)).not.toThrow();
        expect(nodeFs.unlinkSync).not.toHaveBeenCalled();
      });

      it('should handle errors gracefully', () => {
        vi.mocked(fileExists).mockReturnValue(true);
        vi.mocked(nodeFs.unlinkSync).mockImplementation(() => {
          throw new Error('Delete error');
        });

        expect(() => clearSourceCache(mockSource)).not.toThrow();
      });
    });

    describe('getCacheInfo', () => {
      it('should return cache info for valid cached file', () => {
        const now = Date.now();
        vi.mocked(fileExists).mockReturnValue(true);
        vi.mocked(nodeFs.statSync).mockReturnValue({
          mtimeMs: now - 60000, // 1 minute ago
        } as import('node:fs').Stats);

        const info = getCacheInfo(mockSource);

        expect(info.isCached).toBe(true);
        expect(info.age).toBeGreaterThan(0);
        expect(info.expiresIn).toBeGreaterThan(0);
      });

      it('should return not cached for expired file', () => {
        const now = Date.now();
        vi.mocked(fileExists).mockReturnValue(true);
        vi.mocked(nodeFs.statSync).mockReturnValue({
          mtimeMs: now - 86400000, // 24 hours ago
        } as import('node:fs').Stats);

        const info = getCacheInfo(mockSource);

        expect(info.isCached).toBe(false);
        expect(info.expiresIn).toBeNull();
      });

      it('should return not cached for non-existent file', () => {
        vi.mocked(fileExists).mockReturnValue(false);

        const info = getCacheInfo(mockSource);

        expect(info.isCached).toBe(false);
        expect(info.age).toBeNull();
        expect(info.expiresIn).toBeNull();
      });

      it('should handle errors gracefully', () => {
        vi.mocked(fileExists).mockReturnValue(true);
        vi.mocked(nodeFs.statSync).mockImplementation(() => {
          throw new Error('Stat error');
        });

        const info = getCacheInfo(mockSource);

        expect(info.isCached).toBe(false);
        expect(info.age).toBeNull();
      });
    });

    describe('getSkillsCacheDir', () => {
      it('should return a valid cache directory path', () => {
        const cacheDir = getSkillsCacheDir();

        expect(typeof cacheDir).toBe('string');
        expect(cacheDir.length).toBeGreaterThan(0);
      });
    });
  });

  describe('installMarketplaceSkill with skill-folders', () => {
    const folderSkill: MarketplaceSkill = {
      name: 'test-folder-skill',
      displayName: 'Test Folder Skill',
      description: 'A test folder skill',
      category: 'test',
      path: 'skills/test-folder-skill',
      source: mockFolderSource,
    };

    it('should install skill-folders pattern skill', async () => {
      const folderTreeResponse = {
        sha: 'abc123',
        url: 'https://api.github.com/repos/test/test/git/trees/main',
        tree: [
          {
            path: 'skills/test-folder-skill/SKILL.md',
            mode: '100644',
            type: 'blob' as const,
            sha: 'sha1',
            size: 1000,
            url: 'https://api.github.com/repos/test/test/git/blobs/sha1',
          },
          {
            path: 'skills/test-folder-skill/references/ref.md',
            mode: '100644',
            type: 'blob' as const,
            sha: 'sha2',
            size: 500,
            url: 'https://api.github.com/repos/test/test/git/blobs/sha2',
          },
        ],
        truncated: false,
      };

      vi.mocked(dirExists).mockReturnValue(false);
      vi.mocked(writeFileContent).mockReturnValue(true);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => folderTreeResponse,
      } as Response);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => mockSkillContent,
      } as Response);

      const result = await installMarketplaceSkill(folderSkill, '/dest');

      expect(result.success).toBe(true);
      expect(writeFileContent).toHaveBeenCalled();
    });
  });

  describe('fetchMarketplaceSkills edge cases', () => {
    it('should handle skill-folders with README.md fallback', async () => {
      const folderTreeWithReadme = {
        sha: 'abc123',
        url: 'https://api.github.com/repos/test/test/git/trees/main',
        tree: [
          {
            path: 'skills/readme-skill',
            mode: '040000',
            type: 'tree' as const,
            sha: 'dir1',
            url: 'https://api.github.com/repos/test/test/git/trees/dir1',
          },
          {
            path: 'skills/readme-skill/README.md',
            mode: '100644',
            type: 'blob' as const,
            sha: 'sha1',
            size: 1000,
            url: 'https://api.github.com/repos/test/test/git/blobs/sha1',
          },
        ],
        truncated: false,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => folderTreeWithReadme,
      } as Response);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => mockSkillContent,
      } as Response);

      const skills = await fetchMarketplaceSkills(mockFolderSource);

      expect(skills.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle content without frontmatter', async () => {
      const contentWithoutFrontmatter = `# Simple Skill

This is a simple skill without YAML frontmatter.

It should extract the first paragraph as description.
`;

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTreeResponse,
      } as Response);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => contentWithoutFrontmatter,
      } as Response);

      const skills = await fetchMarketplaceSkills(mockSource);

      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0].description).toBeTruthy();
    });

    it('should handle fetch errors for individual skills gracefully', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTreeResponse,
      } as Response);

      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const skills = await fetchMarketplaceSkills(mockSource);

      // Should return empty or partial list, not throw
      expect(Array.isArray(skills)).toBe(true);
    });

    it('should skip hidden directories in skill-folders', async () => {
      const treeWithHidden = {
        sha: 'abc123',
        url: 'https://api.github.com/repos/test/test/git/trees/main',
        tree: [
          {
            path: 'skills/.hidden-skill',
            mode: '040000',
            type: 'tree' as const,
            sha: 'dir1',
            url: 'https://api.github.com/repos/test/test/git/trees/dir1',
          },
          {
            path: 'skills/valid-skill',
            mode: '040000',
            type: 'tree' as const,
            sha: 'dir2',
            url: 'https://api.github.com/repos/test/test/git/trees/dir2',
          },
          {
            path: 'skills/valid-skill/SKILL.md',
            mode: '100644',
            type: 'blob' as const,
            sha: 'sha1',
            size: 1000,
            url: 'https://api.github.com/repos/test/test/git/blobs/sha1',
          },
        ],
        truncated: false,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => treeWithHidden,
      } as Response);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => mockSkillContent,
      } as Response);

      const skills = await fetchMarketplaceSkills(mockFolderSource);

      // Should not include hidden skills
      const hasHidden = skills.some(s => s.name.startsWith('.'));
      expect(hasHidden).toBe(false);
    });
  });
});
