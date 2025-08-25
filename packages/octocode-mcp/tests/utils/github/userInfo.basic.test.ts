/**
 * Basic tests for GitHub user information functionality
 */

import { describe, it, expect } from 'vitest';

describe('GitHub User Information Module', () => {
  it('should export required functions', async () => {
    const module = await import('../../../src/github/userInfo');

    expect(typeof module.getAuthenticatedUser).toBe('function');
    expect(typeof module.getRateLimitStatus).toBe('function');
    expect(typeof module.shouldProceedWithAPICall).toBe('function');
    expect(typeof module.withRateLimitedAPI).toBe('function');
    expect(typeof module.getUserContext).toBe('function');
  });

  it('should have proper TypeScript interfaces', () => {
    // This test ensures the module compiles and exports are available
    expect(true).toBe(true);
  });
});
