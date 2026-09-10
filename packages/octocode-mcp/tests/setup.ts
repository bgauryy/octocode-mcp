import { beforeEach, afterEach, afterAll, vi } from 'vitest';
import { resetCircuitBreaker } from '../../octocode-tools-core/src/utils/http/circuitBreaker.js';
import {
  consumeExpectedStderrWarning,
  resetExpectedStderrWarnings,
  shouldSuppressUnexpectedWarningFailure,
} from './warningPolicy.js';

process.setMaxListeners(50);

vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.resolve(new Response('', { status: 200 })))
);

const generateMockUUID = () => {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4';
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4) | 8];
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  return uuid;
};

const sessionMockState = {
  sessionId: generateMockUUID(),
  deleted: false,
};

const mockDefaultConfig = {
  version: 1,
  github: {
    apiUrl: 'https://api.github.com',
  },
  local: {
    enabled: true,
    enableClone: true,
    allowedPaths: [],
  },
  tools: {
    enabled: null,
    disabled: null,
  },
  network: {
    timeout: 30000,
    maxRetries: 3,
  },
  lsp: {
    configPath: undefined,
  },
  output: {
    format: 'yaml',
    pagination: {
      defaultCharLength: 8000,
    },
  },
  source: 'defaults',
  configPath: undefined,
};

function mockParseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return undefined;
  if (trimmed === 'true' || trimmed === '1') return true;
  if (trimmed === 'false' || trimmed === '0') return false;
  return undefined;
}

function mockParseIntEnv(value: string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = parseInt(trimmed, 10);
  if (isNaN(parsed)) return undefined;
  return parsed;
}

function mockParseStringArrayEnv(
  value: string | undefined
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

const buildMockConfig = () => {
  const envEnableLocal = mockParseBooleanEnv(process.env.ENABLE_LOCAL);
  const envEnableClone = mockParseBooleanEnv(process.env.ENABLE_CLONE);
  const envTimeout = mockParseIntEnv(process.env.REQUEST_TIMEOUT);
  const envMaxRetries = mockParseIntEnv(process.env.MAX_RETRIES);
  const envApiUrl = process.env.GITHUB_API_URL?.trim();
  const envToolsToRun = mockParseStringArrayEnv(process.env.TOOLS_TO_RUN);
  const envDisableTools = mockParseStringArrayEnv(process.env.DISABLE_TOOLS);

  let timeout = envTimeout ?? mockDefaultConfig.network.timeout;
  timeout = Math.max(5000, Math.min(300000, timeout));

  let maxRetries = envMaxRetries ?? mockDefaultConfig.network.maxRetries;
  maxRetries = Math.max(0, Math.min(10, maxRetries));

  return {
    ...mockDefaultConfig,
    github: {
      apiUrl: envApiUrl || mockDefaultConfig.github.apiUrl,
    },
    local: {
      ...mockDefaultConfig.local,
      enabled: envEnableLocal ?? mockDefaultConfig.local.enabled,
      enableClone: envEnableClone ?? mockDefaultConfig.local.enableClone,
      allowedPaths:
        mockParseStringArrayEnv(process.env.ALLOWED_PATHS) ??
        mockDefaultConfig.local.allowedPaths,
    },
    tools: {
      enabled: envToolsToRun ?? mockDefaultConfig.tools.enabled,
      disabled: envDisableTools ?? mockDefaultConfig.tools.disabled,
    },
    network: {
      timeout,
      maxRetries,
    },
  };
};

vi.mock('@octocodeai/octocode-tools-core/config', () => ({
  getConfigSync: vi.fn(() => buildMockConfig()),
  getConfig: vi.fn(async () => buildMockConfig()),
  _resetSessionState: vi.fn(() => {
    sessionMockState.sessionId = generateMockUUID();
    sessionMockState.deleted = false;
  }),
  getOrCreateSession: vi.fn(() => {
    if (sessionMockState.deleted) {
      sessionMockState.sessionId = generateMockUUID();
      sessionMockState.deleted = false;
    }
    return {
      version: 1,
      sessionId: sessionMockState.sessionId,
      createdAt: '2024-01-01T00:00:00.000Z',
      lastActiveAt: '2024-01-01T00:00:00.000Z',
      stats: { toolCalls: 0, errors: 0, rateLimits: 0 },
    };
  }),
  incrementToolCalls: vi.fn(() => ({ success: true })),
  incrementErrors: vi.fn(() => ({ success: true })),
  incrementRateLimits: vi.fn(() => ({ success: true })),
  updateSessionStats: vi.fn(() => ({ success: true })),
  incrementRateLimitByProvider: vi.fn(() => ({ success: true })),
  incrementToolCharSavings: vi.fn(() => ({ success: true })),
  incrementGitHubCacheHits: vi.fn(() => ({ success: true })),
  incrementGitHubCacheRateLimits: vi.fn(() => ({ success: true })),
  incrementPackageRegistryFailures: vi.fn(() => ({ success: true })),
  deleteSession: vi.fn(() => {
    sessionMockState.deleted = true;
    return true;
  }),
  ensureOctocodeDir: vi.fn(),
  OCTOCODE_DIR: '/mock/.octocode',
  getOctocodeDir: vi.fn(() => '/mock/.octocode'),
  getOctocodeToken: vi.fn().mockResolvedValue(null),
  getToken: vi.fn().mockResolvedValue(null),
  getTokenFromEnv: vi.fn(() => {
    const envVars = ['OCTOCODE_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];
    for (const v of envVars) {
      if (process.env[v]) return process.env[v];
    }
    return null;
  }),
  getEnvTokenSource: vi.fn(() => {
    if (process.env.OCTOCODE_TOKEN) return 'env:OCTOCODE_TOKEN';
    if (process.env.GH_TOKEN) return 'env:GH_TOKEN';
    if (process.env.GITHUB_TOKEN) return 'env:GITHUB_TOKEN';
    return null;
  }),
  resolveTokenFull: vi.fn(async () => {
    const envVars: Array<[string, string]> = [
      ['OCTOCODE_TOKEN', 'env:OCTOCODE_TOKEN'],
      ['GH_TOKEN', 'env:GH_TOKEN'],
      ['GITHUB_TOKEN', 'env:GITHUB_TOKEN'],
    ];
    for (const [envVar, source] of envVars) {
      const token = process.env[envVar];
      if (token) return { token, source, wasRefreshed: false };
    }
    return null;
  }),
  getDirectorySizeBytes: vi.fn(() => 0),
  formatBytes: vi.fn((b: number) => `${b} B`),
}));

export { sessionMockState };

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const enforceWarningFreeTests =
  process.env.OCTOCODE_ENFORCE_WARNING_FREE_TESTS === '1';

interface CapturedWarning {
  source: 'console.warn' | 'process.emitWarning' | 'process.stderr.write';
  message: string;
}

let capturedWarnings: CapturedWarning[] = [];

function formatWarningMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

function captureProcessWarning(warning: string | Error): void {
  capturedWarnings.push({
    source: 'process.emitWarning',
    message: formatWarningMessage(warning),
  });
}

function captureStderrWrite(chunk: string | Uint8Array): boolean {
  const message =
    typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');

  if (consumeExpectedStderrWarning(message)) {
    return true;
  }

  capturedWarnings.push({
    source: 'process.stderr.write',
    message: message.trimEnd(),
  });

  return true;
}

beforeEach(() => {
  sessionMockState.sessionId = generateMockUUID();
  sessionMockState.deleted = false;
  capturedWarnings = [];
  resetExpectedStderrWarnings();
  resetCircuitBreaker();

  if (enforceWarningFreeTests) {
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      capturedWarnings.push({
        source: 'console.warn',
        message: args.map(formatWarningMessage).join(' '),
      });
    });
    vi.spyOn(process, 'emitWarning').mockImplementation(
      captureProcessWarning as typeof process.emitWarning
    );
    vi.spyOn(process.stderr, 'write').mockImplementation(
      captureStderrWrite as typeof process.stderr.write
    );
  }

  if (!process.env.VITEST_DEBUG && !enforceWarningFreeTests) {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  }
});

afterEach(() => {
  sessionMockState.sessionId = generateMockUUID();
  sessionMockState.deleted = false;

  if (
    enforceWarningFreeTests &&
    capturedWarnings.length > 0 &&
    !shouldSuppressUnexpectedWarningFailure()
  ) {
    const warnings = capturedWarnings
      .map(warning => `${warning.source}: ${warning.message}`)
      .join('\n');

    throw new Error(
      `Unexpected warning emitted during contract test.\n${warnings}`
    );
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

process.env.NODE_ENV = 'test';
process.env.VITEST_TEST_MODE = '1';
process.env.GITHUB_TOKEN = 'test-token-for-vitest';

const originalUnhandledRejection = process.listeners('unhandledRejection');
const originalUncaughtException = process.listeners('uncaughtException');

process.removeAllListeners('unhandledRejection');
process.removeAllListeners('uncaughtException');

process.on('unhandledRejection', (reason, promise) => {
  if (
    reason instanceof Error &&
    reason.message.includes('process.exit called with code')
  ) {
    return;
  }

  if (
    reason instanceof Error &&
    (reason.message.includes('always fails') ||
      reason.message.includes('non-retryable error') ||
      reason.message.includes('retryable error'))
  ) {
    return;
  }

  originalUnhandledRejection.forEach(handler => {
    if (typeof handler === 'function') {
      handler(reason, promise);
    }
  });
});

process.on('uncaughtException', error => {
  if (error.message.includes('process.exit called with code')) {
    return;
  }

  originalUncaughtException.forEach(handler => {
    if (typeof handler === 'function') {
      handler(error, 'uncaughtException');
    }
  });
});
