---

## ✅ OAuth Compatibility Checklist (Users + Organizations)

### 1) Configuration & Scopes
- Ensure OAuth is enabled in `serverConfig` via env: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT_URI`.
- Include `read:org` in `GITHUB_OAUTH_SCOPES` for org features.
- For org-restricted deployments, set `GITHUB_ORGANIZATION` and `RESTRICT_TO_MEMBERS=true` (optional).

### 2) Expose OAuth as MCP Tools
- Add tools under `src/mcp/tools/oauth/`:
  - `oauth_initiate` → returns `{ authorizationUrl, state }` (+ stores `state→codeVerifier` with TTL)
  - `oauth_callback` → accepts `{ code, state }`, validates state, exchanges token, stores via tokenManager
  - `oauth_status` → returns token source, scopes, expiry, org context
  - `oauth_revoke` → revokes current token
- Add Zod schemas in `src/mcp/tools/scheme/oauth.ts` for the above.

### 3) State/Verifier Storage
- Implement helpers: `storeOAuthState(state, codeVerifier, organization?)`, `getOAuthState(state)`, `clearOAuthState(state)` with 10–15 min TTL. Use in-memory Map or `SecureCredentialStore` keys.

### 4) OAuth Callback Options (Answer to “create OAuth page?”)
- Option A (recommended): start a tiny local HTTP listener (e.g., `http://127.0.0.1:8765/auth/callback`) after `oauth_initiate`; auto-stop after callback.
- Option B: out-of-band page that shows `code`+`state`; user runs `oauth_callback` tool to finish.
- Option C: custom scheme deep link handled by the MCP client to invoke `oauth_callback` automatically.

### 5) Organization Membership Validation
- Prefer authenticated endpoint `GET /user/memberships/orgs/{org}` when token has `read:org`; fallback to `GET /orgs/{org}/members/{username}`.
- Use `getAuthenticatedUser()` to resolve login for checks.
- Keep caching via `OrganizationManager`; add branch for the authenticated endpoint to improve accuracy for private memberships.

### 6) Dynamic Tool Availability
- Compute enabled tools at startup (and optionally on demand) based on token source and org membership:
  - Enable org tools only if token source is `oauth` and user is a member of `GITHUB_ORGANIZATION` (when set).
  - Wire through `ToolsetManager` and a small helper (e.g., `getAvailableTools()`).

### 7) Security & Ops
- Log `oauth_*` events via `AuditLogger` (already integrated in enterprise mode).
- Respect `RateLimiter` for initiate/callback endpoints to avoid abuse.
- Sanitize outputs (no secrets), rely on existing content sanitization.

### 8) Minimal Redirect Page (for Option B)
```html
<!doctype html>
<html>
  <body>
    <script>
      const p = new URLSearchParams(location.search);
      document.body.innerHTML = `<h2>Authorization complete</h2>
        <p>Code: <code>${p.get('code')}</code></p>
        <p>State: <code>${p.get('state')}</code></p>`;
    </script>
  </body>
  </html>
```

### 9) Files To Add
- `src/mcp/tools/oauth/oauthTools.ts` (tool metadata)
- `src/mcp/tools/oauth/oauthHandlers.ts` (initiate/status/revoke/callback)
- `src/mcp/tools/scheme/oauth.ts` (schemas)
- `src/mcp/tools/utils/dynamicToolRegistration.ts` (available tools calculation)
- `src/services/organizationService.ts` (optional thin wrapper around Octokit)
- `src/http/oauthServer.ts` (optional local callback server)

### 10) Acceptance Criteria
- `oauth_initiate` returns a valid GitHub URL; `oauth_callback` stores token; `oauth_status` shows `source=oauth` with `read:org` present.
- With `GITHUB_ORGANIZATION` and `RESTRICT_TO_MEMBERS=true`, non-members are denied and org tools are hidden.
- Audit logs include OAuth and access events; no secrets are logged.

# Octocode MCP OAuth Enhancement Plan
## GitHub OAuth with Organization Support Implementation

---

## 🎯 Executive Summary

**Current State**: Octocode MCP already has extensive OAuth 2.0/2.1 infrastructure in place, including OAuthManager, GitHubAppManager, and comprehensive token management. However, **the OAuth flow is not fully exposed as an MCP endpoint** and organization-specific authentication workflows need enhancement.

**Objective**: Complete the OAuth implementation by exposing OAuth flows as MCP endpoints and enhance organization support for enterprise use cases.

**Key Finding**: ✅ **GitHub OAuth FULLY supports organizations** through the `read:org` scope - this is already documented and partially implemented in Octocode MCP.

---

## 🔍 Current State Analysis

Based on my comprehensive code analysis of `bgauryy/octocode-mcp`:

### ✅ **What's Already Implemented**
- **Comprehensive OAuth 2.0/2.1 Manager** (`src/auth/oauthManager.ts`)
  - PKCE support (RFC 7636 compliant)
  - Secure state validation with timing-safe comparison
  - Automatic token refresh with retry logic
  - GitHub Enterprise Server support
  - Enterprise audit logging integration

- **Advanced Token Management** (`src/mcp/tools/utils/tokenManager.ts`)
  - OAuth token priority (OAuth > GitHub App > Env > CLI)
  - Automatic token refresh scheduling
  - Secure credential storage via `SecureCredentialStore`
  - Enterprise audit logging integration

- **Authentication Manager** (`src/auth/authenticationManager.ts`)
  - Unified initialization for all auth protocols
  - Enterprise feature detection and initialization
  - MCP Auth Protocol integration

- **Organization Support Infrastructure**
  - `read:org` scope documented and supported
  - Organization validation in enterprise mode
  - Team-based access control foundations

### ❌ **What's Missing**
- **OAuth endpoints exposed via MCP** - OAuth flow exists but not as MCP tool
- **Complete organization membership checking** - Infrastructure exists but needs completion
- **OAuth callback handling in MCP context** - Need MCP-compatible OAuth flow
- **Organization/team-based tool registration** - Tools not dynamically registered based on org membership

### 🏗️ **Architecture Already in Place**
```
┌─────────────────────────────────────────────────────────────┐
│                    EXISTING OCTOCODE MCP                     │
├─────────────────────────────────────────────────────────────┤
│ ✅ OAuthManager (full OAuth 2.0/2.1 + PKCE)                │
│ ✅ TokenManager (OAuth priority + auto-refresh)             │
│ ✅ AuthenticationManager (unified initialization)           │
│ ✅ SecureCredentialStore (token storage)                    │
│ ✅ Enterprise features (audit, rate limiting, org validation)│
│ ✅ GitHub Enterprise Server support                         │
│ ❌ MCP OAuth endpoints (MISSING)                            │
│ ❌ Organization membership tools (MISSING)                  │
│ ❌ Dynamic tool registration based on org access (MISSING)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Motivation

### **The Problem**
Enterprise teams need GitHub OAuth authentication for MCP servers with organization-based access control, but:

1. **OAuth flows aren't exposed as MCP tools** - Users can't initiate OAuth from MCP clients
2. **Organization access isn't fully automated** - Manual configuration required instead of dynamic org checking
3. **No org-based tool filtering** - All tools available to all users regardless of org membership

### **The Opportunity** 
Octocode MCP has 90% of the OAuth infrastructure already built. By completing the missing pieces, we can provide:

- **Enterprise-ready authentication** with minimal additional code
- **Organization-based access control** leveraging existing infrastructure  
- **Dynamic tool availability** based on GitHub org/team membership
- **Complete OAuth 2.0/2.1 compliance** with PKCE security

### **Business Impact**
- **Accelerated enterprise adoption** - OAuth + org support is crucial for enterprise customers
- **Enhanced security posture** - Proper OAuth flows with organization validation
- **Reduced integration complexity** - Built-in OAuth vs external OAuth proxy requirements
- **Competitive advantage** - Few MCP servers offer comprehensive OAuth + organization support

---

## 🎯 Goals

### **Primary Goals**

1. **Complete OAuth MCP Integration**
   - Expose OAuth initiation and callback as MCP tools
   - Enable MCP clients to trigger OAuth flows seamlessly
   - Integrate OAuth completion with existing token management

2. **Enhanced Organization Support**
   - Automatic organization membership detection
   - Organization-based tool filtering
   - Team-specific tool availability
   - Dynamic permission management

3. **Enterprise Security Enhancement**
   - Organization validation for all authenticated users
   - Audit logging for organization-based access decisions
   - Policy enforcement based on org membership

### **Secondary Goals**

1. **Developer Experience**
   - Clear OAuth setup documentation
   - Example implementations for common scenarios  
   - Debugging tools for OAuth flow issues

2. **Production Readiness**
   - Comprehensive error handling
   - Rate limiting for OAuth endpoints
   - Security best practices implementation

---

## 🚀 MVP Definition

### **MVP Scope: OAuth + Organization Authentication**

The MVP focuses on completing what's already 90% built rather than rebuilding:

#### **Phase 1: MCP OAuth Endpoints (Week 1)**
- `oauth_initiate` tool - Start OAuth flow from MCP client
- `oauth_callback` tool - Handle OAuth completion  
- `oauth_status` tool - Check current OAuth state
- Integration with existing OAuthManager

#### **Phase 2: Organization Integration (Week 1-2)**  
- `check_organization_membership` tool
- `list_user_organizations` tool
- Dynamic tool registration based on org membership
- Organization-based access control

#### **Phase 3: Enhanced Tools (Week 2)**
- Extend existing tools with organization context
- Organization-specific rate limiting
- Enhanced audit logging for org access

### **MVP Success Criteria**

✅ **OAuth Flow Completion**
- User can initiate OAuth from Claude Desktop/MCP client
- OAuth callback successfully completes token exchange
- Tokens are stored and refreshed automatically

✅ **Organization Support**  
- User's organization membership is automatically detected
- Tools are filtered based on organization membership
- Organization-specific access policies are enforced

✅ **Enterprise Integration**
- OAuth flows integrate with existing enterprise features
- Audit logging captures OAuth + organization events
- Rate limiting protects OAuth endpoints

---

## 🏗️ Context & Technical Foundation

### **Existing Infrastructure Analysis**

#### **OAuthManager (`src/auth/oauthManager.ts`)**
```typescript
// Already implemented - 474 lines of production-ready OAuth code
class OAuthManager {
  ✅ generatePKCEParams(): PKCEParams
  ✅ generateState(): string  
  ✅ createAuthorizationUrl(state, codeChallenge): string
  ✅ exchangeCodeForToken(code, codeVerifier): Promise<TokenResponse>
  ✅ refreshToken(refreshToken): Promise<TokenResponse>
  ✅ validateToken(token): Promise<TokenValidation>
  ✅ revokeToken(token): Promise<void>
}
```

#### **TokenManager (`src/mcp/tools/utils/tokenManager.ts`)**
```typescript
// Already implemented - 1113 lines with OAuth priority
export async function getGitHubToken(): Promise<string | null> {
  // Priority: OAuth > GitHub App > Environment > CLI > Authorization
  ✅ OAuth tokens get highest priority
  ✅ Automatic refresh scheduling  
  ✅ Secure credential storage
  ✅ Enterprise audit logging
}
```

#### **Enterprise Features**
- ✅ **Audit Logging** - Complete JSONL logging to `./logs/audit/`
- ✅ **Rate Limiting** - Configurable per-hour limits
- ✅ **Organization Manager** - Foundation for org validation
- ✅ **Policy Manager** - Enterprise policy enforcement

### **GitHub API Organization Support**

Based on research of working implementations:

```typescript
// Organization membership checking (to be implemented)
async function checkOrganizationMembership(octokit: Octokit, username: string, org: string): Promise<boolean> {
  try {
    await octokit.rest.orgs.getMembershipForUser({
      org,
      username
    });
    return true;
  } catch (error) {
    return error.status !== 404;
  }
}

// Team membership checking (to be implemented)  
async function checkTeamMembership(octokit: Octokit, username: string, org: string, team: string): Promise<boolean> {
  try {
    const membership = await octokit.rest.teams.getMembershipForUserInOrg({
      org,
      team_slug: team,
      username
    });
    return membership.data.state === 'active';
  } catch {
    return false;
  }
}
```

---

## 📋 Implementation Plan

### **Phase 1: MCP OAuth Tools (Week 1)**

#### **1.1 Create OAuth MCP Tools**

**File**: `src/mcp/tools/oauth/oauthTools.ts`

```typescript
// New file to create
export const oauthTools = [
  {
    name: 'oauth_initiate',
    description: 'Start GitHub OAuth authentication flow',
    inputSchema: {
      type: 'object',
      properties: {
        scopes: {
          type: 'array',
          items: { type: 'string' },
          description: 'OAuth scopes to request',
          default: ['repo', 'read:user', 'read:org']
        },
        organization: {
          type: 'string',
          description: 'Organization to validate membership for',
          optional: true
        }
      }
    }
  },
  {
    name: 'oauth_status',
    description: 'Check current OAuth authentication status',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'oauth_revoke',
    description: 'Revoke current OAuth token',
    inputSchema: { type: 'object', properties: {} }
  }
];
```

#### **1.2 Implement OAuth Tool Handlers**

**File**: `src/mcp/tools/oauth/oauthHandlers.ts`

```typescript
// New file to create - integrates with existing OAuthManager
import { OAuthManager } from '../../../auth/oauthManager.js';
import { getTokenMetadata } from '../../utils/tokenManager.js';

export async function handleOAuthInitiate(args: any) {
  const oauthManager = OAuthManager.getInstance();
  
  // Use existing OAuthManager methods
  const { authorizationUrl, state, codeVerifier } = oauthManager.startAuthorizationFlow({
    organization: args.organization
  });
  
  // Store state and codeVerifier for callback
  await storeOAuthState(state, codeVerifier, args.organization);
  
  return {
    authorizationUrl,
    instructions: "Visit this URL to authorize the application",
    state
  };
}

export async function handleOAuthStatus(args: any) {
  const metadata = await getTokenMetadata();
  
  if (metadata.source === 'oauth') {
    return {
      authenticated: true,
      source: 'oauth',
      expiresAt: metadata.expiresAt,
      scopes: metadata.scopes,
      organization: await getCurrentOrganization()
    };
  }
  
  return { authenticated: false };
}
```

#### **1.3 OAuth Callback Integration**

**File**: `src/mcp/tools/oauth/oauthCallback.ts`

```typescript
// New file to create - handles OAuth callback flow
export class OAuthCallbackHandler {
  async handleCallback(code: string, state: string): Promise<void> {
    const oauthManager = OAuthManager.getInstance();
    
    // Retrieve stored state and codeVerifier
    const storedData = await getOAuthState(state);
    if (!storedData) throw new Error('Invalid OAuth state');
    
    // Use existing OAuthManager for token exchange
    const tokenResponse = await oauthManager.exchangeCodeForToken(
      code, 
      storedData.codeVerifier, 
      state
    );
    
    // Store using existing tokenManager
    await storeOAuthTokenInfo({
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      expiresAt: new Date(Date.now() + tokenResponse.expiresIn * 1000),
      scopes: tokenResponse.scope.split(' '),
      tokenType: tokenResponse.tokenType,
      clientId: oauthManager.getConfig()?.clientId
    });
    
    // Check organization membership if specified
    if (storedData.organization) {
      await validateOrganizationMembership(tokenResponse.accessToken, storedData.organization);
    }
    
    await clearOAuthState(state);
  }
}
```

### **Phase 2: Organization Integration (Week 1-2)**

#### **2.1 Organization Membership Tools**

**File**: `src/mcp/tools/organization/organizationTools.ts`

```typescript
// New file to create
export const organizationTools = [
  {
    name: 'check_organization_membership',
    description: 'Check if authenticated user is member of specified organization',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' }
      },
      required: ['organization']
    }
  },
  {
    name: 'list_user_organizations', 
    description: 'List organizations the authenticated user belongs to',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'check_team_membership',
    description: 'Check if user is member of specific team within organization',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' },
        team: { type: 'string', description: 'Team slug' }
      },
      required: ['organization', 'team']
    }
  }
];
```

#### **2.2 Organization Service Implementation** 

**File**: `src/services/organizationService.ts`

```typescript
// New file to create
import { Octokit } from 'octokit';
import { getGitHubToken } from '../mcp/tools/utils/tokenManager.js';

export class OrganizationService {
  private octokit: Octokit;
  
  constructor() {
    // Uses existing token management
    this.octokit = new Octokit({ 
      auth: async () => await getGitHubToken()
    });
  }
  
  async checkMembership(username: string, organization: string): Promise<boolean> {
    try {
      await this.octokit.rest.orgs.getMembershipForUser({
        org: organization,
        username
      });
      return true;
    } catch (error: any) {
      if (error.status === 404) return false;
      throw error;
    }
  }
  
  async getUserOrganizations(username?: string): Promise<string[]> {
    const response = username 
      ? await this.octokit.rest.orgs.listForUser({ username })
      : await this.octokit.rest.orgs.listForAuthenticatedUser();
      
    return response.data.map(org => org.login);
  }
  
  async checkTeamMembership(username: string, org: string, team: string): Promise<boolean> {
    try {
      const membership = await this.octokit.rest.teams.getMembershipForUserInOrg({
        org,
        team_slug: team,
        username
      });
      return membership.data.state === 'active';
    } catch {
      return false;
    }
  }
}
```

#### **2.3 Dynamic Tool Registration**

**File**: `src/mcp/tools/utils/dynamicToolRegistration.ts`

```typescript
// New file to create - extends existing tool registration
import { OrganizationService } from '../../../services/organizationService.js';
import { getTokenMetadata } from './tokenManager.js';

interface ToolAccessConfig {
  requiredOrganizations?: string[];
  requiredTeams?: Array<{ org: string; team: string }>;
  requiresOAuth?: boolean;
}

export async function getAvailableTools(): Promise<any[]> {
  const metadata = await getTokenMetadata();
  const orgService = new OrganizationService();
  
  const baseTools = [
    // Existing tools available to all authenticated users
    'githubSearchCode',
    'githubSearchRepositories', 
    'githubGetFileContent',
    'githubViewRepoStructure'
  ];
  
  const organizationTools = [
    // Tools requiring organization membership
    'checkOrg