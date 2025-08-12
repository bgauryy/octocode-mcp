# 🚀 Authentication Quick Reference

## 30-Second Setup

### Local Development
```bash
gh auth login  # Recommended
# OR
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
```

### Production
```bash
# OAuth (Recommended)
export GITHUB_OAUTH_CLIENT_ID="your_client_id"
export GITHUB_OAUTH_CLIENT_SECRET="your_client_secret"
export GITHUB_OAUTH_ENABLED="true"

# OR GitHub App
export GITHUB_APP_ID="123456"
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
export GITHUB_APP_ENABLED="true"

# OR Simple Token
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
```

## Token Priority (High → Low)

1. **OAuth Token** (auto-refresh) 🔄
2. **GitHub App Token** (auto-refresh) 🔄  
3. **GITHUB_TOKEN** (environment)
4. **GH_TOKEN** (environment)
5. **GitHub CLI** (local only)
6. **Authorization Header** (fallback)

## Enterprise Mode

```bash
export GITHUB_ORGANIZATION="my-org"
export AUDIT_ALL_ACCESS="true"
export GITHUB_SSO_ENFORCEMENT="true"
```

**Note**: CLI tokens disabled in enterprise mode for security.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No GitHub token found" | Set any token method above |
| "CLI disabled in enterprise" | Use environment variables or OAuth |
| "Rate limit exceeded" | Check `curl -H "Authorization: Bearer $TOKEN" https://api.github.com/rate_limit` |

## Health Check

```javascript
import { getTokenMetadata } from '@octocode/mcp/tokenManager';
const meta = await getTokenMetadata();
console.log('Source:', meta.source, 'Expires:', meta.expiresAt);
```

**📚 Full Documentation**: [AUTHENTICATION.md](./AUTHENTICATION.md)
