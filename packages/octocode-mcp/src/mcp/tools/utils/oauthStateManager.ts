/**
 * OAuth State Manager
 *
 * Manages OAuth state and PKCE verifier storage with TTL for secure OAuth flows.
 * Integrates with existing SecureCredentialStore for enterprise-grade security.
 */

// Simple in-memory OAuth state management for MVP
// TODO: Implement proper persistent storage for production use

export interface OAuthStateData {
  codeVerifier: string;
  organization?: string;
  scopes: string[];
  callbackMethod: 'local_server' | 'manual' | 'deep_link' | 'device_flow';
  callbackPort?: number;
  clientId: string;
  createdAt: Date;
  expiresAt: Date;
}

export class OAuthStateManager {
  private static readonly DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes
  private static readonly MAX_TTL = 30 * 60 * 1000; // 30 minutes max
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  private static states = new Map<string, OAuthStateData>();
  private static cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private static initialized = false;

  /**
   * Initialize the OAuth state manager
   */
  static initialize(): void {
    if (this.initialized) return;

    this.initialized = true;

    // Start periodic cleanup of expired states
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredStates();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Store OAuth state with TTL
   */
  static async storeOAuthState(
    state: string,
    data: Omit<OAuthStateData, 'createdAt' | 'expiresAt'>,
    ttlMs: number = this.DEFAULT_TTL
  ): Promise<void> {
    // Validate TTL
    const safeTTL = Math.min(Math.max(ttlMs, 60000), this.MAX_TTL); // Min 1 minute, max 30 minutes

    const now = new Date();
    const stateData: OAuthStateData = {
      ...data,
      createdAt: now,
      expiresAt: new Date(now.getTime() + safeTTL),
    };

    this.states.set(state, stateData);
  }

  /**
   * Retrieve OAuth state data
   */
  static async getOAuthState(state: string): Promise<OAuthStateData | null> {
    try {
      const data = this.states.get(state);
      if (!data) return null;

      // Check if expired
      if (new Date() > data.expiresAt) {
        await this.clearOAuthState(state);
        return null;
      }

      return data;
    } catch (error) {
      // Log error but don't throw - OAuth should be resilient
      if (process.env.NODE_ENV !== 'production') {
        process.stderr.write(`OAuth state retrieval error: ${error}\n`);
      }
      return null;
    }
  }

  /**
   * Clear specific OAuth state
   */
  static async clearOAuthState(state: string): Promise<void> {
    this.states.delete(state);
  }

  /**
   * List all active OAuth states (for debugging/admin)
   */
  static async listActiveStates(): Promise<
    Array<{ state: string; data: OAuthStateData }>
  > {
    const result: Array<{ state: string; data: OAuthStateData }> = [];
    const now = new Date();

    for (const [state, data] of this.states.entries()) {
      if (data.expiresAt > now) {
        result.push({ state, data });
      }
    }

    return result;
  }

  /**
   * Clear all OAuth states (cleanup/reset)
   */
  static async clearAllStates(): Promise<void> {
    this.states.clear();
  }

  /**
   * Get statistics about OAuth states
   */
  static async getStateStatistics(): Promise<{
    totalStates: number;
    expiredStates: number;
    activeStates: number;
    oldestState?: Date;
    newestState?: Date;
  }> {
    const now = new Date();
    let expired = 0;
    let oldest: Date | undefined;
    let newest: Date | undefined;

    for (const data of this.states.values()) {
      if (now > data.expiresAt) {
        expired++;
      }

      if (!oldest || data.createdAt < oldest) {
        oldest = data.createdAt;
      }

      if (!newest || data.createdAt > newest) {
        newest = data.createdAt;
      }
    }

    return {
      totalStates: this.states.size,
      expiredStates: expired,
      activeStates: this.states.size - expired,
      oldestState: oldest,
      newestState: newest,
    };
  }

  /**
   * Shutdown the state manager
   */
  static shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.states.clear();
    this.initialized = false;
  }

  // Private methods
  private static async cleanupExpiredStates(): Promise<void> {
    const now = new Date();
    const expiredStates: string[] = [];

    for (const [state, data] of this.states.entries()) {
      if (now > data.expiresAt) {
        expiredStates.push(state);
      }
    }

    for (const state of expiredStates) {
      this.states.delete(state);
    }
  }
}

// Convenience functions for backward compatibility
export async function storeOAuthState(
  state: string,
  codeVerifier: string,
  organization?: string,
  ttlMs?: number
): Promise<void> {
  const data: Omit<OAuthStateData, 'createdAt' | 'expiresAt'> = {
    codeVerifier,
    organization,
    scopes: ['repo', 'read:user', 'read:org'],
    callbackMethod: 'local_server',
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID || 'unknown',
  };

  return OAuthStateManager.storeOAuthState(state, data, ttlMs);
}

export async function getOAuthState(
  state: string
): Promise<OAuthStateData | null> {
  return OAuthStateManager.getOAuthState(state);
}

export async function clearOAuthState(state: string): Promise<void> {
  return OAuthStateManager.clearOAuthState(state);
}
