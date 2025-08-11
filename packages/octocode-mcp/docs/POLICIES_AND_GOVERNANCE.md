# Policies & Governance for Octocode MCP Server

Organizations and enterprises have comprehensive control mechanisms for Octocode MCP Server deployments through built-in enterprise features and GitHub's native policy systems.

This document outlines available control mechanisms, security features, and best practices for managing Octocode MCP Server access across your organization.

---

## How Octocode MCP Server Works

Octocode MCP Server provides GitHub repository analysis and package discovery through a secure, locally-deployed architecture with optional enterprise features.

### Deployment Architecture

**Local Deployment Model:**
- **Runs**: Locally alongside IDEs and applications
- **Authentication**: Personal Access Tokens (PATs) with multiple resolution methods
- **Enterprise Controls**: Built-in organization management, audit logging, and access controls
- **Security**: CLI token resolution disabled in enterprise mode for enhanced security
- **Compatibility**: Works with GitHub Enterprise Server (GHES) and GitHub Enterprise Cloud (GHEC)

### Security Principles

- **Authentication Required**: No anonymous access - all operations require valid GitHub tokens
- **Authorization Enforced**: Access limited by GitHub's native permission model
- **CLI Restrictions**: GitHub CLI token resolution disabled in enterprise mode to prevent credential leakage
- **Content Filtering**: Automatic sanitization of sensitive content and secrets
- **Audit Trail**: Comprehensive logging when enterprise features are enabled
- **Rate Limiting**: Built-in protection against abuse and resource exhaustion

---

## Enterprise Control Mechanisms

### 1. Organization Management

**Configuration:**
```bash
export GITHUB_ORGANIZATION="your-org"
export GITHUB_ORGANIZATION_NAME="Your Organization"
```

**Features:**
- **Membership Validation**: Verify users are organization members
- **Team Requirements**: Require membership in specific teams
- **Admin Override**: Designated admin users bypass restrictions
- **Caching**: 15-minute membership cache for performance

**Access Controls:**
```bash
# Restrict to specific users
export GITHUB_ALLOWED_USERS="user1,user2,user3"

# Require membership in ALL listed teams
export GITHUB_REQUIRED_TEAMS="developers,security,compliance"

# Admin users with elevated privileges
export GITHUB_ADMIN_USERS="admin1,admin2"

# Block non-organization members
export RESTRICT_TO_MEMBERS=true
```

### 2. Audit Logging

**Configuration:**
```bash
export AUDIT_ALL_ACCESS=true
export AUDIT_LOG_DIR="./logs/audit"
```

**Capabilities:**
- **Comprehensive Event Tracking**: All API calls, tool executions, and access attempts
- **JSONL Format**: Machine-readable logs for analysis tools
- **Periodic Persistence**: 5-minute flush intervals with immediate flush on exit
- **Security Events**: Token resolution, organization validation, access denials
- **Performance Monitoring**: Rate limiting events and policy evaluations

**Log Structure:**
```json
{
  "eventId": "abc123def456",
  "timestamp": "2025-01-27T10:30:00.000Z",
  "userId": "developer1",
  "organizationId": "my-org",
  "action": "tool_github_search_code",
  "outcome": "success",
  "resource": "owner/repo",
  "source": "tool_execution",
  "details": {
    "query": "authentication",
    "results": 42
  }
}
```

### 3. Rate Limiting

**Configuration:**
```bash
export RATE_LIMIT_API_HOUR=1000     # API requests per hour
export RATE_LIMIT_AUTH_HOUR=10      # Authentication attempts per hour  
export RATE_LIMIT_TOKEN_HOUR=50     # Token requests per hour
```

**Features:**
- **Per-User Limits**: Individual sliding windows for each user
- **Multiple Categories**: Separate limits for API, auth, and token operations
- **Sliding Window Algorithm**: Smooth rate limiting without burst penalties
- **Automatic Cleanup**: Expired windows cleaned up automatically

### 4. Policy Management

**Built-in Policies:**
- **MFA Requirements**: Configurable multi-factor authentication policies
- **Repository Access**: Control access to specific repositories
- **Admin Privileges**: Policy-based administrative access
- **Audit Requirements**: Mandatory logging for sensitive operations

**Custom Policy Example:**
```typescript
// Automatically loaded from environment
const mfaPolicy = {
  id: 'require_mfa',
  name: 'Multi-Factor Authentication Required',
  enabled: process.env.REQUIRE_MFA === 'true',
  conditions: [
    { type: 'org_member', field: 'organizationId', operator: 'equals', value: 'my-org' }
  ],
  actions: [
    { type: 'audit_log', parameters: { event: 'mfa_policy_checked' } }
  ]
};
```

### 5. Toolset Management

**GitHub MCP Compatible:**
```bash
# Enable specific toolset groups
export GITHUB_TOOLSETS="repos,search,packages"

# Read-only mode (disables write operations)
export GITHUB_READ_ONLY=true

# Dynamic toolset discovery
export GITHUB_DYNAMIC_TOOLSETS=true
```

**Available Toolsets:**
- **`repos`**: Repository analysis and file access
- **`search`**: Code, commit, and PR search capabilities
- **`packages`**: NPM and Python package discovery
- **`enterprise`**: Advanced security and audit features
- **`all`**: Enable all available toolsets (default)

---

## GitHub Policy Integration

### Personal Access Token (PAT) Controls

**Organization-Level PAT Policies:**
- **Fine-grained PAT Requirements**: Enforce use of fine-grained PATs over classic tokens
- **Scope Restrictions**: Limit available scopes for organizational repositories
- **Expiration Policies**: Require token rotation at regular intervals
- **Approval Workflows**: Require admin approval for PAT creation

**SSO Integration:**
- **SSO Enforcement**: Requires valid SSO session for organizational access
- **Token Validation**: PATs must be created with active SSO session
- **Session Monitoring**: Automatic invalidation on SSO session expiry

### Repository Access Controls

**Native GitHub Permissions:**
- **Repository Visibility**: Respects public/private repository settings
- **Collaborator Access**: Limited to repositories user has access to
- **Organization Membership**: Private repository access requires membership
- **Team Permissions**: Repository access follows team-based permissions

---

## Security Best Practices

### For Organizations

**Token Management:**
- Mandate fine-grained Personal Access Tokens over classic tokens
- Establish 90-day maximum token expiration policies
- Implement automated token rotation reminders
- Monitor token usage through audit logs

**Access Controls:**
- Use team-based access requirements for sensitive repositories
- Implement admin user designation for emergency access
- Enable comprehensive audit logging for compliance
- Regular review of organization membership and team assignments

**Policy Enforcement:**
- Enable MFA requirements for all organizational access
- Restrict access to organization members only
- Implement rate limiting to prevent abuse
- Regular policy review and updates

### For Developers and Users

**Authentication Security:**
- **Enterprise Mode**: Use environment variables (`GITHUB_TOKEN`, `GH_TOKEN`) for token management
- **Individual Mode**: GitHub CLI authentication available for automatic token management
- **CLI Restriction**: GitHub CLI token resolution disabled in enterprise mode for security
- Store tokens securely using platform credential managers
- Never commit tokens to version control
- Regular token rotation and access review

**Scope Minimization:**
- Request only minimum required scopes for your use case
- Use repository-specific access instead of organization-wide access
- Regular review and cleanup of unused token permissions
- Document token usage and business justification

---

## Compliance and Monitoring

### Audit Capabilities

**Real-time Monitoring:**
- All API calls logged with user, timestamp, and outcome
- Failed access attempts tracked and alertable
- Token resolution and validation events
- Organization membership validation results

**Compliance Reporting:**
- JSONL format compatible with log analysis tools
- Structured events for automated processing
- Retention policies configurable via log rotation
- Export capabilities for compliance systems

### Access Analytics

**Usage Patterns:**
- Per-user API usage statistics
- Tool usage frequency and patterns
- Rate limiting trigger analysis
- Organization membership validation metrics

**Security Metrics:**
- Failed authentication attempts
- Access denial reasons and frequency
- Token source tracking (CLI vs environment)
- Admin override usage patterns

---

## Migration from GitHub MCP Server

### Configuration Mapping

**GitHub MCP → Octocode MCP:**
```bash
# GitHub MCP Server
export GITHUB_TOOLSETS="repos,issues,pull_requests"
export GITHUB_READ_ONLY=true

# Octocode MCP (compatible)
export GITHUB_TOOLSETS="repos,search"  # Maps to equivalent toolsets
export GITHUB_READ_ONLY=true           # Direct compatibility
```

**Enhanced Features:**
- **Organization Management**: More granular than GitHub's policy system
- **Audit Logging**: More detailed than GitHub's standard audit logs
- **Rate Limiting**: Not available in GitHub MCP Server
- **Policy Framework**: More flexible than GitHub's fixed policies

---

## Resources

**MCP Protocol:**
- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/)
- [MCP Authorization Guide](https://modelcontextprotocol.io/specification/draft/basic/authorization)

**GitHub Enterprise:**
- [GitHub Enterprise Server Documentation](https://docs.github.com/en/enterprise-server)
- [Personal Access Token Policies](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization)
- [SSO Enforcement](https://docs.github.com/en/enterprise-cloud@latest/authentication/authenticating-with-single-sign-on)

**Security Best Practices:**
- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [Token Security Guidelines](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

---

**Questions or Feedback?**

Open an [issue in the Octocode MCP repository](https://github.com/your-org/octocode-mcp/issues) with the label "policies & governance" attached.

This document reflects Octocode MCP Server policies and capabilities as of January 2025. Features and policies continue to evolve based on user feedback and security best practices.
