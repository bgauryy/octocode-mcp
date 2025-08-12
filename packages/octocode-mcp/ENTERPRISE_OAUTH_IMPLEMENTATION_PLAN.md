# Enterprise OAuth & Security Implementation Plan for Octocode-MCP

## Overview
This document provides a detailed technical implementation plan to add OAuth 2.0/2.1 authentication, GitHub App support, and enterprise-grade security features to octocode-mcp, bringing it to parity with GitHub's official MCP server.

## Current Architecture Analysis

### Existing Security Infrastructure
```
src/security/
├── auditLogger.ts          ✅ Basic audit logging
├── commandValidator.ts     ✅ Command validation
├── contentSanitizer.ts     ✅ Content sanitization
├── credentialStore.ts      ✅ Encrypted credential storage
├── environmentManager.ts   ✅ Environment variable management
├── mask.ts                 ✅ Sensitive data masking
├── organizationManager.ts  ✅ Basic org validation
├── policyManager.ts        ✅ Basic policy framework
├── rateLimiter.ts          ✅ Rate limiting
└── regexes.ts             ✅ Secret detection patterns
```

### Existing Authentication Flow
```
src/mcp/tools/utils/tokenManager.ts ✅ PAT-based token management
src/utils/github/client.ts          ✅ Octokit client with token
src/utils/exec.ts                   ✅ CLI token resolution
```

### Existing Configuration System
```
src/config/serverConfig.ts          ✅ Configuration management
src/mcp/tools/toolsets/toolsetManager.ts ✅ Toolset management
```

## OAuth & Enterprise Authentication Focus

This plan focuses EXCLUSIVELY on adding OAuth 2.0/2.1 authentication and enterprise security features to octocode-mcp. The goal is to enhance the existing octocode-mcp architecture with modern authentication methods while maintaining its current functionality and unique features.

### 🎯 **AUTHENTICATION SCOPE:**

1. **OAuth 2.0/2.1 Integration** - Modern authentication flow with PKCE support
2. **GitHub App Authentication** - Enterprise-grade app-based authentication
3. **Enhanced Enterprise Security** - Advanced policy integration and governance
4. **Token Management Enhancement** - Multi-source token resolution and refresh
5. **Audit & Compliance** - Enhanced logging for enterprise requirements

## Implementation Plan

### Phase 1: OAuth Foundation Infrastructure

#### 1.1 Create OAuth Core Modules

**Create: `src/auth/oauthFlowManager.ts`**
```typescript
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authorizationUrl: string;
  tokenUrl: string;
  userAgent: string;
}

export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface AuthorizationResult {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
  scope: string;
}

export class OAuthFlowManager {
  private static instance: OAuthFlowManager;
  private config: OAuthConfig | null = null;
  
  static getInstance(): OAuthFlowManager {
    if (!this.instance) {
      this.instance = new OAuthFlowManager();
    }
    return this.instance;
  }
  
  // Initialize with configuration
  initialize(config: OAuthConfig): void {
    this.config = config;
  }
  
  // PKCE parameter generation (RFC 7636)
  generatePKCEParams(): PKCEParams {
    const codeVerifier = this.generateRandomString(128);
    const codeChallenge = this.base64URLEncode(
      crypto.createHash('sha256').update(codeVerifier).digest()
    );
    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256'
    };
  }
  
  // Authorization URL generation
  createAuthorizationUrl(state: string, codeChallenge: string): string {
    if (!this.config) throw new Error('OAuth not initialized');
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      response_type: 'code',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    
    return `${this.config.authorizationUrl}?${params.toString()}`;
  }
  
  // Token exchange with error handling
  async exchangeCodeForToken(code: string, codeVerifier: string): Promise<TokenResponse> {
    if (!this.config) throw new Error('OAuth not initialized');
    
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': this.config.userAgent
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri
      })
    });
    
    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type || 'Bearer',
      expiresIn: data.expires_in || 3600,
      scope: data.scope || this.config.scopes.join(' ')
    };
  }
  
  // Token refresh with automatic retry
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    if (!this.config) throw new Error('OAuth not initialized');
    
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': this.config.userAgent
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  // Token validation against GitHub API
  async validateToken(token: string): Promise<TokenValidation> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': this.config?.userAgent || 'octocode-mcp'
        }
      });
      
      return {
        valid: response.ok,
        scopes: response.headers.get('x-oauth-scopes')?.split(', ') || [],
        expiresAt: this.parseTokenExpiration(response.headers.get('x-ratelimit-reset'))
      };
    } catch (error) {
      return { valid: false, scopes: [], error: error.message };
    }
  }
  
  // Cryptographically secure state validation
  validateState(receivedState: string, expectedState: string): boolean {
    if (!receivedState || !expectedState) return false;
    return crypto.timingSafeEqual(
      Buffer.from(receivedState),
      Buffer.from(expectedState)
    );
  }
  
  // Private helper methods
  private generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }
  
  private base64URLEncode(buffer: Buffer): string {
    return buffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  private parseTokenExpiration(resetHeader: string | null): Date | undefined {
    if (!resetHeader) return undefined;
    return new Date(parseInt(resetHeader) * 1000);
  }
}
```

**Create: `src/auth/githubAppManager.ts`**
```typescript
export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  installationId?: number;
  baseUrl?: string;
}

export interface InstallationToken {
  token: string;
  expiresAt: Date;
  permissions: Record<string, string>;
  repositorySelection: 'all' | 'selected';
  repositories?: Repository[];
}

export class GitHubAppManager {
  private static instance: GitHubAppManager;
  private config: GitHubAppConfig | null = null;
  private tokenCache = new Map<number, InstallationToken>();
  
  static getInstance(): GitHubAppManager {
    if (!this.instance) {
      this.instance = new GitHubAppManager();
    }
    return this.instance;
  }
  
  // Initialize with configuration
  initialize(config: GitHubAppConfig): void {
    this.config = config;
  }
  
  // JWT generation for app authentication (RFC 7519)
  generateJWT(): string {
    if (!this.config) throw new Error('GitHub App not initialized');
    
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60, // Issued 1 minute ago (clock skew)
      exp: now + (10 * 60), // Expires in 10 minutes (GitHub max)
      iss: this.config.appId // GitHub App ID
    };
    
    return jwt.sign(payload, this.config.privateKey, { algorithm: 'RS256' });
  }
  
  // Installation token retrieval with caching
  async getInstallationToken(installationId?: number): Promise<InstallationToken> {
    if (!this.config) throw new Error('GitHub App not initialized');
    
    const targetInstallationId = installationId || this.config.installationId;
    if (!targetInstallationId) {
      throw new Error('Installation ID required');
    }
    
    // Check cache first
    const cached = this.tokenCache.get(targetInstallationId);
    if (cached && cached.expiresAt > new Date(Date.now() + 60000)) {
      return cached;
    }
    
    const jwt = this.generateJWT();
    const baseUrl = this.config.baseUrl || 'https://api.github.com';
    
    const response = await fetch(`${baseUrl}/app/installations/${targetInstallationId}/access_tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'octocode-mcp'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get installation token: ${response.statusText}`);
    }
    
    const data = await response.json();
    const token: InstallationToken = {
      token: data.token,
      expiresAt: new Date(data.expires_at),
      permissions: data.permissions,
      repositorySelection: data.repository_selection,
      repositories: data.repositories
    };
    
    // Cache the token
    this.tokenCache.set(targetInstallationId, token);
    
    // Schedule cleanup before expiration
    setTimeout(() => {
      this.tokenCache.delete(targetInstallationId);
    }, token.expiresAt.getTime() - Date.now() - 60000);
    
    return token;
  }
  
  // Installation management
  async listInstallations(): Promise<Installation[]> {
    if (!this.config) throw new Error('GitHub App not initialized');
    
    const jwt = this.generateJWT();
    const baseUrl = this.config.baseUrl || 'https://api.github.com';
    
    const response = await fetch(`${baseUrl}/app/installations`, {
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'octocode-mcp'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list installations: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  // Permission validation with detailed checking
  async validateInstallationPermissions(
    installationId: number, 
    requiredPermissions: string[]
  ): Promise<boolean> {
    try {
      const token = await this.getInstallationToken(installationId);
      
      for (const permission of requiredPermissions) {
        if (!token.permissions[permission] || token.permissions[permission] === 'none') {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  // Repository access validation
  async validateRepositoryAccess(
    installationId: number, 
    owner: string, 
    repo: string
  ): Promise<boolean> {
    try {
      const token = await this.getInstallationToken(installationId);
      
      // If all repositories are selected, access is granted
      if (token.repositorySelection === 'all') {
        return true;
      }
      
      // Check specific repository access
      if (token.repositories) {
        return token.repositories.some(r => 
          r.owner.login === owner && r.name === repo
        );
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }
  
  // Get authenticated user for installation
  async getInstallationUser(installationId: number): Promise<any> {
    const token = await this.getInstallationToken(installationId);
    const baseUrl = this.config?.baseUrl || 'https://api.github.com';
    
    const response = await fetch(`${baseUrl}/user`, {
      headers: {
        'Authorization': `token ${token.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'octocode-mcp'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get installation user: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  // Clear token cache (useful for testing/reset)
  clearTokenCache(): void {
    this.tokenCache.clear();
  }
}
```



#### 1.2 Enhance Token Manager

**Update: `src/mcp/tools/utils/tokenManager.ts`**
```typescript
// Add OAuth token source
type TokenSource = 'env' | 'cli' | 'oauth' | 'github_app' | 'authorization' | 'unknown';

interface OAuthTokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
  tokenType: string;
}

interface GitHubAppTokenInfo {
  installationToken: string;
  expiresAt: Date;
  installationId: number;
  permissions: Record<string, string>;
}

// Enhanced token resolution with OAuth support
async function resolveTokenWithOAuth(): Promise<{
  token: string | null;
  source: TokenSource;
  metadata?: OAuthTokenInfo | GitHubAppTokenInfo;
}> {
  // Priority order: OAuth > GitHub App > Environment > CLI
  
  // 1. Try OAuth token first (highest priority for enterprise)
  const oauthToken = await tryGetOAuthToken();
  if (oauthToken) {
    return {
      token: oauthToken.accessToken,
      source: 'oauth',
      metadata: oauthToken
    };
  }
  
  // 2. Try GitHub App token
  const appToken = await tryGetGitHubAppToken();
  if (appToken) {
    return {
      token: appToken.installationToken,
      source: 'github_app',
      metadata: appToken
    };
  }
  
  // 3. Fall back to existing PAT resolution
  const existingToken = await resolveToken();
  if (existingToken.token) {
    return {
      token: existingToken.token,
      source: existingToken.source as TokenSource,
      metadata: undefined
    };
  }
  
  return { token: null, source: 'unknown' };
}

// OAuth token refresh handling with automatic retry
export async function refreshOAuthToken(): Promise<string> {
  const credentialStore = SecureCredentialStore.getInstance();
  const refreshToken = await credentialStore.get('oauth_refresh_token');
  
  if (!refreshToken) {
    throw new Error('No OAuth refresh token available');
  }
  
  try {
    const oauthManager = OAuthFlowManager.getInstance();
    const newTokens = await oauthManager.refreshToken(refreshToken);
    
    // Store new tokens securely
    await credentialStore.set('oauth_access_token', newTokens.accessToken);
    if (newTokens.refreshToken) {
      await credentialStore.set('oauth_refresh_token', newTokens.refreshToken);
    }
    
    // Store expiration
    const expiresAt = new Date(Date.now() + (newTokens.expiresIn * 1000));
    await credentialStore.set('oauth_expires_at', expiresAt.toISOString());
    
    // Schedule next refresh
    scheduleTokenRefresh(expiresAt, refreshOAuthToken);
    
    return newTokens.accessToken;
  } catch (error) {
    // Clear invalid tokens
    await credentialStore.delete('oauth_access_token');
    await credentialStore.delete('oauth_refresh_token');
    await credentialStore.delete('oauth_expires_at');
    
    throw new Error(`OAuth token refresh failed: ${error.message}`);
  }
}

// GitHub App token refresh with installation validation
export async function refreshGitHubAppToken(): Promise<string> {
  const config = ConfigManager.getConfig();
  if (!config.githubApp?.enabled) {
    throw new Error('GitHub App not configured');
  }
  
  try {
    const appManager = GitHubAppManager.getInstance();
    const installationToken = await appManager.getInstallationToken();
    
    // Store token securely
    const credentialStore = SecureCredentialStore.getInstance();
    await credentialStore.set('github_app_token', installationToken.token);
    await credentialStore.set('github_app_expires_at', installationToken.expiresAt.toISOString());
    
    // Schedule next refresh (5 minutes before expiration)
    const refreshTime = new Date(installationToken.expiresAt.getTime() - 5 * 60 * 1000);
    scheduleTokenRefresh(refreshTime, refreshGitHubAppToken);
    
    return installationToken.token;
  } catch (error) {
    throw new Error(`GitHub App token refresh failed: ${error.message}`);
  }
}

// Token expiration monitoring with enterprise audit logging
export function scheduleTokenRefresh(expiresAt: Date, refreshCallback: () => Promise<void>): void {
  const refreshTime = expiresAt.getTime() - Date.now() - (5 * 60 * 1000); // 5 minutes before expiry
  
  if (refreshTime <= 0) {
    // Token already expired, refresh immediately
    refreshCallback().catch(error => {
      if (ConfigManager.isEnterpriseMode()) {
        AuditLogger.logEvent({
          action: 'token_refresh_failed',
          outcome: 'failure',
          source: 'system',
          details: { error: error.message }
        });
      }
    });
    return;
  }
  
  setTimeout(async () => {
    try {
      await refreshCallback();
      
      if (ConfigManager.isEnterpriseMode()) {
        AuditLogger.logEvent({
          action: 'token_refresh_success',
          outcome: 'success',
          source: 'system',
          details: { scheduledRefresh: true }
        });
      }
    } catch (error) {
      if (ConfigManager.isEnterpriseMode()) {
        AuditLogger.logEvent({
          action: 'token_refresh_failed',
          outcome: 'failure',
          source: 'system',
          details: { error: error.message, scheduledRefresh: true }
        });
      }
    }
  }, refreshTime);
}

// Helper functions for token resolution
async function tryGetOAuthToken(): Promise<OAuthTokenInfo | null> {
  try {
    const credentialStore = SecureCredentialStore.getInstance();
    const accessToken = await credentialStore.get('oauth_access_token');
    const refreshToken = await credentialStore.get('oauth_refresh_token');
    const expiresAtStr = await credentialStore.get('oauth_expires_at');
    
    if (!accessToken) return null;
    
    const expiresAt = expiresAtStr ? new Date(expiresAtStr) : new Date(Date.now() + 3600000);
    
    // Check if token is expired
    if (expiresAt <= new Date()) {
      if (refreshToken) {
        // Try to refresh
        const newToken = await refreshOAuthToken();
        return {
          accessToken: newToken,
          refreshToken,
          expiresAt: new Date(Date.now() + 3600000),
          scopes: [],
          tokenType: 'Bearer'
        };
      }
      return null;
    }
    
    return {
      accessToken,
      refreshToken,
      expiresAt,
      scopes: [],
      tokenType: 'Bearer'
    };
  } catch (error) {
    return null;
  }
}

async function tryGetGitHubAppToken(): Promise<GitHubAppTokenInfo | null> {
  try {
    const config = ConfigManager.getConfig();
    if (!config.githubApp?.enabled) return null;
    
    const credentialStore = SecureCredentialStore.getInstance();
    const token = await credentialStore.get('github_app_token');
    const expiresAtStr = await credentialStore.get('github_app_expires_at');
    
    if (!token) return null;
    
    const expiresAt = expiresAtStr ? new Date(expiresAtStr) : new Date(Date.now() + 3600000);
    
    // Check if token is expired
    if (expiresAt <= new Date()) {
      // Try to refresh
      const newToken = await refreshGitHubAppToken();
      return {
        installationToken: newToken,
        expiresAt: new Date(Date.now() + 3600000),
        installationId: config.githubApp.installationId || 0,
        permissions: {}
      };
    }
    
    return {
      installationToken: token,
      expiresAt,
      installationId: config.githubApp.installationId || 0,
      permissions: {}
    };
  } catch (error) {
    return null;
  }
}
```

#### 1.3 Configuration Updates

**Update: `src/config/serverConfig.ts`**
```typescript
export interface ServerConfig {
  // Existing fields...
  
  // OAuth Configuration
  oauth?: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
    enabled: boolean;
    authorizationUrl?: string; // Default: https://github.com/login/oauth/authorize
    tokenUrl?: string; // Default: https://github.com/login/oauth/access_token
  };
  
  // GitHub App Configuration
  githubApp?: {
    appId: string;
    privateKey: string;
    installationId?: number;
    enabled: boolean;
    baseUrl?: string; // For GitHub Enterprise Server
  };
  
  // Enhanced Enterprise Configuration
  enterprise?: {
    organizationId?: string;
    ssoEnforcement: boolean;
    auditLogging: boolean;
    tokenValidation: boolean;
    permissionValidation: boolean;
  };
}

// Enhanced configuration initialization
static initialize(): ServerConfig {
  if (this.initialized && this.config) {
    return this.config;
  }

  this.config = {
    // Existing configuration...
    
    // OAuth Configuration from environment
    oauth: this.getOAuthConfig(),
    
    // GitHub App Configuration from environment
    githubApp: this.getGitHubAppConfig(),
    
    // Enhanced Enterprise Configuration
    enterprise: {
      organizationId: process.env.GITHUB_ORGANIZATION,
      ssoEnforcement: process.env.GITHUB_SSO_ENFORCEMENT === 'true',
      auditLogging: process.env.AUDIT_ALL_ACCESS === 'true',
      tokenValidation: process.env.GITHUB_TOKEN_VALIDATION === 'true',
      permissionValidation: process.env.GITHUB_PERMISSION_VALIDATION === 'true'
    }
  };

  this.initialized = true;
  this.validateConfig();
  return this.config;
}

// OAuth configuration helper
private static getOAuthConfig(): ServerConfig['oauth'] {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return undefined; // OAuth not configured
  }
  
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI || 'http://localhost:3000/auth/callback',
    scopes: (process.env.GITHUB_OAUTH_SCOPES || 'repo,read:user').split(','),
    enabled: process.env.GITHUB_OAUTH_ENABLED !== 'false',
    authorizationUrl: process.env.GITHUB_OAUTH_AUTH_URL || 
      (process.env.GITHUB_HOST ? `${process.env.GITHUB_HOST}/login/oauth/authorize` : 'https://github.com/login/oauth/authorize'),
    tokenUrl: process.env.GITHUB_OAUTH_TOKEN_URL || 
      (process.env.GITHUB_HOST ? `${process.env.GITHUB_HOST}/login/oauth/access_token` : 'https://github.com/login/oauth/access_token')
  };
}

// GitHub App configuration helper
private static getGitHubAppConfig(): ServerConfig['githubApp'] {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  
  if (!appId || !privateKey) {
    return undefined; // GitHub App not configured
  }
  
  return {
    appId,
    privateKey: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
    installationId: process.env.GITHUB_APP_INSTALLATION_ID ? 
      parseInt(process.env.GITHUB_APP_INSTALLATION_ID) : undefined,
    enabled: process.env.GITHUB_APP_ENABLED !== 'false',
    baseUrl: process.env.GITHUB_HOST ? 
      (process.env.GITHUB_HOST.startsWith('https://') ? 
        `${process.env.GITHUB_HOST}/api/v3` : 
        `https://${process.env.GITHUB_HOST}/api/v3`) : undefined
  };
}
```

### Phase 2: Enhanced Enterprise Security

#### 2.1 Enhanced Policy Integration

**Update: `src/security/policyManager.ts`**
```typescript
// OAuth Authentication Policies
interface OAuthAuthPolicy {
  requireOAuth: boolean;
  allowedClientIds: string[];
  requiredScopes: string[];
  maxTokenAge: number; // in seconds
  enforceTokenRotation: boolean;
}

interface GitHubAppAuthPolicy {
  requireGitHubApp: boolean;
  allowedAppIds: string[];
  requiredPermissions: string[];
  installationValidation: boolean;
  repositoryAccessValidation: boolean;
}

interface EnterpriseAuthPolicy {
  organizationValidation: boolean;
  ssoEnforcement: boolean;
  tokenValidation: boolean;
  auditAllAuthentication: boolean;
  maxSessionDuration: number; // in minutes
}

interface TokenSecurityPolicy {
  encryptStoredTokens: boolean;
  rotateTokensOnExpiry: boolean;
  validateTokenScopes: boolean;
  logTokenUsage: boolean;
  revokeOnSuspiciousActivity: boolean;
}

export class EnhancedPolicyManager extends PolicyManager {
  private oauthPolicy: OAuthAuthPolicy;
  private githubAppPolicy: GitHubAppAuthPolicy;
  private enterprisePolicy: EnterpriseAuthPolicy;
  private tokenPolicy: TokenSecurityPolicy;
  
  // Initialize enhanced policies
  async initializeEnhancedPolicies(): Promise<void> {
    await super.initialize();
    
    this.oauthPolicy = this.loadOAuthPolicy();
    this.githubAppPolicy = this.loadGitHubAppPolicy();
    this.enterprisePolicy = this.loadEnterprisePolicy();
    this.tokenPolicy = this.loadTokenSecurityPolicy();
  }
  
  // OAuth authentication policy validation
  async validateOAuthAuthentication(
    clientId: string, 
    scopes: string[], 
    tokenAge: number
  ): Promise<PolicyEvaluationResult> {
    const violations: string[] = [];
    
    // Check if OAuth is required
    if (this.oauthPolicy.requireOAuth) {
      if (!clientId) {
        violations.push('OAuth authentication required but no client ID provided');
      }
    }
    
    // Validate client ID
    if (this.oauthPolicy.allowedClientIds.length > 0) {
      if (!this.oauthPolicy.allowedClientIds.includes(clientId)) {
        violations.push(`Client ID ${clientId} not in allowed list`);
      }
    }
    
    // Validate scopes
    for (const requiredScope of this.oauthPolicy.requiredScopes) {
      if (!scopes.includes(requiredScope)) {
        violations.push(`Required scope '${requiredScope}' missing`);
      }
    }
    
    // Validate token age
    if (tokenAge > this.oauthPolicy.maxTokenAge) {
      violations.push(`Token age ${tokenAge}s exceeds maximum ${this.oauthPolicy.maxTokenAge}s`);
    }
    
    return {
      allowed: violations.length === 0,
      violations,
      policy: 'oauth_authentication',
      timestamp: new Date()
    };
  }
  
  // GitHub App authentication policy validation
  async validateGitHubAppAuthentication(
    appId: string,
    installationId: number,
    permissions: Record<string, string>
  ): Promise<PolicyEvaluationResult> {
    const violations: string[] = [];
    
    // Check if GitHub App is required
    if (this.githubAppPolicy.requireGitHubApp) {
      if (!appId) {
        violations.push('GitHub App authentication required but no app ID provided');
      }
    }
    
    // Validate app ID
    if (this.githubAppPolicy.allowedAppIds.length > 0) {
      if (!this.githubAppPolicy.allowedAppIds.includes(appId)) {
        violations.push(`GitHub App ID ${appId} not in allowed list`);
      }
    }
    
    // Validate required permissions
    for (const requiredPermission of this.githubAppPolicy.requiredPermissions) {
      if (!permissions[requiredPermission] || permissions[requiredPermission] === 'none') {
        violations.push(`Required permission '${requiredPermission}' missing or insufficient`);
      }
    }
    
    // Validate installation
    if (this.githubAppPolicy.installationValidation && !installationId) {
      violations.push('Installation validation required but no installation ID provided');
    }
    
    return {
      allowed: violations.length === 0,
      violations,
      policy: 'github_app_authentication',
      timestamp: new Date()
    };
  }
  
  // Enterprise authentication policy validation
  async validateEnterpriseAuthentication(
    userId: string,
    organizationId?: string,
    ssoSession?: string
  ): Promise<PolicyEvaluationResult> {
    const violations: string[] = [];
    
    // Organization validation
    if (this.enterprisePolicy.organizationValidation) {
      if (!organizationId) {
        violations.push('Organization validation required but no organization ID provided');
      } else {
        const isValidOrg = await this.validateOrganizationMembership(userId, organizationId);
        if (!isValidOrg) {
          violations.push(`User ${userId} not a member of organization ${organizationId}`);
        }
      }
    }
    
    // SSO enforcement
    if (this.enterprisePolicy.ssoEnforcement) {
      if (!ssoSession) {
        violations.push('SSO enforcement enabled but no SSO session provided');
      } else {
        const isValidSSO = await this.validateSSOSession(ssoSession);
        if (!isValidSSO) {
          violations.push('Invalid or expired SSO session');
        }
      }
    }
    
    return {
      allowed: violations.length === 0,
      violations,
      policy: 'enterprise_authentication',
      timestamp: new Date()
    };
  }
  
  // Token security policy validation
  async validateTokenSecurity(
    token: string,
    tokenSource: 'oauth' | 'github_app' | 'pat',
    metadata?: any
  ): Promise<PolicyEvaluationResult> {
    const violations: string[] = [];
    
    // Token encryption validation
    if (this.tokenPolicy.encryptStoredTokens) {
      const isEncrypted = await this.isTokenEncrypted(token);
      if (!isEncrypted) {
        violations.push('Token must be encrypted when stored');
      }
    }
    
    // Scope validation for OAuth tokens
    if (tokenSource === 'oauth' && this.tokenPolicy.validateTokenScopes) {
      if (metadata?.scopes) {
        const validScopes = await this.validateTokenScopes(metadata.scopes);
        if (!validScopes) {
          violations.push('Token scopes validation failed');
        }
      }
    }
    
    // Token usage logging
    if (this.tokenPolicy.logTokenUsage) {
      await this.logTokenUsage(token, tokenSource, metadata);
    }
    
    return {
      allowed: violations.length === 0,
      violations,
      policy: 'token_security',
      timestamp: new Date()
    };
  }
  
  // Private helper methods
  private loadOAuthPolicy(): OAuthAuthPolicy {
    return {
      requireOAuth: process.env.OAUTH_REQUIRED === 'true',
      allowedClientIds: process.env.OAUTH_ALLOWED_CLIENT_IDS?.split(',') || [],
      requiredScopes: process.env.OAUTH_REQUIRED_SCOPES?.split(',') || ['repo', 'read:user'],
      maxTokenAge: parseInt(process.env.OAUTH_MAX_TOKEN_AGE || '3600'),
      enforceTokenRotation: process.env.OAUTH_ENFORCE_ROTATION === 'true'
    };
  }
  
  private loadGitHubAppPolicy(): GitHubAppAuthPolicy {
    return {
      requireGitHubApp: process.env.GITHUB_APP_REQUIRED === 'true',
      allowedAppIds: process.env.GITHUB_APP_ALLOWED_IDS?.split(',') || [],
      requiredPermissions: process.env.GITHUB_APP_REQUIRED_PERMISSIONS?.split(',') || ['contents', 'metadata'],
      installationValidation: process.env.GITHUB_APP_VALIDATE_INSTALLATION === 'true',
      repositoryAccessValidation: process.env.GITHUB_APP_VALIDATE_REPO_ACCESS === 'true'
    };
  }
  
  private loadEnterprisePolicy(): EnterpriseAuthPolicy {
    return {
      organizationValidation: process.env.ENTERPRISE_VALIDATE_ORG === 'true',
      ssoEnforcement: process.env.ENTERPRISE_ENFORCE_SSO === 'true',
      tokenValidation: process.env.ENTERPRISE_VALIDATE_TOKENS === 'true',
      auditAllAuthentication: process.env.ENTERPRISE_AUDIT_AUTH === 'true',
      maxSessionDuration: parseInt(process.env.ENTERPRISE_MAX_SESSION_MINUTES || '480') // 8 hours
    };
  }
  
  private loadTokenSecurityPolicy(): TokenSecurityPolicy {
    return {
      encryptStoredTokens: process.env.TOKEN_ENCRYPT_STORAGE === 'true',
      rotateTokensOnExpiry: process.env.TOKEN_ROTATE_ON_EXPIRY === 'true',
      validateTokenScopes: process.env.TOKEN_VALIDATE_SCOPES === 'true',
      logTokenUsage: process.env.TOKEN_LOG_USAGE === 'true',
      revokeOnSuspiciousActivity: process.env.TOKEN_REVOKE_ON_SUSPICIOUS === 'true'
    };
  }
}
```

#### 3.2 Multi-Organization Support

**Update: `src/security/organizationManager.ts`**
```typescript
interface EnterpriseConfig {
  enterpriseId: string;
  organizations: string[];
  inheritancePolicies: PolicyInheritance[];
  administrativeHierarchy: AdminHierarchy;
}

interface PolicyInheritance {
  policyType: string;
  inheritanceLevel: 'enterprise' | 'organization' | 'team';
  overrideAllowed: boolean;
}

export class EnhancedOrganizationManager extends OrganizationManager {
  // Multi-organization validation
  validateMultiOrgAccess(userId: string, organizations: string[]): Promise<ValidationResult>
  
  // Enterprise-level policy inheritance
  resolveInheritedPolicies(organizationId: string): Promise<PolicySet>
  
  // Administrative delegation
  validateAdminPermissions(userId: string, action: string, scope: string): Promise<boolean>
  
  // Cross-organization team management
  validateTeamAccess(userId: string, teamId: string): Promise<boolean>
}
```

#### 3.3 Enhanced Audit Logging

**Update: `src/security/auditLogger.ts`**
```typescript
interface MCPAuditEvent extends AuditEvent {
  mcpEventType: 'connection' | 'authentication' | 'tool_call' | 'policy_evaluation';
  connectionType: 'stdio' | 'http' | 'sse';
  authMethod: 'oauth' | 'github_app' | 'pat' | 'cli';
  toolName?: string;
  policyResult?: PolicyEvaluationResult;
}

export class EnhancedAuditLogger extends AuditLogger {
  // MCP-specific event logging
  logMCPEvent(event: Omit<MCPAuditEvent, 'eventId' | 'timestamp'>): void
  
  // Connection monitoring
  logConnectionEvent(connectionId: string, event: 'connect' | 'disconnect' | 'timeout'): void
  
  // Real-time monitoring
  getActiveConnections(): Promise<ConnectionSummary[]>
  
  // Usage analytics
  generateUsageReport(timeRange: TimeRange): Promise<UsageReport>
  
  // Compliance reporting
  generateComplianceReport(organizationId: string): Promise<ComplianceReport>
}
```

### Phase 4: Tool Enhancement & Dynamic Discovery

#### 4.1 Dynamic Tool Discovery

**Create: `src/mcp/tools/dynamicToolDiscovery.ts`**
```typescript
interface ToolDiscoveryContext {
  userPrompt: string;
  userContext: UserContext;
  availableToolsets: string[];
  currentlyEnabled: string[];
}

interface ToolRecommendation {
  toolsetName: string;
  confidence: number;
  reason: string;
  requiredPermissions: string[];
}

export class DynamicToolDiscovery {
  // Analyze user prompt for tool requirements
  analyzePrompt(prompt: string): Promise<ToolRequirements>
  
  // Recommend toolsets based on context
  recommendToolsets(context: ToolDiscoveryContext): Promise<ToolRecommendation[]>
  
  // Enable toolsets dynamically
  enableRecommendedToolsets(recommendations: ToolRecommendation[]): Promise<void>
  
  // Track tool usage for learning
  trackToolUsage(toolName: string, success: boolean, context: string): void
}
```

#### 4.2 Advanced Toolset Management

**Update: `src/mcp/tools/toolsets/toolsetManager.ts`**
```typescript
interface AdvancedToolsetConfig {
  name: string;
  description: string;
  category: 'context' | 'actions' | 'code_security' | 'dependabot' | 'discussions' | 'experiments' | 'gists' | 'issues' | 'notifications' | 'orgs' | 'pull_requests' | 'repos' | 'secret_protection' | 'users';
  requiredPermissions: string[];
  enterpriseRequired: boolean;
  dynamicDiscovery: boolean;
  usageTracking: boolean;
}

export class EnhancedToolsetManager extends ToolsetManager {
  // Context-aware toolset enabling
  enableToolsetsForContext(context: UserContext, prompt?: string): Promise<string[]>
  
  // Permission-based toolset filtering
  filterToolsetsByPermissions(toolsets: string[], permissions: string[]): string[]
  
  // Usage analytics
  getToolsetUsageStats(): Promise<ToolsetUsageStats>
  
  // Capability negotiation
  negotiateCapabilities(clientCapabilities: string[]): Promise<string[]>
}
```

### Phase 5: Integration & Testing

#### 5.1 Integration Points

**Update: `src/index.ts`**
```typescript
// Enhanced server initialization
export async function initializeEnhancedServer(): Promise<void> {
  // Initialize OAuth infrastructure
  await initializeOAuthInfrastructure();
  
  // Initialize GitHub App support
  await initializeGitHubAppSupport();
  
  // Initialize remote server capabilities
  await initializeRemoteServerSupport();
  
  // Initialize enhanced enterprise features
  await initializeEnhancedEnterpriseFeatures();
  
  // Initialize dynamic tool discovery
  await initializeDynamicToolDiscovery();
}

// OAuth infrastructure initialization
async function initializeOAuthInfrastructure(): Promise<void> {
  const config = ConfigManager.getConfig();
  
  if (config.oauth?.enabled) {
    const oauthManager = new OAuthFlowManager();
    const mcpAuth = new MCPAuthProtocol();
    
    // Register OAuth endpoints
    await registerOAuthEndpoints(oauthManager, mcpAuth);
  }
}

// GitHub App support initialization
async function initializeGitHubAppSupport(): Promise<void> {
  const config = ConfigManager.getConfig();
  
  if (config.githubApp?.enabled) {
    const appManager = new GitHubAppManager();
    
    // Initialize app authentication
    await appManager.initialize(config.githubApp);
  }
}
```

#### 5.2 Testing Strategy

**Create: `tests/auth/`**
- `oauthFlowManager.test.ts` - OAuth flow testing
- `githubAppManager.test.ts` - GitHub App integration testing
- `mcpAuthProtocol.test.ts` - MCP auth protocol testing

**Create: `tests/server/`**
- `httpMcpServer.test.ts` - HTTP server testing
- `sseHandler.test.ts` - SSE functionality testing
- `remoteAuthHandler.test.ts` - Remote authentication testing

**Create: `tests/enterprise/`**
- `enhancedPolicyManager.test.ts` - Policy integration testing
- `multiOrgSupport.test.ts` - Multi-organization testing
- `complianceReporting.test.ts` - Compliance and audit testing

#### 5.3 Migration Strategy

**Create: `src/migration/`**
```typescript
export class MigrationManager {
  // Migrate from PAT-only to OAuth support
  migratePATToOAuth(): Promise<void>
  
  // Migrate configuration format
  migrateConfiguration(): Promise<void>
  
  // Migrate existing audit logs
  migrateAuditLogs(): Promise<void>
  
  // Validate migration success
  validateMigration(): Promise<MigrationResult>
}
```

## Implementation Timeline

### Week 1-2: OAuth Foundation Infrastructure
- [ ] Create OAuth core modules (`oauthFlowManager.ts`)
- [ ] Implement PKCE parameter generation
- [ ] Add OAuth token exchange and refresh
- [ ] Enhance token manager with OAuth support
- [ ] Update configuration system for OAuth
- [ ] Basic OAuth flow testing

### Week 3-4: GitHub App Authentication
- [ ] Create GitHub App manager (`githubAppManager.ts`)
- [ ] Implement JWT generation for app authentication
- [ ] Add installation token management with caching
- [ ] Repository and permission validation
- [ ] Integration with existing token manager
- [ ] GitHub App authentication testing

### Week 5-6: Enhanced Enterprise Security
- [ ] Enhanced policy manager for OAuth/GitHub App policies
- [ ] Token security policy implementation
- [ ] Enterprise authentication validation
- [ ] Enhanced audit logging for authentication events
- [ ] Multi-organization support enhancements
- [ ] Enterprise security testing

### Week 7-8: Integration & Testing
- [ ] End-to-end OAuth integration
- [ ] GitHub App integration testing
- [ ] Enterprise policy validation testing
- [ ] Token refresh and expiration testing
- [ ] Security audit and penetration testing
- [ ] Performance optimization

### Week 9-10: Documentation & Migration
- [ ] Comprehensive documentation updates
- [ ] Migration utilities for existing deployments
- [ ] Environment variable configuration guide
- [ ] Enterprise deployment guide
- [ ] Security best practices documentation
- [ ] Final testing and validation

## Risk Mitigation

### Technical Risks
1. **OAuth Complexity** - Implement comprehensive error handling and fallback mechanisms
2. **Security Vulnerabilities** - Conduct security audits and penetration testing
3. **Performance Impact** - Implement caching and optimize authentication flows
4. **Compatibility Issues** - Maintain backward compatibility with existing deployments

### Operational Risks
1. **Migration Complexity** - Provide automated migration tools and rollback capabilities
2. **Configuration Complexity** - Implement configuration validation and helpful error messages
3. **Enterprise Integration** - Work closely with enterprise customers for testing and feedback

## Success Metrics

### Technical Metrics
- [ ] OAuth 2.0/2.1 compliance verified
- [ ] MCP Authorization Protocol compliance verified
- [ ] Remote server performance benchmarks met
- [ ] Enterprise security requirements satisfied

### Business Metrics
- [ ] Enterprise customer adoption
- [ ] Reduced support tickets for authentication issues
- [ ] Improved security audit results
- [ ] Feature parity with GitHub's official MCP server

## Environment Variables Configuration

### OAuth Configuration
```bash
# OAuth 2.0/2.1 Settings
GITHUB_OAUTH_CLIENT_ID=your_oauth_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_oauth_client_secret
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
GITHUB_OAUTH_SCOPES=repo,read:user,read:org
GITHUB_OAUTH_ENABLED=true

# Custom OAuth URLs (for GitHub Enterprise Server)
GITHUB_OAUTH_AUTH_URL=https://your-ghes.com/login/oauth/authorize
GITHUB_OAUTH_TOKEN_URL=https://your-ghes.com/login/oauth/access_token
```

### GitHub App Configuration
```bash
# GitHub App Settings
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_INSTALLATION_ID=12345678
GITHUB_APP_ENABLED=true

# GitHub Enterprise Server URL (optional)
GITHUB_HOST=https://your-ghes.com
```

### Enterprise Security Configuration
```bash
# Organization and Enterprise Settings
GITHUB_ORGANIZATION=your-organization
ENTERPRISE_VALIDATE_ORG=true
ENTERPRISE_ENFORCE_SSO=true
ENTERPRISE_VALIDATE_TOKENS=true
ENTERPRISE_AUDIT_AUTH=true
ENTERPRISE_MAX_SESSION_MINUTES=480

# OAuth Policy Configuration
OAUTH_REQUIRED=true
OAUTH_ALLOWED_CLIENT_IDS=client1,client2,client3
OAUTH_REQUIRED_SCOPES=repo,read:user
OAUTH_MAX_TOKEN_AGE=3600
OAUTH_ENFORCE_ROTATION=true

# GitHub App Policy Configuration
GITHUB_APP_REQUIRED=false
GITHUB_APP_ALLOWED_IDS=123456,789012
GITHUB_APP_REQUIRED_PERMISSIONS=contents,metadata,issues
GITHUB_APP_VALIDATE_INSTALLATION=true
GITHUB_APP_VALIDATE_REPO_ACCESS=true

# Token Security Configuration
TOKEN_ENCRYPT_STORAGE=true
TOKEN_ROTATE_ON_EXPIRY=true
TOKEN_VALIDATE_SCOPES=true
TOKEN_LOG_USAGE=true
TOKEN_REVOKE_ON_SUSPICIOUS=true

# Existing Enterprise Features (already implemented)
AUDIT_ALL_ACCESS=true
RATE_LIMIT_API_HOUR=5000
RATE_LIMIT_AUTH_HOUR=100
RATE_LIMIT_TOKEN_HOUR=50
```

### Development and Testing
```bash
# Development Mode
NODE_ENV=development
ENABLE_COMMAND_LOGGING=true
LOG_FILE_PATH=/var/log/octocode-mcp/server.log

# Testing Configuration
GITHUB_OAUTH_CLIENT_ID=test_client_id
GITHUB_OAUTH_CLIENT_SECRET=test_client_secret
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
OAUTH_REQUIRED=false  # For development only
```

## Implementation Priorities

### 🔥 **CRITICAL - Week 1-2**
1. **OAuth Flow Manager** - Core OAuth 2.0/2.1 implementation with PKCE
2. **Enhanced Token Manager** - Multi-source token resolution (OAuth > GitHub App > PAT)
3. **Configuration Updates** - Environment variable integration

### 🔥 **HIGH - Week 3-4**  
4. **GitHub App Manager** - JWT generation and installation token management
5. **Token Refresh System** - Automatic token rotation and expiration handling
6. **Basic Policy Integration** - OAuth and GitHub App authentication policies

### 📊 **MEDIUM - Week 5-6**
7. **Enhanced Enterprise Security** - Advanced policy validation and enforcement
8. **Audit Logging Enhancement** - Authentication event logging and compliance
9. **Multi-Organization Support** - Enterprise-grade organization management

### ✅ **LOW - Week 7-10**
10. **Integration Testing** - End-to-end authentication flows
11. **Documentation** - Configuration guides and best practices
12. **Migration Tools** - Smooth transition from PAT-only deployments

## Conclusion

This focused implementation plan transforms octocode-mcp's authentication system to support modern OAuth 2.0/2.1 flows and GitHub App authentication while maintaining its existing functionality and enterprise security features.

**Key Benefits:**
- **Enhanced Security**: OAuth 2.0/2.1 with PKCE support
- **Enterprise Ready**: GitHub App authentication with fine-grained permissions
- **Backward Compatible**: Existing PAT authentication remains functional
- **Policy Driven**: Comprehensive enterprise policy framework
- **Audit Compliant**: Enhanced logging for enterprise requirements

The phased approach ensures minimal disruption to existing deployments while systematically adding modern authentication capabilities that meet enterprise security requirements.
