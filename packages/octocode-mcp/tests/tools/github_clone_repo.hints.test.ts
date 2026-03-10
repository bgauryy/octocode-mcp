/**
 * Branch coverage tests for github_clone_repo/hints.ts
 * Targets: error hints for permission, not_found, timeout errorType values
 */

import { describe, it, expect } from 'vitest';
import type { HintContext } from '../../src/types/metadata.js';
import { hints } from '../../src/tools/github_clone_repo/hints.js';

describe('githubCloneRepo hints - branch coverage', () => {
  describe('error hints', () => {
    it('returns permission hint when errorType is permission', () => {
      const ctx: HintContext = { errorType: 'permission' };
      const result = hints.error!(ctx);
      expect(result).toContain(
        'Check that your token has repository read access for this repo.'
      );
    });

    it('returns not_found hint when errorType is not_found', () => {
      const ctx: HintContext = { errorType: 'not_found' };
      const result = hints.error!(ctx);
      expect(result).toContain(
        'Verify the owner/repo name and branch. The repository may be private or deleted.'
      );
    });

    it('returns timeout hint when errorType is timeout', () => {
      const ctx: HintContext = { errorType: 'timeout' };
      const result = hints.error!(ctx);
      expect(result).toContain(
        'Clone timed out. Try using sparse_path to clone only a subdirectory.'
      );
    });

    it('returns empty array when errorType is not permission/not_found/timeout', () => {
      const ctx: HintContext = { errorType: 'size_limit' };
      const result = hints.error!(ctx);
      expect(result).toEqual([]);
    });

    it('returns empty array when errorType is undefined', () => {
      const result = hints.error!({});
      expect(result).toEqual([]);
    });
  });
});
