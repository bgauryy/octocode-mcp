# OAuth MCP Compliance Migration Checklist

## 🎯 **Pre-Migration Checklist**

### ✅ **Environment Preparation**
- [ ] **Backup current configuration** (copy existing .env file)
- [ ] **Verify GitHub OAuth app settings** in GitHub Developer Settings
- [ ] **Check available ports** (default: 3001 for OAuth metadata server)
- [ ] **Review current token usage** and plan for audience validation

### ✅ **Required Environment Variables**
```bash
# CRITICAL - Set these before starting server
- [ ] START_OAUTH_SERVER=true
- [ ] OAUTH_METADATA_PORT=3001  
- [ ] MCP_SERVER_RESOURCE_URI=https://your-server.com/mcp

# EXISTING - Verify these are correct
- [ ] GITHUB_OAUTH_CLIENT_ID=your_client_id
- [ ] GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
- [ ] GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
```

### ✅ **GitHub OAuth App Configuration**
- [ ] **Add callback URLs** in GitHub OAuth app settings:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:8765/auth/callback`
  - `http://127.0.0.1:8765/auth/callback`

## 🚀 **Migration Steps**

### **Step 1: Environment Setup** (5 minutes)
```bash
# 1. Add OAuth compliance variables
export START_OAUTH_SERVER=true
export OAUTH_METADATA_PORT=3001
export MCP_SERVER_RESOURCE_URI=https://your-server.com/mcp

# 2. Verify existing OAuth config
echo "Client ID: $GITHUB_OAUTH_CLIENT_ID"
echo "Client Secret exists: $([ -n "$GITHUB_OAUTH_CLIENT_SECRET" ] && echo "✅" || echo "❌")"
```
- [ ] **Environment variables added**
- [ ] **OAuth credentials verified**

### **Step 2: Test Server Startup** (2 minutes)  
```bash
# Start server and check for OAuth compliance messages
npm start

# Look for these success messages:
# 🔐 OAuth Protected Resource Server listening at http://127.0.0.1:3001
# ✅ MCP OAuth 2.1 compliance: RFC 9728, RFC 8707, RFC 7636
```
- [ ] **Server starts successfully**
- [ ] **OAuth metadata server running on port 3001**
- [ ] **Compliance confirmation messages appear**

### **Step 3: Verify Discovery Endpoints** (3 minutes)
```bash
# Test OAuth discovery endpoints
curl -H "Accept: application/json" http://localhost:3001/.well-known/oauth-protected-resource
curl -H "Accept: application/json" http://localhost:3001/.well-known/oauth-authorization-server
curl http://localhost:3001/health
```
- [ ] **Protected resource endpoint returns valid JSON**
- [ ] **Authorization server endpoint returns metadata**  
- [ ] **Health check endpoint responds**

### **Step 4: Test OAuth Flow** (5 minutes)
```bash
# Use OAuth tools to test complete flow
# 1. Initiate OAuth flow
# 2. Complete authorization
# 3. Check token validation with audience checking
```
- [ ] **OAuth initiation works**
- [ ] **Token exchange successful**
- [ ] **Token validation includes audience checking**
- [ ] **Foreign tokens are rejected**

### **Step 5: Verify Security Features** (3 minutes)
```bash
# Test authentication challenges
curl -v http://localhost:3001/api/protected

# Should return 401 with:
# WWW-Authenticate: Bearer realm="github-api", resource_metadata="..."
```
- [ ] **401 responses include WWW-Authenticate headers**
- [ ] **Resource metadata URL included in challenges**
- [ ] **Token audience validation working**

## 🧪 **Testing Checklist**

### **Unit Tests**
```bash
# Run OAuth compliance tests
npm test tests/auth/oauthCompliance.test.ts
```
- [ ] **All compliance tests pass**
- [ ] **Token audience validation tests pass**
- [ ] **PKCE tests pass**
- [ ] **Discovery endpoint tests pass**

### **Integration Tests**  
```bash
# Test complete OAuth flow
npm run test:integration
```
- [ ] **End-to-end OAuth flow works**
- [ ] **MCP client integration works**
- [ ] **Enterprise features work (if enabled)**

### **Security Tests**
- [ ] **Foreign tokens rejected**
- [ ] **Expired tokens rejected**
- [ ] **Malformed tokens handled gracefully**
- [ ] **Authentication challenges properly formatted**

## 🔧 **Production Deployment**

### **Pre-Deployment**
- [ ] **All tests pass in staging environment**
- [ ] **Performance testing completed**
- [ ] **Security scanning completed**
- [ ] **Documentation updated**

### **Deployment Steps**
1. **Update environment variables** in production
2. **Deploy updated codebase**
3. **Verify OAuth metadata server starts**
4. **Test discovery endpoints**
5. **Monitor for OAuth validation failures**

### **Post-Deployment Verification**
```bash
# Production health checks
curl https://your-server.com:3001/health
curl https://your-server.com:3001/.well-known/oauth-protected-resource

# Monitor logs for OAuth events
tail -f /var/log/mcp-server.log | grep -i oauth
```
- [ ] **Production endpoints accessible**
- [ ] **No OAuth validation errors in logs**
- [ ] **Performance within acceptable limits**

## ⚠️ **Potential Issues & Solutions**

### **Port Conflicts**
```
Error: EADDRINUSE :::3001
```
**Solution**: Change OAuth metadata port
```bash
export OAUTH_METADATA_PORT=3002
```

### **Token Validation Failures**
```
Error: Token audience validation failed
```
**Solution**: Verify client_id configuration
```bash
# Check OAuth app settings match environment
echo "Configured: $GITHUB_OAUTH_CLIENT_ID"
echo "Expected by tokens: [check GitHub OAuth app settings]"
```

### **Discovery Endpoint 404**
```
Error: 404 - /.well-known/oauth-protected-resource
```
**Solution**: Ensure OAuth server enabled
```bash
export START_OAUTH_SERVER=true
```

### **Performance Issues**
```
Token validation taking too long
```
**Solution**: Monitor token validation latency
- First validation: 50-100ms (expected)
- Subsequent validations: <10ms (cached)

## 📊 **Success Metrics**

### **Security Compliance** ✅
- [ ] No foreign tokens accepted (confused deputy protection)
- [ ] All tokens validated for audience
- [ ] PKCE protection active
- [ ] WWW-Authenticate headers present

### **Functional Compliance** ✅  
- [ ] OAuth discovery endpoints working
- [ ] MCP clients can discover authorization servers
- [ ] Complete OAuth 2.1 flow functional
- [ ] Enterprise features operational

### **Performance Compliance** ✅
- [ ] Token validation latency acceptable (<100ms)
- [ ] Memory usage increase acceptable (<10MB)
- [ ] Discovery endpoints fast (<10ms)
- [ ] No significant throughput impact

## 🎉 **Migration Complete**

After completing this checklist, your OAuth implementation will be:

- ✅ **Fully MCP Authorization Protocol compliant**
- ✅ **Protected against confused deputy attacks** 
- ✅ **RFC 8707, 9728, 7636, 6750 compliant**
- ✅ **Enterprise security ready**
- ✅ **Production deployment ready**

**Estimated Total Migration Time**: 20-30 minutes

**Security Status**: CRITICAL VULNERABILITIES RESOLVED ✅
