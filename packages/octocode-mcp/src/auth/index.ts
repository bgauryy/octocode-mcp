/**
 * OAuth Authentication Module Exports
 *
 * Provides both simple and advanced OAuth authentication APIs
 */

// Core OAuth implementation
export {
  OAuthManager,
  type OAuthConfig,
  type TokenResponse,
} from './oauthManager.js';

// Simplified OAuth API (Recommended for most use cases)
export {
  OAuthFacade,
  quickAuthenticate,
  quickStatus,
  quickRevoke,
  simpleAuth,
  type SimpleOAuthConfig,
  type SimpleOAuthResult,
} from './oauthFacade.js';

// Shared OAuth helpers
export {
  completeOAuthFlow,
  checkOAuthConfig,
  getOAuthStatus,
  revokeOAuthTokens,
  isOAuthEnabled,
  initializeOAuthState,
  storeOAuthState,
  getAndValidateOAuthState,
  clearOAuthState,
  generateAuthorizationUrl,
  validateState,
  exchangeCodeForTokens,
  type OAuthFlowResult,
} from './oauthHelpers.js';

// Authentication manager (handles multiple auth methods)
export { AuthenticationManager } from './authenticationManager.js';

// GitHub App authentication
export { GitHubAppManager } from './githubAppManager.js';

// MCP Auth Protocol
export { MCPAuthProtocol } from './mcpAuthProtocol.js';
