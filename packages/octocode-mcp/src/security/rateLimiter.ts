/**
 * Enterprise Rate Limiter
 *
 * Provides configurable rate limiting for API requests, authentication attempts,
 * and token operations. Uses sliding window algorithm with in-memory storage
 * for high performance and simplicity.
 */

interface RateLimit {
  requests: number;
  windowStart: Date;
  windowSize: number; // milliseconds
}

interface UserLimits {
  api: RateLimit;
  authentication: RateLimit;
  tokenRequests: RateLimit;
}

export interface RateLimitResult {
  allowed: boolean;
  resetTime?: Date;
  remaining?: number;
  limit?: number;
  windowSize?: number;
}

export interface RateLimitConfig {
  apiRequestsPerHour: number;
  authAttemptsPerHour: number;
  tokenRequestsPerHour: number;
}

export class RateLimiter {
  private static userLimits = new Map<string, UserLimits>();
  private static initialized = false;
  private static config: RateLimitConfig = {
    apiRequestsPerHour: parseInt(process.env.RATE_LIMIT_API_HOUR || '1000'),
    authAttemptsPerHour: parseInt(process.env.RATE_LIMIT_AUTH_HOUR || '10'),
    tokenRequestsPerHour: parseInt(process.env.RATE_LIMIT_TOKEN_HOUR || '50'),
  };
  private static cleanupInterval: ReturnType<typeof setTimeout> | null = null;

  /**
   * Initialize rate limiter
   * Safe to call multiple times - no-op if already initialized
   */
  static initialize(): void {
    if (this.initialized) return;

    this.initialized = true;

    // Load configuration from environment
    this.loadConfiguration();

    // Set up periodic cleanup of expired windows
    this.setupCleanup();
  }

  /**
   * Check if an action is allowed for a user
   * Returns rate limit information and whether the action should be allowed
   */
  static async checkLimit(
    userId: string,
    action: 'api' | 'auth' | 'token',
    options: {
      increment?: boolean; // Whether to increment the counter (default: true)
      customLimit?: number; // Override the configured limit
    } = {}
  ): Promise<RateLimitResult> {
    if (!this.initialized) {
      // If not initialized, allow all requests
      return { allowed: true };
    }

    const { increment = true, customLimit } = options;
    const userLimits = this.getUserLimits(userId);
    const limitKey =
      action === 'auth'
        ? 'authentication'
        : action === 'token'
          ? 'tokenRequests'
          : 'api';
    const limit = userLimits[limitKey];

    const now = new Date();
    const windowExpired =
      now.getTime() - limit.windowStart.getTime() >= limit.windowSize;

    // Reset window if expired
    if (windowExpired) {
      limit.requests = 0;
      limit.windowStart = now;
    }

    const maxRequests = customLimit ?? this.getMaxRequests(action);
    const allowed = limit.requests < maxRequests;

    // Increment counter if requested and allowed
    if (increment && allowed) {
      limit.requests++;
    }

    const resetTime = new Date(limit.windowStart.getTime() + limit.windowSize);
    const remaining = Math.max(0, maxRequests - limit.requests);

    return {
      allowed,
      resetTime,
      remaining,
      limit: maxRequests,
      windowSize: limit.windowSize,
    };
  }

  /**
   * Record a successful action (increments counter)
   * Use this when you want to check and increment in separate steps
   */
  static recordAction(userId: string, action: 'api' | 'auth' | 'token'): void {
    if (!this.initialized) return;

    const userLimits = this.getUserLimits(userId);
    const limitKey =
      action === 'auth'
        ? 'authentication'
        : action === 'token'
          ? 'tokenRequests'
          : 'api';
    const limit = userLimits[limitKey];

    const now = new Date();
    const windowExpired =
      now.getTime() - limit.windowStart.getTime() >= limit.windowSize;

    // Reset window if expired
    if (windowExpired) {
      limit.requests = 0;
      limit.windowStart = now;
    }

    limit.requests++;
  }

  /**
   * Get current usage for a user
   */
  static getUsage(userId: string): {
    api: { current: number; limit: number; resetTime: Date };
    auth: { current: number; limit: number; resetTime: Date };
    token: { current: number; limit: number; resetTime: Date };
  } {
    if (!this.initialized) {
      return {
        api: { current: 0, limit: 0, resetTime: new Date() },
        auth: { current: 0, limit: 0, resetTime: new Date() },
        token: { current: 0, limit: 0, resetTime: new Date() },
      };
    }

    const userLimits = this.getUserLimits(userId);

    return {
      api: {
        current: userLimits.api.requests,
        limit: this.config.apiRequestsPerHour,
        resetTime: new Date(
          userLimits.api.windowStart.getTime() + userLimits.api.windowSize
        ),
      },
      auth: {
        current: userLimits.authentication.requests,
        limit: this.config.authAttemptsPerHour,
        resetTime: new Date(
          userLimits.authentication.windowStart.getTime() +
            userLimits.authentication.windowSize
        ),
      },
      token: {
        current: userLimits.tokenRequests.requests,
        limit: this.config.tokenRequestsPerHour,
        resetTime: new Date(
          userLimits.tokenRequests.windowStart.getTime() +
            userLimits.tokenRequests.windowSize
        ),
      },
    };
  }

  /**
   * Reset limits for a user (for testing or admin override)
   */
  static resetUserLimits(userId: string): void {
    this.userLimits.delete(userId);
  }

  /**
   * Reset all limits (for testing)
   */
  static resetAllLimits(): void {
    this.userLimits.clear();
  }

  /**
   * Get current configuration
   */
  static getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  static updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get statistics about current rate limiting state
   */
  static getStats(): {
    initialized: boolean;
    activeUsers: number;
    totalRequests: {
      api: number;
      auth: number;
      token: number;
    };
    config: RateLimitConfig;
  } {
    const totalRequests = { api: 0, auth: 0, token: 0 };

    for (const userLimits of this.userLimits.values()) {
      totalRequests.api += userLimits.api.requests;
      totalRequests.auth += userLimits.authentication.requests;
      totalRequests.token += userLimits.tokenRequests.requests;
    }

    return {
      initialized: this.initialized,
      activeUsers: this.userLimits.size,
      totalRequests,
      config: this.getConfig(),
    };
  }

  /**
   * Shutdown rate limiter and clean up resources
   */
  static shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.initialized = false;
  }

  // ===== PRIVATE METHODS =====

  private static loadConfiguration(): void {
    // Parse environment variables with validation
    const apiLimit = parseInt(process.env.RATE_LIMIT_API_HOUR || '1000');
    const authLimit = parseInt(process.env.RATE_LIMIT_AUTH_HOUR || '10');
    const tokenLimit = parseInt(process.env.RATE_LIMIT_TOKEN_HOUR || '50');

    // Validate limits (must be positive, handle NaN)
    this.config = {
      apiRequestsPerHour: isNaN(apiLimit) ? 1000 : Math.max(1, apiLimit),
      authAttemptsPerHour: isNaN(authLimit) ? 10 : Math.max(1, authLimit),
      tokenRequestsPerHour: isNaN(tokenLimit) ? 50 : Math.max(1, tokenLimit),
    };
  }

  private static getUserLimits(userId: string): UserLimits {
    if (!this.userLimits.has(userId)) {
      const now = new Date();
      const hourInMs = 60 * 60 * 1000;

      this.userLimits.set(userId, {
        api: { requests: 0, windowStart: now, windowSize: hourInMs },
        authentication: { requests: 0, windowStart: now, windowSize: hourInMs },
        tokenRequests: { requests: 0, windowStart: now, windowSize: hourInMs },
      });
    }

    return this.userLimits.get(userId)!;
  }

  private static getMaxRequests(action: 'api' | 'auth' | 'token'): number {
    switch (action) {
      case 'api':
        return this.config.apiRequestsPerHour;
      case 'auth':
        return this.config.authAttemptsPerHour;
      case 'token':
        return this.config.tokenRequestsPerHour;
      default:
        return 100; // Fallback
    }
  }

  private static setupCleanup(): void {
    // Clean up expired windows every 30 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredWindows();
      },
      30 * 60 * 1000
    );

    // Cleanup on process exit
    process.once('exit', () => {
      this.shutdown();
    });
  }

  private static cleanupExpiredWindows(): void {
    const now = new Date().getTime();
    const expiredUsers: string[] = [];

    for (const [userId, userLimits] of this.userLimits.entries()) {
      // Check if all windows for this user are expired and empty
      const allExpiredAndEmpty = [
        userLimits.api,
        userLimits.authentication,
        userLimits.tokenRequests,
      ].every(limit => {
        const expired = now - limit.windowStart.getTime() >= limit.windowSize;
        return expired && limit.requests === 0;
      });

      if (allExpiredAndEmpty) {
        expiredUsers.push(userId);
      }
    }

    // Remove expired users
    for (const userId of expiredUsers) {
      this.userLimits.delete(userId);
    }
  }
}

// ===== CONVENIENCE FUNCTIONS =====

/**
 * Check API rate limit for a user
 */
export async function checkApiLimit(
  userId: string,
  increment: boolean = true
): Promise<RateLimitResult> {
  return RateLimiter.checkLimit(userId, 'api', { increment });
}

/**
 * Check authentication rate limit for a user
 */
export async function checkAuthLimit(
  userId: string,
  increment: boolean = true
): Promise<RateLimitResult> {
  return RateLimiter.checkLimit(userId, 'auth', { increment });
}

/**
 * Check token request rate limit for a user
 */
export async function checkTokenLimit(
  userId: string,
  increment: boolean = true
): Promise<RateLimitResult> {
  return RateLimiter.checkLimit(userId, 'token', { increment });
}
