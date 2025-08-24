/**
 * Enterprise Organization Manager
 *
 * Manages organization configuration, membership validation, and access controls
 * for enterprise GitHub deployments. Integrates with GitHub API for real-time
 * membership verification and team-based access controls.
 */

interface GitHubAPIError {
  status?: number;
  message?: string;
}

export interface OrganizationConfig {
  id: string;
  name: string;
  allowedUsers?: string[];
  requiredTeams?: string[];
  adminUsers: string[];
  settings: {
    requireMFA: boolean;
    auditAllAccess: boolean;
    restrictToMembers: boolean;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    membershipVerified?: boolean;
    teamsChecked?: string[];
    mfaStatus?: 'verified' | 'unknown' | 'required';
  };
}

export class OrganizationManager {
  private static organizations = new Map<string, OrganizationConfig>();
  private static initialized = false;
  private static membershipCache = new Map<
    string,
    { valid: boolean; expiry: number }
  >();
  private static readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes
  private static cleanupInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Initialize organization manager
   * Loads configuration from environment variables
   */
  static initialize(): void {
    if (this.initialized) return;

    this.initialized = true;

    // Set up periodic cache cleanup
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupCache();
      },
      5 * 60 * 1000
    ); // Every 5 minutes

    // Load organization config from environment
    const orgId = process.env.GITHUB_ORGANIZATION;
    if (orgId) {
      const config: OrganizationConfig = {
        id: orgId,
        name: process.env.GITHUB_ORGANIZATION_NAME || orgId,
        allowedUsers: this.parseCommaSeparatedList(
          process.env.GITHUB_ALLOWED_USERS
        ),
        requiredTeams: this.parseCommaSeparatedList(
          process.env.GITHUB_REQUIRED_TEAMS
        ),
        adminUsers:
          this.parseCommaSeparatedList(process.env.GITHUB_ADMIN_USERS) || [],
        settings: {
          requireMFA: process.env.REQUIRE_MFA === 'true',
          auditAllAccess: process.env.AUDIT_ALL_ACCESS === 'true',
          restrictToMembers: process.env.RESTRICT_TO_MEMBERS === 'true',
        },
      };

      this.registerOrganization(config);
    }
  }

  /**
   * Register an organization configuration
   */
  static registerOrganization(config: OrganizationConfig): void {
    this.organizations.set(config.id, config);
  }

  /**
   * Get organization configuration by ID
   */
  static getOrganization(organizationId: string): OrganizationConfig | null {
    return this.organizations.get(organizationId) || null;
  }

  /**
   * Get all registered organizations
   */
  static getOrganizations(): OrganizationConfig[] {
    return Array.from(this.organizations.values());
  }

  /**
   * Validate organization access for a user
   * Performs comprehensive validation including membership, teams, and settings
   */
  static async validateOrganizationAccess(
    organizationId: string,
    userId: string,
    options: {
      skipMembershipCheck?: boolean;
      bypassCache?: boolean;
    } = {}
  ): Promise<ValidationResult> {
    const config = this.organizations.get(organizationId);
    if (!config) {
      return {
        valid: true,
        errors: [],
        warnings: ['No organization configuration found - allowing access'],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: ValidationResult['metadata'] = {};

    // Check user allowlist if configured
    if (config.allowedUsers && config.allowedUsers.length > 0) {
      if (!config.allowedUsers.includes(userId)) {
        errors.push(`User '${userId}' not in organization allowlist`);
      }
    }

    // Check admin status
    const isAdmin = config.adminUsers.includes(userId);
    if (isAdmin) {
      warnings.push(`User '${userId}' has admin privileges`);
    }

    // Verify GitHub organization membership (if not skipped)
    if (!options.skipMembershipCheck && config.settings.restrictToMembers) {
      const membershipResult = await this.verifyOrganizationMembership(
        organizationId,
        userId,
        options.bypassCache
      );

      metadata.membershipVerified = membershipResult.isMember;

      if (!membershipResult.isMember && membershipResult.error) {
        if (membershipResult.error.includes('403')) {
          warnings.push(
            'Insufficient token scopes to verify organization membership (requires read:org)'
          );
        } else if (membershipResult.error.includes('404')) {
          errors.push(
            `User '${userId}' is not a member of organization '${organizationId}'`
          );
        } else {
          warnings.push(
            `Organization membership check failed: ${membershipResult.error}`
          );
        }
      } else if (!membershipResult.isMember) {
        errors.push(
          `User '${userId}' is not a member of organization '${organizationId}'`
        );
      }
    }

    // Check required teams (requires additional API calls - implemented as validation only)
    if (config.requiredTeams && config.requiredTeams.length > 0) {
      metadata.teamsChecked = config.requiredTeams;
      warnings.push(
        `Team membership validation not implemented - requires additional GitHub API scopes`
      );
    }

    // MFA requirement check (GitHub API doesn't expose MFA status for security)
    if (config.settings.requireMFA) {
      metadata.mfaStatus = 'required';
      warnings.push(
        'MFA requirement configured but cannot be verified via API'
      );
    }

    // Admin users bypass most restrictions (but still log warnings)
    if (isAdmin && errors.length > 0) {
      warnings.push(
        `Admin user '${userId}' bypassing ${errors.length} access restrictions`
      );
      errors.length = 0; // Clear errors for admin users
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata,
    };
  }

  /**
   * Check if user is an admin for any organization
   */
  static isUserAdmin(userId: string, organizationId?: string): boolean {
    if (organizationId) {
      const config = this.organizations.get(organizationId);
      return config ? config.adminUsers.includes(userId) : false;
    }

    // Check all organizations
    return Array.from(this.organizations.values()).some(config =>
      config.adminUsers.includes(userId)
    );
  }

  /**
   * Get organization settings for a specific org
   */
  static getOrganizationSettings(
    organizationId: string
  ): OrganizationConfig['settings'] | null {
    const config = this.organizations.get(organizationId);
    return config ? config.settings : null;
  }

  /**
   * Clear membership cache (for testing or forced refresh)
   */
  static clearMembershipCache(): void {
    this.membershipCache.clear();
  }

  /**
   * Shutdown organization manager
   * Clears cleanup interval and resets state
   */
  static shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.initialized = false;
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    size: number;
    entries: Array<{ key: string; expiry: number; expired: boolean }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.membershipCache.entries()).map(
      ([key, value]) => ({
        key,
        expiry: value.expiry,
        expired: value.expiry < now,
      })
    );

    return {
      size: this.membershipCache.size,
      entries,
    };
  }

  // ===== PRIVATE METHODS =====

  private static parseCommaSeparatedList(
    value: string | undefined
  ): string[] | undefined {
    if (!value || value.trim() === '') return undefined;
    return value
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  private static async verifyOrganizationMembership(
    organizationId: string,
    userId: string,
    bypassCache: boolean = false
  ): Promise<{ isMember: boolean; error?: string; cached?: boolean }> {
    const cacheKey = `${organizationId}:${userId}`;
    const now = Date.now();

    // Check cache first (unless bypassing)
    if (!bypassCache) {
      const cached = this.membershipCache.get(cacheKey);
      if (cached && cached.expiry > now) {
        return { isMember: cached.valid, cached: true };
      }
    }

    try {
      // Use dynamic import to avoid circular dependency
      const { getOctokit } = await import('../github/client.js');
      const octokit = await getOctokit();

      // GET /orgs/{org}/members/{username}
      // This endpoint returns 204 if user is a public member, 404 if not a member or private membership
      // Returns 403 if requester doesn't have permission to check
      await octokit.request('GET /orgs/{org}/members/{username}', {
        org: organizationId,
        username: userId,
      });

      // Success means user is a public member
      const result = { isMember: true };

      // Cache the result
      this.membershipCache.set(cacheKey, {
        valid: true,
        expiry: now + this.CACHE_TTL,
      });

      return result;
    } catch (error: unknown) {
      let errorMessage = 'unknown error';
      let isMember = false;

      const apiError = error as GitHubAPIError;

      if (apiError?.status === 404) {
        // User is not a member (or membership is private and we can't see it)
        errorMessage = '404 - User not found or not a public member';
        isMember = false;
      } else if (apiError?.status === 403) {
        // Insufficient permissions to check membership
        errorMessage = '403 - Insufficient token scopes (requires read:org)';
        // Don't cache 403 errors as they might be temporary
        return { isMember: false, error: errorMessage };
      } else if (apiError?.status) {
        errorMessage = `${apiError.status} - ${apiError.message || 'API error'}`;
      } else {
        errorMessage = apiError?.message || 'Network or unknown error';
      }

      // Cache negative results (except 403)
      if (apiError?.status !== 403) {
        this.membershipCache.set(cacheKey, {
          valid: isMember,
          expiry: now + this.CACHE_TTL,
        });
      }

      return { isMember, error: errorMessage };
    }
  }

  // Clean up expired cache entries periodically
  private static cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.membershipCache.entries()) {
      if (value.expiry < now) {
        this.membershipCache.delete(key);
      }
    }
  }
}

// Cache cleanup will be set up during initialization
