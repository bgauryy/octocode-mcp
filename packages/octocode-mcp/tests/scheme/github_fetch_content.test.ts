import { describe, it, expect } from 'vitest';
import {
  FileContentQuerySchema,
  FileContentBulkQuerySchema,
} from '../../src/scheme/github_fetch_content.js';

describe('FileContentQuerySchema', () => {
  describe('Valid parameters', () => {
    it('should validate basic required parameters', () => {
      const validQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find main entry point',
        reasoning: 'To understand the codebase structure',
      };

      const result = FileContentQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should apply defaults for optional parameters', () => {
      const validQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find main entry point',
        reasoning: 'To understand the codebase structure',
      };

      const result = FileContentQuerySchema.parse(validQuery);
      expect(result.minified).toBe(true); // Default
      expect(result.sanitize).toBe(true); // Default
      expect(result.fullContent).toBe(false); // Default
      expect(result.matchStringContextLines).toBe(5); // Default
    });

    it('should validate with optional branch parameter', () => {
      const validQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        branch: 'main',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find main entry point',
        reasoning: 'To understand the codebase structure',
      };

      const result = FileContentQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate with matchString parameter', () => {
      const validQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        matchString: 'export function',
        matchStringContextLines: 10,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find exports',
        reasoning: 'To find exported functions',
      };

      const result = FileContentQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate with line range parameters', () => {
      const validQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        startLine: 10,
        endLine: 50,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Read specific lines',
        reasoning: 'To understand a specific section',
      };

      const result = FileContentQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate with fullContent flag', () => {
      const validQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        fullContent: true,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Read entire file',
        reasoning: 'To understand the full implementation',
      };

      const result = FileContentQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });
  });

  describe('Owner validation', () => {
    it('should reject empty owner', () => {
      const invalidQuery = {
        owner: '',
        repo: 'vscode',
        path: 'src/index.ts',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find main entry point',
        reasoning: 'To understand the codebase structure',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject owner exceeding max length (200)', () => {
      const invalidQuery = {
        owner: 'a'.repeat(201),
        repo: 'vscode',
        path: 'src/index.ts',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find main entry point',
        reasoning: 'To understand the codebase structure',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should accept owner at max length (200)', () => {
      const validQuery = {
        owner: 'a'.repeat(200),
        repo: 'vscode',
        path: 'src/index.ts',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find main entry point',
        reasoning: 'To understand the codebase structure',
      };

      const result = FileContentQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });
  });

  describe('Repo validation', () => {
    it('should reject empty repo', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: '',
        path: 'src/index.ts',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find main entry point',
        reasoning: 'To understand the codebase structure',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject repo exceeding max length (150)', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'a'.repeat(151),
        path: 'src/index.ts',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find main entry point',
        reasoning: 'To understand the codebase structure',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });
  });

  describe('Branch validation', () => {
    it('should reject empty branch when provided', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        branch: '',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find main entry point',
        reasoning: 'To understand the codebase structure',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject branch exceeding max length (255)', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        branch: 'a'.repeat(256),
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find main entry point',
        reasoning: 'To understand the codebase structure',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });
  });

  describe('Line range validation', () => {
    it('should reject startLine without endLine', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        startLine: 10,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Read specific lines',
        reasoning: 'To understand a specific section',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('parameterConflict');
      }
    });

    it('should reject endLine without startLine', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        endLine: 50,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Read specific lines',
        reasoning: 'To understand a specific section',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('parameterConflict');
      }
    });

    it('should reject startLine less than 1', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        startLine: 0,
        endLine: 50,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Read specific lines',
        reasoning: 'To understand a specific section',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject endLine less than 1', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        startLine: 10,
        endLine: 0,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Read specific lines',
        reasoning: 'To understand a specific section',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer startLine', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        startLine: 10.5,
        endLine: 50,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Read specific lines',
        reasoning: 'To understand a specific section',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });
  });

  describe('Parameter conflict validation', () => {
    it('should reject fullContent with startLine', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        fullContent: true,
        startLine: 10,
        endLine: 50,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Read file',
        reasoning: 'To understand the code',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('parameterConflict');
      }
    });

    it('should reject fullContent with matchString', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        fullContent: true,
        matchString: 'export function',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Read file',
        reasoning: 'To understand the code',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('parameterConflict');
      }
    });

    it('should reject fullContent with both startLine and matchString', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        fullContent: true,
        startLine: 10,
        endLine: 50,
        matchString: 'export function',
        mainResearchGoal: 'Test goal',
        researchGoal: 'Read file',
        reasoning: 'To understand the code',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('parameterConflict');
      }
    });
  });

  describe('MatchString validation', () => {
    it('should validate matchStringContextLines range', () => {
      const validQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        matchString: 'export function',
        matchStringContextLines: 1,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find exports',
        reasoning: 'To find exported functions',
      };

      const result = FileContentQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should reject matchStringContextLines less than 1', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        matchString: 'export function',
        matchStringContextLines: 0,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find exports',
        reasoning: 'To find exported functions',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject matchStringContextLines greater than 50', () => {
      const invalidQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        matchString: 'export function',
        matchStringContextLines: 51,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find exports',
        reasoning: 'To find exported functions',
      };

      const result = FileContentQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should accept matchStringContextLines at maximum (50)', () => {
      const validQuery = {
        owner: 'microsoft',
        repo: 'vscode',
        path: 'src/index.ts',
        matchString: 'export function',
        matchStringContextLines: 50,
        mainResearchGoal: 'Test goal',
        researchGoal: 'Find exports',
        reasoning: 'To find exported functions',
      };

      const result = FileContentQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });
  });
});

describe('FileContentBulkQuerySchema', () => {
  it('should validate single query', () => {
    const validBulkQuery = {
      queries: [
        {
          owner: 'microsoft',
          repo: 'vscode',
          path: 'src/index.ts',
          mainResearchGoal: 'Test goal',
          researchGoal: 'Find main entry point',
          reasoning: 'To understand the codebase structure',
        },
      ],
    };

    const result = FileContentBulkQuerySchema.safeParse(validBulkQuery);
    expect(result.success).toBe(true);
  });

  it('should validate multiple queries', () => {
    const validBulkQuery = {
      queries: [
        {
          owner: 'microsoft',
          repo: 'vscode',
          path: 'src/index.ts',
          mainResearchGoal: 'Test goal',
          researchGoal: 'Find main entry point',
          reasoning: 'To understand the codebase structure',
        },
        {
          owner: 'facebook',
          repo: 'react',
          path: 'packages/react/index.js',
          matchString: 'export',
          mainResearchGoal: 'Test goal',
          researchGoal: 'Find React exports',
          reasoning: 'To understand React API',
        },
      ],
    };

    const result = FileContentBulkQuerySchema.safeParse(validBulkQuery);
    expect(result.success).toBe(true);
  });

  it('should reject more than 3 queries', () => {
    const invalidBulkQuery = {
      queries: [
        {
          owner: 'microsoft',
          repo: 'vscode',
          path: 'src/index.ts',
          mainResearchGoal: 'Test goal',
          researchGoal: 'Find main entry point',
          reasoning: 'To understand the codebase structure',
        },
        {
          owner: 'facebook',
          repo: 'react',
          path: 'index.js',
          mainResearchGoal: 'Test goal',
          researchGoal: 'Find React',
          reasoning: 'Test',
        },
        {
          owner: 'google',
          repo: 'angular',
          path: 'index.js',
          mainResearchGoal: 'Test goal',
          researchGoal: 'Find Angular',
          reasoning: 'Test',
        },
        {
          owner: 'vuejs',
          repo: 'vue',
          path: 'index.js',
          mainResearchGoal: 'Test goal',
          researchGoal: 'Find Vue',
          reasoning: 'Test',
        },
      ],
    };

    const result = FileContentBulkQuerySchema.safeParse(invalidBulkQuery);
    expect(result.success).toBe(false);
  });

  it('should reject empty queries array', () => {
    const invalidBulkQuery = {
      queries: [],
    };

    const result = FileContentBulkQuerySchema.safeParse(invalidBulkQuery);
    expect(result.success).toBe(false);
  });

  it('should validate each query independently', () => {
    const invalidBulkQuery = {
      queries: [
        {
          owner: 'microsoft',
          repo: 'vscode',
          path: 'src/index.ts',
          mainResearchGoal: 'Test goal',
          researchGoal: 'Find main entry point',
          reasoning: 'To understand the codebase structure',
        },
        {
          owner: '', // Invalid
          repo: 'react',
          path: 'index.js',
          mainResearchGoal: 'Test goal',
          researchGoal: 'Find React',
          reasoning: 'Test',
        },
      ],
    };

    const result = FileContentBulkQuerySchema.safeParse(invalidBulkQuery);
    expect(result.success).toBe(false);
  });
});
