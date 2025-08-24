import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the wrapper under test
import { withSecurityValidation } from '../../src/mcp/tools/utils/withSecurityValidation.js';

// Mocks
const mockIsEnterpriseMode = vi.hoisted(() => vi.fn());
const mockGetUserContext = vi.hoisted(() => vi.fn());
const mockRateLimiterCheck = vi.hoisted(() => vi.fn());
const mockOrgValidate = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/enterpriseUtils.js', () => ({
  isEnterpriseMode: mockIsEnterpriseMode,
}));

vi.mock('../../src/github/userInfo.js', () => ({
  getUserContext: mockGetUserContext,
}));

vi.mock('../../src/security/rateLimiter.js', () => ({
  RateLimiter: {
    checkLimit: mockRateLimiterCheck,
  },
}));

vi.mock('../../src/security/organizationManager.js', () => ({
  OrganizationManager: {
    validateOrganizationAccess: mockOrgValidate,
  },
}));

describe('withSecurityValidation enterprise short-circuit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('does not fetch user context or perform enterprise checks when not in enterprise mode', async () => {
    mockIsEnterpriseMode.mockReturnValue(false);

    // Tool handler just echoes args
    const handler = vi.fn(async (args: { a: number }) => ({
      isError: false,
      content: [{ type: 'text' as const, text: `ok:${args.a}` }],
    }));

    const wrapped = withSecurityValidation(handler);
    const result = await wrapped({ a: 1 });

    expect(handler).toHaveBeenCalledOnce();
    expect(result.isError).toBe(false);

    // Short-circuit: none of these should be called
    expect(mockGetUserContext).not.toHaveBeenCalled();
    expect(mockRateLimiterCheck).not.toHaveBeenCalled();
    expect(mockOrgValidate).not.toHaveBeenCalled();
  });
  it('fetches user context and may perform enterprise checks in enterprise mode', async () => {
    mockIsEnterpriseMode.mockReturnValue(true);
    mockGetUserContext.mockResolvedValue({
      user: { id: 123, login: 'tester' },
      organizationId: 'org-1',
    });
    mockRateLimiterCheck.mockResolvedValue({ allowed: true });
    mockOrgValidate.mockResolvedValue({ valid: true, errors: [] });

    const handler = vi.fn(async (args: { a: number }) => ({
      isError: false,
      content: [{ type: 'text' as const, text: `ok:${args.a}` }],
    }));

    const wrapped = withSecurityValidation(handler);
    const result = await wrapped({ a: 2 });

    expect(handler).toHaveBeenCalledOnce();
    expect(result.isError).toBe(false);

    // Enterprise path hit
    expect(mockGetUserContext).toHaveBeenCalled();
    expect(mockRateLimiterCheck).toHaveBeenCalledWith('123', 'api', {
      increment: true,
    });
    expect(mockOrgValidate).toHaveBeenCalledWith('org-1', 'tester');
  });
});
