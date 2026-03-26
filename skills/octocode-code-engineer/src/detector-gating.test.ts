import { describe, expect, it } from 'vitest';

import { resolveEnabledPillars } from './index.js';

describe('resolveEnabledPillars', () => {
  it('enables all pillars when no feature filter is provided', () => {
    expect(resolveEnabledPillars(null)).toEqual({
      architecture: true,
      codeQuality: true,
      deadCode: true,
      security: true,
      testQuality: true,
    });
  });

  it('enables only security for security-only categories', () => {
    expect(resolveEnabledPillars(new Set(['hardcoded-secret']))).toEqual({
      architecture: false,
      codeQuality: false,
      deadCode: false,
      security: true,
      testQuality: false,
    });
  });

  it('enables only test quality for test-quality-only categories', () => {
    expect(resolveEnabledPillars(new Set(['missing-mock-restoration']))).toEqual({
      architecture: false,
      codeQuality: false,
      deadCode: false,
      security: false,
      testQuality: true,
    });
  });

  it('enables dead code categories explicitly', () => {
    expect(resolveEnabledPillars(new Set(['dead-export']))).toEqual({
      architecture: false,
      codeQuality: false,
      deadCode: true,
      security: false,
      testQuality: false,
    });
  });

  it('enables multiple pillars when categories span pillars', () => {
    expect(
      resolveEnabledPillars(
        new Set(['dependency-cycle', 'cognitive-complexity', 'hardcoded-secret'])
      )
    ).toEqual({
      architecture: true,
      codeQuality: true,
      deadCode: false,
      security: true,
      testQuality: false,
    });
  });
});
