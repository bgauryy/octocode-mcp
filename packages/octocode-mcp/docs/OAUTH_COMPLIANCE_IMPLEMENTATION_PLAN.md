# OAuth MCP Compliance Implementation Plan

## 🎯 **Objective**
Implement full compliance with the MCP Authorization Protocol specification (2025-06-18) to ensure secure, standards-compliant OAuth 2.1 authentication.

## 📋 **Critical Issues Identified**

### 🚨 **1. Token Audience Validation** - CRITICAL SECURITY
**Status**: ❌ Missing  
**Risk**: **CRITICAL** - Confused Deputy Attacks  
**Specification**: RFC 8707 Resource Indicators

**Problem**: Current `validateToken()` only checks if token is valid with GitHub API, but doesn't verify it was issued specifically for this MCP server.

**Fix Required**:
- Add `validateTokenAudience()` method to verify token provenance
- Modify `validateToken()` to include audience validation
- Use GitHub's token introspection API to verify client_id matches

### 🚨 **2. Authorization Server Discovery** - HIGH PRIORITY  
**Status**: ❌ Missing  
**Risk**: **HIGH** - MCP clients cannot discover OAuth endpoints  
**Specification**: RFC 9728 Protected Resource Metadata

**Problem**: No discovery endpoints for OAuth metadata.

**Fix Required**:
- Implement `/.well-known/oauth-protected-resource` endpoint
- Implement `/.well-known/oauth-authorization-server` endpoint
- Create `ProtectedResourceServer` class

### 🚨 **3. WWW-Authenticate Headers** - MEDIUM PRIORITY
**Status**: ❌ Missing  
**Risk**: **MEDIUM** - Non-compliant 401 responses  
**Specification**: RFC 6750 Bearer Token Usage

**Problem**: 401 responses don't include proper WWW-Authenticate headers.

**Fix Required**:
- Update `MCPAuthProtocol.createAuthChallenge()` implementation
- Ensure all 401 responses include proper challenge headers
- Include `resource_metadata` URL in challenges

## 🛠️ **Implementation Strategy**

### **Phase 1: Core Security (CRITICAL)**
1. **Token Audience Validation** 
   - Modify `OAuthManager.validateToken()`
   - Add `validateTokenAudience()` private method
   - Add audit logging for validation failures

### **Phase 2: Discovery Infrastructure (HIGH)**  
2. **Protected Resource Metadata Server**
   - Create `ProtectedResourceServer` class
   - Implement required RFC 9728 endpoints
   - Add CORS support for discovery

### **Phase 3: Integration (MEDIUM)**
3. **Server Initialization Updates**
   - Update `index.ts` to start metadata server
   - Add environment configuration
   - Update graceful shutdown

### **Phase 4: Testing & Documentation (LOW)**
4. **Tests and Documentation**
   - Add compliance tests
   - Update environment documentation
   - Create migration guide

## 📁 **Files to Modify**

### **Core OAuth Security**
- `src/auth/oauthManager.ts` - Add token audience validation
- `src/auth/mcpAuthProtocol.ts` - Update challenge creation

### **New Infrastructure** 
- `src/http/protectedResourceServer.ts` - **NEW** OAuth discovery server
- `src/index.ts` - Server initialization updates

### **Configuration & Tests**
- `src/config/serverConfig.ts` - Add OAuth metadata config
- `tests/auth/oauthCompliance.test.ts` - **NEW** compliance tests

## 🔧 **Implementation Details**

### **1. Token Audience Validation**

```typescript
// In OAuthManager.validateToken()
async validateToken(token: string, expectedAudience?: string): Promise<TokenValidation> {
  // 1. Basic GitHub API validation (existing)
  
  // 2. NEW: Audience validation
  const resourceUri = expectedAudience || this.getResourceUri();
  const audienceValidation = await this.validateTokenAudience(token, resourceUri);
  
  if (!audienceValidation.validAudience) {
    return {
      valid: false,
      error: `Token audience validation failed: ${audienceValidation.error}`,
      scopes: []
    };
  }
  
  return { valid: true, scopes, audience: resourceUri };
}

private async validateTokenAudience(token: string, expectedResource: string) {
  // Use GitHub's token introspection API to verify client_id
  // POST /applications/{client_id}/token
}
```

### **2. Protected Resource Metadata Server**

```typescript
// New class: ProtectedResourceServer
export class ProtectedResourceServer {
  // Endpoints:
  // GET /.well-known/oauth-protected-resource
  // GET /.well-known/oauth-authorization-server
  // Handles 401 challenges with WWW-Authenticate headers
}
```

### **3. Environment Configuration**

```bash
# New required environment variables
START_OAUTH_SERVER=true                    # Enable metadata server
OAUTH_METADATA_PORT=3001                   # Metadata server port  
MCP_SERVER_RESOURCE_URI=https://your-server.com/mcp  # Canonical URI

# Enhanced existing variables
GITHUB_OAUTH_CLIENT_ID=your_client_id      # Required for audience validation
GITHUB_OAUTH_CLIENT_SECRET=your_secret     # Required for token introspection
```

## 🧪 **Testing Strategy**

### **Unit Tests**
- Token audience validation logic
- OAuth discovery endpoint responses
- WWW-Authenticate header formatting

### **Integration Tests** 
- Full OAuth flow with audience validation
- Discovery endpoint accessibility
- 401 challenge response format

### **Security Tests**
- Foreign token rejection
- Confused deputy attack prevention  
- Proper error handling

## 📊 **Success Metrics**

### **Security Compliance**
- ✅ All tokens validated for audience
- ✅ Foreign tokens rejected  
- ✅ Audit logging for security events

### **RFC Compliance**
- ✅ RFC 8707 Resource Indicators implemented
- ✅ RFC 9728 Protected Resource Metadata available
- ✅ RFC 6750 Bearer token challenges correct

### **Operational**
- ✅ Discovery endpoints responding correctly
- ✅ OAuth flow works end-to-end
- ✅ Enterprise features preserved

## 🚀 **Deployment Plan**

### **Development**
1. Implement fixes in feature branch
2. Run comprehensive test suite  
3. Test with real OAuth flow

### **Staging**
1. Deploy with OAuth metadata server enabled
2. Test discovery endpoints
3. Validate token audience checking

### **Production**
1. Deploy with proper environment configuration
2. Monitor OAuth validation logs
3. Verify compliance with security scanners

## ⏱️ **Timeline Estimate**

- **Phase 1 (Security)**: 2-3 hours - Token audience validation
- **Phase 2 (Discovery)**: 3-4 hours - Metadata server implementation  
- **Phase 3 (Integration)**: 1-2 hours - Server initialization updates
- **Phase 4 (Testing)**: 2-3 hours - Tests and documentation

**Total**: 8-12 hours for complete implementation

## 🔐 **Security Impact**

### **Before Implementation**
- ❌ Vulnerable to confused deputy attacks
- ❌ Accepts tokens from any GitHub OAuth app
- ❌ No discovery mechanism for OAuth clients

### **After Implementation**  
- ✅ Only accepts tokens issued for this specific MCP server
- ✅ Full RFC compliance for OAuth 2.1 security
- ✅ Proper discovery and challenge mechanisms
- ✅ Enterprise-grade audit logging

This implementation will elevate the OAuth security from **vulnerable** to **enterprise-grade compliant**.
