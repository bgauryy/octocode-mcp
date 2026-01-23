/**
 * Bug Fix Tests: Discovery Mode Flag Conflict (OCTO-2026-001)
 *
 * These tests validate the fix for the ripgrep flag conflict bug where
 * `--files-with-matches` (-l) and `--json` flags were passed together,
 * causing ripgrep to fail.
 *
 * TDD Approach:
 * - Tests are written BEFORE the fix
 * - Tests FAIL on current (buggy) code
 * - Tests PASS after the fix is applied
 *
 * Bug Root Cause:
 * - mode="discovery" sets filesOnly=true
 * - filesOnly=true adds -l flag (files-with-matches)
 * - --json is added unconditionally
 * - ripgrep rejects: "-l cannot be used with --json"
 *
 * Fix:
 * - Make --json conditional: don't add it when filesOnly or filesWithoutMatch is true
 */

import { describe, it, expect } from 'vitest';
import { RipgrepCommandBuilder } from '../../src/commands/RipgrepCommandBuilder.js';
import {
  RipgrepQuerySchema,
  applyWorkflowMode,
} from '../../src/tools/local_ripgrep/scheme.js';

const createQuery = (query: Parameters<typeof RipgrepQuerySchema.parse>[0]) =>
  RipgrepQuerySchema.parse(query);

describe('RipgrepCommandBuilder - Discovery Mode Flag Conflict Fix', () => {
  /**
   * ============================================================
   * BUG REPRODUCTION TESTS
   * These tests demonstrate the bug exists
   * ============================================================
   */
  describe('Bug Reproduction: Flag Conflict Detection', () => {
    it('should NOT have both -l and --json flags (discovery mode)', () => {
      // This is the core bug: mode="discovery" sets filesOnly=true,
      // which adds -l, but --json is also added unconditionally.
      // Ripgrep cannot use both flags together.

      const query = createQuery({
        pattern: 'searchPattern',
        path: '/project/src',
        mode: 'discovery',
      });

      // Apply workflow mode to set filesOnly=true
      const configuredQuery = applyWorkflowMode(query);
      expect(configuredQuery.filesOnly).toBe(true);

      // Build the ripgrep command
      const { args } = new RipgrepCommandBuilder()
        .fromQuery(configuredQuery)
        .build();

      // THE BUG: Both flags are present, causing ripgrep to fail
      const hasFilesOnlyFlag = args.includes('-l');
      const hasJsonFlag = args.includes('--json');

      // This assertion captures the bug:
      // If both flags are present, ripgrep will error with:
      // "error: The argument '--files-with-matches' cannot be used with '--json'"
      expect(hasFilesOnlyFlag && hasJsonFlag).toBe(false);
    });

    it('should NOT have both -l and --json flags (explicit filesOnly=true)', () => {
      const query = createQuery({
        pattern: 'test',
        path: './src',
        filesOnly: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      const hasFilesOnlyFlag = args.includes('-l');
      const hasJsonFlag = args.includes('--json');

      // Both flags together = ripgrep error
      expect(hasFilesOnlyFlag && hasJsonFlag).toBe(false);
    });

    it('should NOT have both --files-without-match and --json flags', () => {
      const query = createQuery({
        pattern: 'deprecated',
        path: './src',
        filesWithoutMatch: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      const hasFilesWithoutMatchFlag = args.includes('--files-without-match');
      const hasJsonFlag = args.includes('--json');

      // Both flags together = ripgrep error
      expect(hasFilesWithoutMatchFlag && hasJsonFlag).toBe(false);
    });
  });

  /**
   * ============================================================
   * FIX VALIDATION TESTS
   * These tests verify the fix works correctly
   * ============================================================
   */
  describe('Fix Validation: Correct Flag Usage', () => {
    it('should have -l flag WITHOUT --json for discovery mode', () => {
      const query = createQuery({
        pattern: 'findMe',
        path: '/src',
        mode: 'discovery',
      });

      const configuredQuery = applyWorkflowMode(query);
      const { args } = new RipgrepCommandBuilder()
        .fromQuery(configuredQuery)
        .build();

      // After fix: -l should be present, --json should NOT
      expect(args).toContain('-l');
      expect(args).not.toContain('--json');
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

    it('should have --files-without-match flag WITHOUT --json', () => {
      const query = createQuery({
        pattern: 'unused',
        path: './src',
        filesWithoutMatch: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--files-without-match');
      expect(args).not.toContain('--json');
    });
  });

  /**
   * ============================================================
   * REGRESSION TESTS
   * These tests ensure normal functionality still works
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

      // Paginated mode needs JSON for match details
      expect(args).toContain('--json');
      expect(args).not.toContain('-l');
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

      // Detailed mode needs JSON for match details
      expect(args).toContain('--json');
      expect(args).not.toContain('-l');
    });

    it('should have --json for default mode (no mode specified)', () => {
      const query = createQuery({
        pattern: 'import',
        path: './src',
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      // Default mode needs JSON for match details
      expect(args).toContain('--json');
      expect(args).not.toContain('-l');
    });

    it('should have --json for count mode', () => {
      // Count mode with --json outputs JSON with counts
      const query = createQuery({
        pattern: 'TODO',
        path: './src',
        count: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-c');
      // Note: -c (count) IS compatible with --json in ripgrep
      expect(args).toContain('--json');
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

      // Should still have -l without --json
      expect(args).toContain('-l');
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

    it('should correctly apply discovery mode defaults', () => {
      const query = createQuery({
        pattern: 'search',
        path: '/repo',
        mode: 'discovery',
      });

      const configuredQuery = applyWorkflowMode(query);

      // Discovery mode should set these defaults
      expect(configuredQuery.filesOnly).toBe(true);
      expect(configuredQuery.smartCase).toBe(true);
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

      // Should generate valid ripgrep command
      expect(args).toContain('-l');
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
      // Original bug report scenario
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

      // This should NOT produce conflicting flags
      const flagConflict = args.includes('-l') && args.includes('--json');
      expect(flagConflict).toBe(false);

      // Should have the correct flag
      expect(args).toContain('-l');
    });
  });
});
