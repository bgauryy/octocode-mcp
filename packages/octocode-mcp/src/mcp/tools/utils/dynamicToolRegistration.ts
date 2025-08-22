/**
 * Dynamic Tool Registration
 *
 * Manages dynamic tool availability based on authentication status, organization membership,
 * and enterprise configuration. Integrates with existing toolset management and security.
 */

// Dynamic tool registration utilities
import { getTokenMetadata } from './tokenManager.js';
import { OrganizationService } from '../../../services/organizationService.js';
import { ConfigManager } from '../../../config/serverConfig.js';
import { ToolsetManager } from '../toolsets/toolsetManager.js';
import { TOOL_NAMES } from './toolConstants.js';
import { OAUTH_TOOL_NAMES } from '../oauth/oauthTools.js';
import { ORGANIZATION_TOOL_NAMES } from '../organization/organizationTools.js';

export interface ToolAccessRule {
  toolName: string;
  requiredAuth?: 'any' | 'oauth' | 'github_app';
  requiredScopes?: string[];
  requiredOrganizations?: string[];
  requiredTeams?: Array<{ org: string; team: string }>;
  enterpriseOnly?: boolean;
  condition?: () => Promise<boolean>;
}

export interface ToolAvailabilityResult {
  availableTools: string[];
  restrictedTools: Array<{
    toolName: string;
    reason: string;
    requirements: string[];
  }>;
  authenticationStatus: {
    isAuthenticated: boolean;
    source: string;
    hasOrgAccess: boolean;
    organizations: string[];
  };
}

export class DynamicToolRegistration {
  private static organizationService = new OrganizationService();
  private static toolAccessRules: ToolAccessRule[] = [];
  private static initialized = false;

  /**
   * Initialize dynamic tool registration with default rules
   */
  static initialize(): void {
    if (this.initialized) return;

    this.initialized = true;
    this.setupDefaultAccessRules();
  }

  /**
   * Register a tool access rule
   */
  static registerAccessRule(rule: ToolAccessRule): void {
    this.toolAccessRules.push(rule);
  }

  /**
   * Get available tools based on current authentication and configuration
   */
  static async getAvailableTools(): Promise<ToolAvailabilityResult> {
    const result: ToolAvailabilityResult = {
      availableTools: [],
      restrictedTools: [],
      authenticationStatus: {
        isAuthenticated: false,
        source: 'unknown',
        hasOrgAccess: false,
        organizations: [],
      },
    };

    try {
      // Get authentication status
      const metadata = await getTokenMetadata();
      result.authenticationStatus.isAuthenticated = !!metadata;
      result.authenticationStatus.source = metadata?.source || 'unknown';

      // Get organization information if authenticated with org scope
      if (metadata?.scopes?.includes('read:org')) {
        try {
          const organizations =
            await this.organizationService.getUserOrganizations();
          result.authenticationStatus.organizations = organizations.map(
            org => org.login
          );
          result.authenticationStatus.hasOrgAccess = true;
        } catch {
          // Ignore organization fetch errors
        }
      }

      // Check each tool against access rules
      const allTools = this.getAllKnownTools();

      for (const toolName of allTools) {
        const accessResult = await this.checkToolAccess(
          toolName,
          metadata,
          result.authenticationStatus
        );

        if (accessResult.allowed) {
          result.availableTools.push(toolName);
        } else {
          result.restrictedTools.push({
            toolName,
            reason: accessResult.reason,
            requirements: accessResult.requirements,
          });
        }
      }

      return result;
    } catch (error) {
      // On error, return basic tools only
      result.availableTools = this.getBasicTools();
      return result;
    }
  }

  /**
   * Check if a specific tool is available
   */
  static async isToolAvailable(toolName: string): Promise<boolean> {
    try {
      const metadata = await getTokenMetadata();
      const authStatus = {
        isAuthenticated: !!metadata,
        source: metadata?.source || 'unknown',
        hasOrgAccess: metadata?.scopes?.includes('read:org') || false,
        organizations: [] as string[],
      };

      const accessResult = await this.checkToolAccess(
        toolName,
        metadata,
        authStatus
      );
      return accessResult.allowed;
    } catch {
      return this.getBasicTools().includes(toolName);
    }
  }

  /**
   * Get tool access requirements for documentation/help
   */
  static getToolRequirements(toolName: string): {
    auth?: string;
    scopes?: string[];
    organizations?: string[];
    teams?: Array<{ org: string; team: string }>;
    enterprise?: boolean;
  } {
    const rule = this.toolAccessRules.find(r => r.toolName === toolName);
    if (!rule) return {};

    return {
      auth: rule.requiredAuth,
      scopes: rule.requiredScopes,
      organizations: rule.requiredOrganizations,
      teams: rule.requiredTeams,
      enterprise: rule.enterpriseOnly,
    };
  }

  // Private methods
  private static async checkToolAccess(
    toolName: string,
    metadata: unknown,
    authStatus: {
      isAuthenticated: boolean;
      source: string;
      hasOrgAccess: boolean;
      organizations: string[];
    }
  ): Promise<{ allowed: boolean; reason: string; requirements: string[] }> {
    const rule = this.toolAccessRules.find(r => r.toolName === toolName);

    // If no rule exists, allow basic tools or check against toolset manager
    if (!rule) {
      const isBasicTool = this.getBasicTools().includes(toolName);
      const isToolsetEnabled = ToolsetManager.isToolEnabled(toolName);

      return {
        allowed: isBasicTool && isToolsetEnabled,
        reason: isToolsetEnabled
          ? 'Tool available'
          : 'Tool disabled by configuration',
        requirements: [],
      };
    }

    const requirements: string[] = [];
    let reason = 'Tool available';

    // Check authentication requirement
    if (rule.requiredAuth && rule.requiredAuth !== 'any') {
      if (!metadata) {
        return {
          allowed: false,
          reason: 'Authentication required',
          requirements: [`Authentication via ${rule.requiredAuth}`],
        };
      }

      if (rule.requiredAuth !== (metadata as { source: string }).source) {
        requirements.push(`Authentication via ${rule.requiredAuth}`);
        reason = `Requires ${rule.requiredAuth} authentication`;
      }
    }

    // Check scope requirements
    if (rule.requiredScopes && (metadata as { scopes?: string[] }).scopes) {
      const missingScopes = rule.requiredScopes.filter(
        scope => !(metadata as { scopes: string[] }).scopes.includes(scope)
      );

      if (missingScopes.length > 0) {
        requirements.push(`OAuth scopes: ${missingScopes.join(', ')}`);
        reason = `Missing required scopes: ${missingScopes.join(', ')}`;
      }
    }

    // Check organization requirements
    if (rule.requiredOrganizations && rule.requiredOrganizations.length > 0) {
      if (!authStatus.hasOrgAccess) {
        requirements.push('read:org scope for organization access');
        reason = 'Organization access requires read:org scope';
      } else {
        const userOrgs = authStatus.organizations;
        const missingOrgs = rule.requiredOrganizations.filter(
          org => !userOrgs.includes(org)
        );

        if (missingOrgs.length > 0) {
          requirements.push(
            `Organization membership: ${missingOrgs.join(', ')}`
          );
          reason = `Requires membership in: ${missingOrgs.join(', ')}`;
        }
      }
    }

    // Check team requirements
    if (rule.requiredTeams && rule.requiredTeams.length > 0) {
      for (const { org, team } of rule.requiredTeams) {
        try {
          const teamMembership =
            await this.organizationService.checkTeamMembership(org, team);
          if (!teamMembership.isMember) {
            requirements.push(`Team membership: ${org}/${team}`);
            reason = `Requires membership in team ${org}/${team}`;
          }
        } catch {
          requirements.push(
            `Team membership: ${org}/${team} (unable to verify)`
          );
          reason = `Unable to verify team membership: ${org}/${team}`;
        }
      }
    }

    // Check enterprise requirement
    if (rule.enterpriseOnly && !ConfigManager.isEnterpriseMode()) {
      requirements.push('Enterprise mode configuration');
      reason = 'Tool requires enterprise mode';
    }

    // Check custom condition
    if (rule.condition) {
      try {
        const conditionResult = await rule.condition();
        if (!conditionResult) {
          requirements.push('Custom access condition');
          reason = 'Custom access condition not met';
        }
      } catch {
        requirements.push('Custom access condition (error checking)');
        reason = 'Error checking custom access condition';
      }
    }

    return {
      allowed: requirements.length === 0,
      reason,
      requirements,
    };
  }

  private static setupDefaultAccessRules(): void {
    // OAuth tools - available when OAuth is configured
    this.toolAccessRules.push({
      toolName: OAUTH_TOOL_NAMES.OAUTH_INITIATE,
      condition: async () => {
        const config = ConfigManager.getConfig();
        return !!(config.oauth?.enabled && config.oauth?.clientId);
      },
    });

    this.toolAccessRules.push({
      toolName: OAUTH_TOOL_NAMES.OAUTH_CALLBACK,
      condition: async () => {
        const config = ConfigManager.getConfig();
        return !!(config.oauth?.enabled && config.oauth?.clientId);
      },
    });

    this.toolAccessRules.push({
      toolName: OAUTH_TOOL_NAMES.OAUTH_STATUS,
      // Available to all authenticated users
    });

    this.toolAccessRules.push({
      toolName: OAUTH_TOOL_NAMES.OAUTH_REVOKE,
      requiredAuth: 'oauth',
    });

    // Organization tools - require read:org scope
    this.toolAccessRules.push({
      toolName: ORGANIZATION_TOOL_NAMES.CHECK_ORGANIZATION_MEMBERSHIP,
      requiredScopes: ['read:org'],
    });

    this.toolAccessRules.push({
      toolName: ORGANIZATION_TOOL_NAMES.LIST_USER_ORGANIZATIONS,
      requiredScopes: ['read:org'],
    });

    this.toolAccessRules.push({
      toolName: ORGANIZATION_TOOL_NAMES.CHECK_TEAM_MEMBERSHIP,
      requiredScopes: ['read:org'],
    });

    // Enterprise-specific tools
    const enterpriseConfig = ConfigManager.getEnterpriseConfig();
    if (enterpriseConfig?.organizationId) {
      // Add organization-specific access rules
      const orgId = enterpriseConfig.organizationId;

      // Example: Restrict certain tools to organization members
      this.toolAccessRules.push({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        requiredOrganizations: [orgId],
      });
    }
  }

  private static getAllKnownTools(): string[] {
    return [
      // Core GitHub tools
      ...Object.values(TOOL_NAMES),
      // OAuth tools
      ...Object.values(OAUTH_TOOL_NAMES),
      // Organization tools
      ...Object.values(ORGANIZATION_TOOL_NAMES),
    ];
  }

  private static getBasicTools(): string[] {
    return [
      TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      TOOL_NAMES.PACKAGE_SEARCH,
      OAUTH_TOOL_NAMES.OAUTH_INITIATE,
      OAUTH_TOOL_NAMES.OAUTH_STATUS,
    ];
  }
}

// Convenience functions
export async function getAvailableTools(): Promise<string[]> {
  DynamicToolRegistration.initialize();
  const result = await DynamicToolRegistration.getAvailableTools();
  return result.availableTools;
}

export async function isToolAvailable(toolName: string): Promise<boolean> {
  DynamicToolRegistration.initialize();
  return DynamicToolRegistration.isToolAvailable(toolName);
}

export function getToolRequirements(toolName: string) {
  DynamicToolRegistration.initialize();
  return DynamicToolRegistration.getToolRequirements(toolName);
}
