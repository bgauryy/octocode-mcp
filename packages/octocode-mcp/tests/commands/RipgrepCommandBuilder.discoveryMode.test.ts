/**
 * Discovery Mode Tests (OCTO-2026-001)
 *
 * These tests validate discovery mode behavior:
 * - Discovery mode uses -c (count) for file discovery with accurate per-file match counts
 * - Plain text modes (filesOnly, filesWithoutMatch, count, countMatches) never use --json
 * - Normal modes (paginated, detailed, default) use --json for structured output
 */

import { describe, it, expect } from 'vitest';
import { RipgrepCommandBuilder } from '../../src/commands/RipgrepCommandBuilder.js';
import {
  RipgrepQuerySchema,
  applyWorkflowMode,
} from '../../src/tools/local_ripgrep/scheme.js';

const createQuery = (query: Parameters<typeof RipgrepQuerySchema.parse>[0]) =>
  RipgrepQuerySchema.parse({
    researchGoal: 'Test',
    reasoning: 'Schema validation',
    ...query,
  });

describe('RipgrepCommandBuilder - Discovery Mode', () => {
  /**
   * ============================================================
   * PLAIN TEXT MODE TESTS
   * These modes output plain text and must NOT use --json
   * ============================================================
   */
  describe('Plain Text Modes: No --json flag', () => {
    it('should NOT have --json for discovery mode (uses -c)', () => {
      const query = createQuery({
        pattern: 'searchPattern',
        path: '/project/src',
        mode: 'discovery',
      });

      const configuredQuery = applyWorkflowMode(query);
      expect(configuredQuery.count).toBe(true);

      const { args } = new RipgrepCommandBuilder()
        .fromQuery(configuredQuery)
        .build();

      expect(args).toContain('-c');
      expect(args).not.toContain('--json');
    });

    it('should NOT have --json for explicit filesOnly=true (uses -l)', () => {
      const query = createQuery({
        pattern: 'test',
        path: './src',
        filesOnly: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-l');
      expect(args).not.toContain('--json');
    });

    it('should NOT have --json for filesWithoutMatch', () => {
      const query = createQuery({
        pattern: 'deprecated',
        path: './src',
        filesWithoutMatch: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--files-without-match');
      expect(args).not.toContain('--json');
    });

    it('should NOT have --json for count mode', () => {
      const query = createQuery({
        pattern: 'TODO',
        path: './src',
        count: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-c');
      expect(args).not.toContain('--json');
    });

    it('should NOT have --json for countMatches mode', () => {
      const query = createQuery({
        pattern: 'TODO',
        path: './src',
        countMatches: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--count-matches');
      expect(args).not.toContain('--json');
    });
  });

  /**
   * ============================================================
   * DISCOVERY MODE DEFAULTS
   * Discovery mode now sets count=true for per-file match counts
   * ============================================================
   */
  describe('Discovery Mode Defaults', () => {
    it('should have -c flag WITHOUT --json for discovery mode', () => {
      const query = createQuery({
        pattern: 'findMe',
        path: '/src',
        mode: 'discovery',
      });

      const configuredQuery = applyWorkflowMode(query);
      const { args } = new RipgrepCommandBuilder()
        .fromQuery(configuredQuery)
        .build();

      expect(args).toContain('-c');
      expect(args).not.toContain('--json');
      expect(args).not.toContain('-l');
    });

    it('should correctly apply discovery mode defaults (count + smartCase)', () => {
      const query = createQuery({
        pattern: 'search',
        path: '/repo',
        mode: 'discovery',
      });

      const configuredQuery = applyWorkflowMode(query);

      expect(configuredQuery.count).toBe(true);
      expect(configuredQuery.smartCase).toBe(true);
      // filesOnly should NOT be set by discovery mode
      expect(configuredQuery.filesOnly).toBeUndefined();
    });
  });

  /**
   * ============================================================
   * REGRESSION TESTS
   * Normal modes still use JSON for structured output
   * ============================================================
   */
  describe('Regression: Normal Modes Still Use JSON', () => {
    it('should have --json for mode="paginated"', () => {
      const query = createQuery({
        pattern: 'export',
        path: './src',
        mode: 'paginated',
      });

      const configuredQuery = applyWorkflowMode(query);
      const { args } = new RipgrepCommandBuilder()
        .fromQuery(configuredQuery)
        .build();

      expect(args).toContain('--json');
      expect(args).not.toContain('-l');
      expect(args).not.toContain('-c');
    });

    it('should have --json for mode="detailed"', () => {
      const query = createQuery({
        pattern: 'function',
        path: './src',
        mode: 'detailed',
      });

      const configuredQuery = applyWorkflowMode(query);
      const { args } = new RipgrepCommandBuilder()
        .fromQuery(configuredQuery)
        .build();

      expect(args).toContain('--json');
      expect(args).not.toContain('-l');
    });

    it('should have --json for default mode (no mode specified)', () => {
      const query = createQuery({
        pattern: 'import',
        path: './src',
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--json');
      expect(args).not.toContain('-l');
    });

    it('should have -l flag WITHOUT --json for explicit filesOnly', () => {
      const query = createQuery({
        pattern: 'auth',
        path: './src',
        filesOnly: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-l');
      expect(args).not.toContain('--json');
    });
  });

  /**
   * ============================================================
   * EDGE CASE TESTS
   * ============================================================
   */
  describe('Edge Cases', () => {
    it('should handle discovery mode with additional filters', () => {
      const query = createQuery({
        pattern: 'Component',
        path: './src',
        mode: 'discovery',
        type: 'tsx',
        excludeDir: ['node_modules', 'dist'],
      });

      const configuredQuery = applyWorkflowMode(query);
      const { args } = new RipgrepCommandBuilder()
        .fromQuery(configuredQuery)
        .build();

      // Should have -c without --json
      expect(args).toContain('-c');
      expect(args).not.toContain('--json');

      // Other filters should work
      expect(args).toContain('-t');
      expect(args).toContain('tsx');
      expect(args).toContain('!node_modules/');
      expect(args).toContain('!dist/');
    });

    it('should handle explicit filesOnly=false override', () => {
      const query = createQuery({
        pattern: 'test',
        path: './src',
        filesOnly: false, // Explicitly set to false
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      // Should have JSON, not -l
      expect(args).toContain('--json');
      expect(args).not.toContain('-l');
    });
  });

  /**
   * ============================================================
   * REAL-WORLD SCENARIO TESTS
   * ============================================================
   */
  describe('Real-World Scenarios', () => {
    it('should work for quick file discovery in large codebase', () => {
      // Common use case: "find all files containing 'useState'"
      const query = createQuery({
        pattern: 'useState',
        path: '/large/project/src',
        mode: 'discovery',
        type: 'tsx',
      });

      const configuredQuery = applyWorkflowMode(query);
      const { args } = new RipgrepCommandBuilder()
        .fromQuery(configuredQuery)
        .build();

      // Should generate valid ripgrep command with -c
      expect(args).toContain('-c');
      expect(args).not.toContain('--json');
      expect(args).toContain('useState');
      expect(args).toContain('/large/project/src');
    });

    it('should work for finding files without deprecated code', () => {
      // Use case: "find files that DON'T contain deprecated API"
      const query = createQuery({
        pattern: '@deprecated',
        path: './src',
        filesWithoutMatch: true,
        type: 'ts',
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--files-without-match');
      expect(args).not.toContain('--json');
    });

    it('should work in MCPHub Docker environment scenario', () => {
      // Original bug report scenario — discovery mode uses -c (no --json)
      const query = createQuery({
        pattern: 'somePattern',
        path: '/data/code/myproject',
        mode: 'discovery',
        type: 'py',
      });

      const configuredQuery = applyWorkflowMode(query);
      const { args } = new RipgrepCommandBuilder()
        .fromQuery(configuredQuery)
        .build();

      // No --json in plain text modes
      expect(args).not.toContain('--json');
      // Should have the correct flag
      expect(args).toContain('-c');
    });
  });
});
