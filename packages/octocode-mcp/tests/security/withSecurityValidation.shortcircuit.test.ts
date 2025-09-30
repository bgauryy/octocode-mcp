import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the wrapper under test
import { withSecurityValidation } from '../../src/security/withSecurityValidation.js';

// Mocks
const mockIsEnterpriseMode = vi.hoisted(() => vi.fn());
const mockGetUserContext = vi.hoisted(() => vi.fn());
const mockOrgValidate = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/enterpriseUtils.js', () => ({
  isEnterpriseMode: mockIsEnterpriseMode,
}));

vi.mock('../../src/github/userInfo.js', () => ({
  getUserContext: mockGetUserContext,
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

    const wrapped = withSecurityValidation('test_tool', handler);
    const result = await wrapped(
      { a: 1 },
      { authInfo: undefined, sessionId: undefined }
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(result.isError).toBe(false);

    // Short-circuit: none of these should be called
    expect(mockGetUserContext).not.toHaveBeenCalled();
    expect(mockOrgValidate).not.toHaveBeenCalled();
  });
  it.skip('fetches user context and may perform enterprise checks in enterprise mode (DISABLED: enterprise features removed)', async () => {
    mockIsEnterpriseMode.mockReturnValue(true);
    mockGetUserContext.mockResolvedValue({
      user: { id: 123, login: 'tester' },
      organizationId: 'org-1',
    });
    mockOrgValidate.mockResolvedValue({ valid: true, errors: [] });

    const handler = vi.fn(async (args: { a: number }) => ({
      isError: false,
      content: [{ type: 'text' as const, text: `ok:${args.a}` }],
    }));

    const wrapped = withSecurityValidation('test_tool', handler);
    const result = await wrapped(
      { a: 2 },
      { authInfo: undefined, sessionId: undefined }
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(result.isError).toBe(false);

    // Enterprise path hit
    expect(mockGetUserContext).toHaveBeenCalled();
    expect(mockOrgValidate).toHaveBeenCalledWith('org-1', 'tester');
  });
});
