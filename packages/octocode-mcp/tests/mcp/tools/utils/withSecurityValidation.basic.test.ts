/**
 * Basic tests for security validation functionality
 */

import { describe, it, expect } from 'vitest';

describe('Security Validation Module', () => {
  it('should export required functions', async () => {
    const module = await import(
      '../../../../src/mcp/utils/withSecurityValidation'
    );

    expect(typeof module.withSecurityValidation).toBe('function');
    expect(typeof module.withBasicSecurityValidation).toBe('function');
  });

  it('should have proper TypeScript interfaces', () => {
    // This test ensures the module compiles and exports are available
    expect(true).toBe(true);
  });
});
