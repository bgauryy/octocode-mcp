/**
 * OAuth Facade
 *
 * Simplified OAuth API that provides a clean interface while leveraging
 * the robust underlying implementation. This facade pattern allows for
 * easy OAuth integration with minimal complexity.
 */

import { OAuthManager } from './oauthManager.js';
import { ConfigManager } from '../config/serverConfig.js';
import {
  completeOAuthFlow,
  getOAuthStatus,
  revokeOAuthTokens,
  isOAuthEnabled,
} from './oauthHelpers.js';

/**
 * Simple OAuth configuration
 */
export interface SimpleOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  organization?: string;
}

/**
 * Simple OAuth result
 */
export interface SimpleOAuthResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

/**
 * OAuth Facade - Simplified OAuth interface
 */
export class OAuthFacade {
  private static instance: OAuthFacade;
  private oauthManager: OAuthManager;
  private isInitialized: boolean = false;

  private constructor() {
    this.oauthManager = OAuthManager.getInstance();
  }

  static getInstance(): OAuthFacade {
    if (!this.instance) {
      this.instance = new OAuthFacade();
    }
    return this.instance;
  }

  /**
   * Initialize OAuth with optional configuration
   */
  initialize(config?: SimpleOAuthConfig): SimpleOAuthResult {
    try {
      // Use provided config or fall back to environment
      if (config?.clientId && config?.clientSecret) {
        this.oauthManager.initialize({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          scopes: config.scopes || ['repo', 'read:user', 'read:org'],
        });
      } else {
        // Initialize with default config from environment
        this.oauthManager.initialize();
      }

      this.isInitialized = true;

      return {
        success: true,
        message: 'OAuth initialized successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to initialize OAuth',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Start authentication using Device Flow (simplest method)
   */
  async authenticate(scopes?: string[]): Promise<SimpleOAuthResult> {
    try {
      if (!this.isInitialized) {
        const initResult = this.initialize();
        if (!initResult.success) {
          return initResult;
        }
      }

      // Start device flow
      const deviceFlow = await this.oauthManager.initiateDeviceFlow(
        scopes || ['repo', 'read:user', 'read:org']
      );

      // Start background polling
      this.pollForAuthentication(deviceFlow.device_code, deviceFlow.interval);

      return {
        success: true,
        message: 'Authentication started',
        data: {
          userCode: deviceFlow.user_code,
          verificationUrl: deviceFlow.verification_uri,
          expiresIn: deviceFlow.expires_in,
          instructions: `Visit ${deviceFlow.verification_uri} and enter code: ${deviceFlow.user_code}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to start authentication',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get current authentication status
   */
  async getStatus(): Promise<SimpleOAuthResult> {
    try {
      const status = await getOAuthStatus();

      if (!status.authenticated) {
        return {
          success: true,
          message: 'Not authenticated',
          data: { authenticated: false },
        };
      }

      return {
        success: true,
        message: 'Authenticated',
        data: status,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get status',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Revoke authentication
   */
  async revoke(): Promise<SimpleOAuthResult> {
    try {
      const result = await revokeOAuthTokens();

      return {
        success: true,
        message: result.wasRevoked
          ? 'Authentication revoked'
          : 'No authentication to revoke',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to revoke authentication',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if OAuth is configured and ready
   */
  isConfigured(): boolean {
    return isOAuthEnabled();
  }

  /**
   * Authenticate and wait for completion (convenience method)
   */
  async authenticateAndWait(scopes?: string[]): Promise<SimpleOAuthResult> {
    try {
      if (!this.isInitialized) {
        const initResult = this.initialize();
        if (!initResult.success) {
          return initResult;
        }
      }

      // Start device flow
      const deviceFlow = await this.oauthManager.initiateDeviceFlow(
        scopes || ['repo', 'read:user', 'read:org']
      );

      // Poll and wait for completion
      const tokenResponse = await this.oauthManager.pollDeviceFlowToken(
        deviceFlow.device_code,
        deviceFlow.interval
      );

      // Complete the flow
      const config = ConfigManager.getConfig();
      const flowResult = await completeOAuthFlow(
        tokenResponse,
        {
          scopes: scopes || ['repo', 'read:user', 'read:org'],
          clientId: config.oauth!.clientId,
          organization: undefined,
        },
        false
      );

      return {
        success: true,
        message: 'Authentication completed successfully',
        data: flowResult,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Authentication failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Poll for authentication completion in background
   */
  private async pollForAuthentication(
    deviceCode: string,
    interval: number
  ): Promise<void> {
    try {
      const tokenResponse = await this.oauthManager.pollDeviceFlowToken(
        deviceCode,
        interval
      );

      const config = ConfigManager.getConfig();
      await completeOAuthFlow(
        tokenResponse,
        {
          scopes: ['repo', 'read:user', 'read:org'],
          clientId: config.oauth!.clientId,
          organization: undefined,
        },
        false
      );
    } catch (error) {
      // Log error but don't throw - this runs in background
      process.stderr.write(
        `OAuth background polling error: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }
}

// Convenience functions for simple usage

/**
 * Quick authenticate - starts OAuth flow with device code
 */
export async function quickAuthenticate(
  scopes?: string[]
): Promise<SimpleOAuthResult> {
  const facade = OAuthFacade.getInstance();
  return facade.authenticate(scopes);
}

/**
 * Quick status check
 */
export async function quickStatus(): Promise<SimpleOAuthResult> {
  const facade = OAuthFacade.getInstance();
  return facade.getStatus();
}

/**
 * Quick revoke
 */
export async function quickRevoke(): Promise<SimpleOAuthResult> {
  const facade = OAuthFacade.getInstance();
  return facade.revoke();
}

/**
 * One-line authentication (authenticate and wait)
 */
export async function simpleAuth(
  scopes?: string[]
): Promise<SimpleOAuthResult> {
  const facade = OAuthFacade.getInstance();
  return facade.authenticateAndWait(scopes);
}

// Export the facade for direct use
export default OAuthFacade;
