# Octocode MCP - Implementation Recommendations

## 🔴 Phase 1: Security & Stability (HIGH PRIORITY)

### 1.1 Consistent Error Handling Across Resources

**Issue**: Resources lack robust error handling found in tools.

**Current State**: Basic try-catch with minimal error information
**Target State**: Standardized error responses with troubleshooting guidance

**Implementation**:
```typescript
// Create standardized error handler
interface ResourceErrorResponse {
  error: string;
  message: string;
  timestamp: string;
  troubleshooting?: Record<string, string[]>;
  error_code?: string;
}

const createResourceErrorResponse = (
  uri: string, 
  error: unknown, 
  context: string,
  troubleshooting?: Record<string, string[]>
): ResourceResponse => ({
  contents: [{
    uri,
    mimeType: 'application/json',
    text: JSON.stringify({
      error: 'Resource temporarily unavailable',
      message: `${context}: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
      troubleshooting: troubleshooting || {
        common_solutions: [
          'Check authentication status',
          'Verify CLI tool installation',
          'Check network connectivity'
        ]
      },
      error_code: `ERR_${context.toUpperCase().replace(/\s+/g, '_')}`
    }, null, 2)
  }]
});
```

**Priority**: CRITICAL - Affects all resource reliability

### 1.2 Command Execution Security

**Issue**: Direct command execution without proper sanitization.

**Risk**: Command injection vulnerabilities

**Implementation**:
```typescript
// Safe command execution wrapper
class SecureCommandExecutor {
  private static readonly ALLOWED_COMMANDS = {
    gh: ['auth', 'api', 'repo', 'pr', 'issue', 'user', '--version'],
    npm: ['--version', 'config', 'ping', 'whoami']
  } as const;

  static safeExec(command: string, args: string[] = [], timeout = 10000): string {
    const [baseCmd, subCmd] = command.split(' ', 2);
    
    if (!this.ALLOWED_COMMANDS[baseCmd]?.includes(subCmd)) {
      throw new Error(`Command not allowed: ${command}`);
    }

    return execSync(command, {
      encoding: 'utf-8',
      timeout,
      env: this.getSafeEnvironment()
    }).trim();
  }

  private static getSafeEnvironment() {
    return {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      // Explicitly exclude sensitive variables
      NPM_TOKEN: undefined,
      GITHUB_TOKEN: undefined
    };
  }
}
```

**Priority**: CRITICAL - Security vulnerability

### 1.3 Input Validation & Sanitization

**Issue**: Minimal validation of inputs in prompts and resources.

**Implementation**:
```typescript
// Enhanced validation schemas
const secureValidation = {
  repository: z.string()
    .min(3, 'Repository name too short')
    .max(100, 'Repository name too long')
    .regex(/^[\w\-\.]+\/[\w\-\.]+$/, 'Invalid repository format')
    .transform(repo => repo.toLowerCase()),
    
  githubUser: z.string()
    .min(1, 'Username required')
    .max(39, 'GitHub username too long')
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/, 'Invalid GitHub username'),
    
  packageName: z.string()
    .min(1, 'Package name required')
    .max(214, 'Package name too long')
    .regex(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/, 'Invalid npm package name')
};
```

**Priority**: HIGH - Prevents malformed requests

### 1.4 Rate Limiting Protection

**Issue**: No protection against resource abuse.

**Implementation**:
```typescript
class ResourceRateLimiter {
  private requests = new Map<string, number[]>();
  private readonly limits = {
    'github-rate-limits': { max: 10, window: 60000 }, // 10 per minute
    'github-auth-status': { max: 5, window: 60000 },  // 5 per minute
    'npm-status': { max: 10, window: 60000 }          // 10 per minute
  };

  checkLimit(resourceId: string, clientId: string = 'default'): boolean {
    const key = `${resourceId}:${clientId}`;
    const limit = this.limits[resourceId];
    
    if (!limit) return true;
    
    const now = Date.now();
    const windowStart = now - limit.window;
    const requests = this.requests.get(key) || [];
    const validRequests = requests.filter(time => time > windowStart);
    
    if (validRequests.length >= limit.max) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
}
```

**Priority**: HIGH - Prevents abuse

## 🟡 Phase 2: User Experience (MEDIUM PRIORITY)

### 2.1 Enhanced Prompt Design

**Issue**: Basic prompt structure with limited parameterization.

**Implementation**:
```typescript
// Enhanced analyze-code prompt
server.prompt('analyze-code', 'Generate a comprehensive code analysis request', {
  repository: secureValidation.repository,
  focus: z.enum(['architecture', 'patterns', 'security', 'performance', 'dependencies', 'testing'])
    .optional()
    .describe('Specific analysis focus area'),
  depth: z.enum(['overview', 'detailed', 'comprehensive'])
    .default('detailed')
    .describe('Analysis depth level'),
  includeTests: z.boolean()
    .default(true)
    .describe('Include test file analysis'),
  language: z.string()
    .optional()
    .describe('Focus on specific programming language')
}, ({ repository, focus, depth, includeTests, language }) => ({
  messages: [
    {
      role: 'system',
      content: {
        type: 'text',
        text: `You are conducting a ${depth} code analysis${focus ? ` focused on ${focus}` : ''}. 
               ${language ? `Prioritize ${language} code.` : ''}
               ${includeTests ? 'Include test analysis.' : 'Skip test files.'}`
      }
    },
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Analyze repository: ${repository}

Analysis Requirements:
- Repository structure and organization
- Implementation patterns and best practices
${focus ? `- Specific focus: ${focus}` : '- General code quality assessment'}
- Working code examples where relevant
${includeTests ? '- Test coverage and quality' : ''}
${language ? `- ${language} specific patterns and idioms` : ''}

Use GitHub tools systematically:
1. Repository overview (view_repository)
2. Structure exploration (view_repository_structure)  
3. Key implementation files (fetch_github_file_content)
4. Search for patterns (search_github_code)
${includeTests ? '5. Test file examination' : ''}

Analysis depth: ${depth}`
      }
    }
  ]
}));
```

**Priority**: MEDIUM - Improves usability

### 2.2 Resource Caching Strategy

**Issue**: No caching for expensive operations.

**Implementation**:
```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

class ResourceCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly defaultTTL = 300; // 5 minutes

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    entry.hits++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: (ttlSeconds || this.defaultTTL) * 1000,
      hits: 0
    });
  }

  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.timestamp,
        hits: entry.hits
      }))
    };
  }
}
```

**Priority**: MEDIUM - Performance improvement

### 2.3 Standardized Content Types

**Issue**: Inconsistent content type usage.

**Implementation**:
```typescript
const RESOURCE_CONTENT_TYPES = {
  DOCUMENTATION: 'text/markdown',
  STATUS: 'application/json',
  CONFIGURATION: 'application/json',
  INSTRUCTIONS: 'text/markdown',
  ERROR: 'application/json'
} as const;

const RESOURCE_CATEGORIES = {
  STATUS: 'status',
  HELP: 'help',
  CONFIG: 'config',
  DEBUG: 'debug'
} as const;

// Usage example
server.resource('usage-guide', 'help://usage', async uri => ({
  contents: [{
    uri: uri.href,
    mimeType: RESOURCE_CONTENT_TYPES.DOCUMENTATION,
    text: generateMarkdownGuide()
  }]
}));
```

**Priority**: MEDIUM - Consistency improvement

### 2.4 Enhanced Error Context

**Issue**: Generic error messages without actionable guidance.

**Implementation**:
```typescript
const ERROR_CONTEXTS = {
  AUTHENTICATION: {
    github: {
      message: 'GitHub authentication required',
      solutions: [
        'Run: gh auth login',
        'Follow interactive prompts',
        'Verify with: gh auth status'
      ],
      documentation: 'https://cli.github.com/manual/gh_auth_login'
    }
  },
  NETWORK: {
    timeout: {
      message: 'Request timed out',
      solutions: [
        'Check internet connection',
        'Verify GitHub/NPM service status',
        'Try again in a few moments'
      ]
    }
  }
};
```

**Priority**: MEDIUM - Better user experience

## 🟢 Phase 3: Advanced Features (LOW PRIORITY)

### 3.1 Capability Discovery Resource

**Implementation**:
```typescript
server.resource('capabilities', 'help://capabilities', async uri => ({
  contents: [{
    uri: uri.href,
    mimeType: 'application/json',
    text: JSON.stringify({
      server: {
        name: 'octocode-mcp',
        version: '1.0.0',
        description: 'Code question assistant for GitHub and NPM'
      },
      capabilities: {
        tools: Object.values(TOOL_NAMES).map(name => ({
          name,
          category: getToolCategory(name),
          description: getToolDescription(name)
        })),
        resources: [
          { name: 'usage-guide', category: 'help', type: 'markdown' },
          { name: 'github-status', category: 'status', type: 'json' },
          { name: 'capabilities', category: 'help', type: 'json' }
        ],
        prompts: [
          { name: 'analyze-code', parameters: ['repository', 'focus', 'depth'] },
          { name: 'compare-packages', parameters: ['packages', 'criteria'] }
        ]
      },
      limits: {
        rate_limiting: true,
        caching: true,
        max_file_size: '384KB',
        timeout: '10s'
      },
      last_updated: new Date().toISOString()
    }, null, 2)
  }]
}));
```

### 3.2 Configuration Management Resource

**Implementation**:
```typescript
interface ServerConfig {
  cache: {
    enabled: boolean;
    default_ttl: number;
    max_entries: number;
  };
  rate_limiting: {
    enabled: boolean;
    limits: Record<string, { max: number; window: number }>;
  };
  security: {
    command_whitelist: string[];
    timeout_ms: number;
  };
}

server.resource('config', 'config://settings', async uri => {
  const config = await loadConfiguration();
  return {
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify({
        config,
        schema: getConfigSchema(),
        last_modified: new Date().toISOString()
      }, null, 2)
    }]
  };
});
```

### 3.3 Metrics and Monitoring

**Implementation**:
```typescript
class MetricsCollector {
  private metrics = {
    resource_calls: new Map<string, number>(),
    tool_calls: new Map<string, number>(),
    errors: new Map<string, number>(),
    cache_hits: 0,
    cache_misses: 0
  };

  recordResourceCall(name: string) {
    this.metrics.resource_calls.set(name, 
      (this.metrics.resource_calls.get(name) || 0) + 1);
  }

  getMetrics() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      resource_calls: Object.fromEntries(this.metrics.resource_calls),
      cache_efficiency: this.metrics.cache_hits / 
        (this.metrics.cache_hits + this.metrics.cache_misses) * 100
    };
  }
}
```

### 3.4 Resource Versioning

**Implementation**:
```typescript
interface VersionedResource {
  version: string;
  compatibility: string[];
  deprecated?: boolean;
  migration_guide?: string;
}

server.resource('github-status-v2', 'github://auth-status/v2', async uri => {
  // Enhanced version with additional features
  return {
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify({
        version: '2.0.0',
        // enhanced data...
      })
    }]
  };
});
```

## Implementation Timeline

### Week 1-2: Critical Security
- [ ] Implement SecureCommandExecutor
- [ ] Add input validation schemas
- [ ] Standardize error handling
- [ ] Add rate limiting

### Week 3-4: User Experience  
- [ ] Enhanced prompt designs
- [ ] Resource caching
- [ ] Content type standardization
- [ ] Better error messages

### Week 5-6: Advanced Features
- [ ] Capability discovery
- [ ] Configuration management
- [ ] Metrics collection
- [ ] Resource versioning

## Testing Strategy

### Security Testing
- [ ] Command injection attempts
- [ ] Input validation edge cases
- [ ] Rate limiting effectiveness
- [ ] Authentication bypass attempts

### Performance Testing
- [ ] Cache hit rates
- [ ] Response times
- [ ] Memory usage
- [ ] Concurrent request handling

### Usability Testing
- [ ] Error message clarity
- [ ] Prompt effectiveness
- [ ] Resource discoverability
- [ ] Documentation completeness

## Success Metrics

- 🎯 Zero command injection vulnerabilities
- 🎯 <2s average response time for cached resources
- 🎯 >90% cache hit rate for status resources
- 🎯 <5% error rate across all resources
- 🎯 100% of errors include actionable guidance 