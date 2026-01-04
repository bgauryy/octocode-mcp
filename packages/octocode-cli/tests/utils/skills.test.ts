/**
 * Skills Utilities Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the fs utilities module
vi.mock('../../src/utils/fs.js', () => ({
  dirExists: vi.fn(),
  copyDirectory: vi.fn(),
  listSubdirectories: vi.fn(),
}));

// Import the mocked module
import {
  dirExists,
  copyDirectory,
  listSubdirectories,
} from '../../src/utils/fs.js';
import {
  getSkillsSourcePath,
  copySkills,
  copySkill,
  getAvailableSkills,
} from '../../src/utils/skills.js';

describe('Skills Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSkillsSourcePath', () => {
    it('should return fromOut path when it exists', () => {
      vi.mocked(dirExists).mockImplementation((p: string) => {
        // Check if path ends with 'skills' and parent is one level up (fromOut pattern)
        return p.includes('skills') && !p.includes('../..');
      });

      const result = getSkillsSourcePath();
      expect(result).toMatch(/skills$/);
      expect(dirExists).toHaveBeenCalled();
    });

    it('should return fromSrc path when fromOut does not exist', () => {
      let callCount = 0;
      vi.mocked(dirExists).mockImplementation(() => {
        callCount++;
        // First call (fromOut) returns false, second call (fromSrc) returns true
        return callCount === 2;
      });

      const result = getSkillsSourcePath();
      expect(result).toMatch(/skills$/);
      expect(dirExists).toHaveBeenCalledTimes(2);
    });

    it('should throw error when neither path exists', () => {
      vi.mocked(dirExists).mockReturnValue(false);

      expect(() => getSkillsSourcePath()).toThrow('Skills directory not found');
      expect(dirExists).toHaveBeenCalledTimes(2);
    });

    it('should check fromOut path first', () => {
      const checkedPaths: string[] = [];
      vi.mocked(dirExists).mockImplementation((p: string) => {
        checkedPaths.push(p);
        return true; // Return true on first call
      });

      getSkillsSourcePath();

      // Should only check one path since first one exists
      expect(checkedPaths).toHaveLength(1);
      expect(checkedPaths[0]).toMatch(/skills$/);
    });
  });

  describe('copySkills', () => {
    it('should copy skills directory to destination', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(copyDirectory).mockReturnValue(true);

      const result = copySkills('/dest/skills');

      expect(result).toBe(true);
      expect(copyDirectory).toHaveBeenCalledWith(
        expect.stringMatching(/skills$/),
        '/dest/skills'
      );
    });

    it('should return false when copy fails', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(copyDirectory).mockReturnValue(false);

      const result = copySkills('/dest/skills');

      expect(result).toBe(false);
    });

    it('should throw when source path not found', () => {
      vi.mocked(dirExists).mockReturnValue(false);

      expect(() => copySkills('/dest/skills')).toThrow(
        'Skills directory not found'
      );
    });
  });

  describe('copySkill', () => {
    it('should copy specific skill to destination', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(copyDirectory).mockReturnValue(true);

      const result = copySkill('octocode-research', '/dest/skills');

      expect(result).toBe(true);
      expect(copyDirectory).toHaveBeenCalledWith(
        expect.stringMatching(/octocode-research$/),
        expect.stringMatching(/octocode-research$/)
      );
    });

    it('should return false when skill directory does not exist', () => {
      // First call for getSkillsSourcePath succeeds
      // Second call for skill path check fails
      let callCount = 0;
      vi.mocked(dirExists).mockImplementation(() => {
        callCount++;
        return callCount === 1; // Only source path exists, skill path doesn't
      });

      const result = copySkill('nonexistent-skill', '/dest/skills');

      expect(result).toBe(false);
      expect(copyDirectory).not.toHaveBeenCalled();
    });

    it('should return false when copy fails', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(copyDirectory).mockReturnValue(false);

      const result = copySkill('octocode-research', '/dest/skills');

      expect(result).toBe(false);
    });

    it('should construct correct destination path', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(copyDirectory).mockReturnValue(true);

      copySkill('octocode-plan', '/home/user/.claude/skills');

      expect(copyDirectory).toHaveBeenCalledWith(
        expect.any(String),
        '/home/user/.claude/skills/octocode-plan'
      );
    });

    it('should throw when source path not found', () => {
      vi.mocked(dirExists).mockReturnValue(false);

      expect(() => copySkill('octocode-research', '/dest')).toThrow(
        'Skills directory not found'
      );
    });
  });

  describe('getAvailableSkills', () => {
    it('should return skills starting with octocode-', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(listSubdirectories).mockReturnValue([
        'octocode-research',
        'octocode-plan',
        'octocode-generate',
        'other-skill',
        'random-dir',
      ]);

      const result = getAvailableSkills();

      expect(result).toEqual([
        'octocode-research',
        'octocode-plan',
        'octocode-generate',
      ]);
      expect(result).not.toContain('other-skill');
      expect(result).not.toContain('random-dir');
    });

    it('should return empty array when no skills found', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(listSubdirectories).mockReturnValue([]);

      const result = getAvailableSkills();

      expect(result).toEqual([]);
    });

    it('should return empty array when no octocode- prefixed skills', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(listSubdirectories).mockReturnValue([
        'other-skill',
        'random-dir',
      ]);

      const result = getAvailableSkills();

      expect(result).toEqual([]);
    });

    it('should filter out non-octocode prefixed directories', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(listSubdirectories).mockReturnValue([
        'octocode-pr-review',
        '.git',
        'node_modules',
        'octocode-test',
      ]);

      const result = getAvailableSkills();

      expect(result).toEqual(['octocode-pr-review', 'octocode-test']);
      expect(result).toHaveLength(2);
    });

    it('should call listSubdirectories with correct source path', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(listSubdirectories).mockReturnValue([]);

      getAvailableSkills();

      expect(listSubdirectories).toHaveBeenCalledWith(
        expect.stringMatching(/skills$/)
      );
    });

    it('should throw when source path not found', () => {
      vi.mocked(dirExists).mockReturnValue(false);

      expect(() => getAvailableSkills()).toThrow('Skills directory not found');
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical install workflow', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(listSubdirectories).mockReturnValue([
        'octocode-research',
        'octocode-plan',
        'octocode-generate',
        'octocode-pr-review',
      ]);
      vi.mocked(copyDirectory).mockReturnValue(true);

      // Get available skills
      const skills = getAvailableSkills();
      expect(skills).toHaveLength(4);

      // Copy all skills
      const copyAllResult = copySkills('/home/user/.claude/skills');
      expect(copyAllResult).toBe(true);

      // Copy individual skill
      const copyOneResult = copySkill(
        'octocode-research',
        '/home/user/.claude/skills'
      );
      expect(copyOneResult).toBe(true);
    });

    it('should handle partial failure gracefully', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(copyDirectory)
        .mockReturnValueOnce(true) // First copy succeeds
        .mockReturnValueOnce(false); // Second copy fails

      const result1 = copySkill('octocode-research', '/dest');
      const result2 = copySkill('octocode-plan', '/dest');

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });
  });
});
