/**
 * Organization MCP Tools
 *
 * Provides MCP tools for checking organization membership, listing organizations,
 * and managing team access. Integrates with existing security and audit infrastructure.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../utils/withSecurityValidation.js';
import { createResult } from '../../responses.js';
import { generateHints } from '../utils/hints_consolidated.js';
import { OrganizationService } from '../../../services/organizationService.js';
import {
  OrganizationMembershipSchema,
  OrganizationMembershipParams,
  ListUserOrganizationsSchema,
  ListUserOrganizationsParams,
  TeamMembershipSchema,
  TeamMembershipParams,
} from '../scheme/oauth.js';
import { TOOL_NAMES } from '../utils/toolConstants.js';

// Extend TOOL_NAMES to include organization tools
export const ORGANIZATION_TOOL_NAMES = {
  ...TOOL_NAMES,
  CHECK_ORGANIZATION_MEMBERSHIP: 'checkOrganizationMembership',
  LIST_USER_ORGANIZATIONS: 'listUserOrganizations',
  CHECK_TEAM_MEMBERSHIP: 'checkTeamMembership',
  LIST_ORGANIZATION_TEAMS: 'listOrganizationTeams',
} as const;

const organizationService = new OrganizationService();

/**
 * Register organization membership checking tool
 */
export function registerCheckOrganizationMembershipTool(
  server: McpServer
): void {
  server.registerTool(
    ORGANIZATION_TOOL_NAMES.CHECK_ORGANIZATION_MEMBERSHIP,
    {
      description: `Check if a user is a member of a GitHub organization.

FEATURES:
- Check authenticated user or specific username
- Returns membership status, role, and visibility
- Supports both public and private organization memberships
- Caches results for performance (15-minute TTL)
- Integrates with existing token management and security

BEST PRACTICES:
- Use without username parameter to check authenticated user
- Requires 'read:org' scope for private membership details
- Results are cached for 15 minutes to improve performance
- Works with both GitHub.com and GitHub Enterprise Server`,
      inputSchema: OrganizationMembershipSchema.shape,
      annotations: {
        title: 'Check Organization Membership',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withSecurityValidation(
      async (args: OrganizationMembershipParams): Promise<CallToolResult> => {
        try {
          const result = await organizationService.checkMembership(
            args.organization,
            args.username
          );

          // Get additional team information if requested and user is a member
          let teams = undefined;
          if (result.isMember && args.includeTeams) {
            teams = await organizationService.getUserTeams(
              args.organization,
              args.username
            );
          }

          const response = {
            organization: args.organization,
            username: args.username || 'authenticated user',
            isMember: result.isMember,
            role: result.role,
            visibility: result.visibility,
            teams: teams?.map(team => ({
              name: team.name,
              slug: team.slug,
              role: 'member', // We'd need additional API call to get exact role
              privacy: team.privacy,
            })),
          };

          const hints = generateHints({
            toolName: ORGANIZATION_TOOL_NAMES.CHECK_ORGANIZATION_MEMBERSHIP,
            hasResults: true,
            totalItems: 1,
            customHints: result.isMember
              ? [
                  `User is a ${result.role || 'member'} of ${args.organization}`,
                  args.includeTeams
                    ? 'Team information included in response'
                    : 'Use includeTeams: true to get team memberships',
                  'Use listUserOrganizations to see all organizations for this user',
                ]
              : [
                  `User is not a member of ${args.organization}`,
                  'Check organization name spelling',
                  'Private memberships require read:org scope',
                  'Use listUserOrganizations to see public organizations',
                ],
          });

          return createResult({
            data: response,
            hints,
          });
        } catch (error) {
          const hints = generateHints({
            toolName: ORGANIZATION_TOOL_NAMES.CHECK_ORGANIZATION_MEMBERSHIP,
            hasResults: false,
            totalItems: 0,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            customHints: [
              'Ensure you have a valid GitHub token',
              'Check that the organization name is correct',
              'Private organizations require read:org scope',
              'GitHub Enterprise Server may have different access patterns',
            ],
          });

          return createResult({
            isError: true,
            error: `Failed to check organization membership: ${error instanceof Error ? error.message : String(error)}`,
            hints,
          });
        }
      }
    )
  );
}

/**
 * Register list user organizations tool
 */
export function registerListUserOrganizationsTool(server: McpServer): void {
  server.registerTool(
    ORGANIZATION_TOOL_NAMES.LIST_USER_ORGANIZATIONS,
    {
      description: `List GitHub organizations that a user belongs to.

FEATURES:
- List organizations for authenticated user or specific username
- Returns organization details including description and stats
- Supports both public and private organizations (with read:org scope)
- Caches results for performance (15-minute TTL)
- Works with GitHub.com and GitHub Enterprise Server

BEST PRACTICES:
- Use without username to list authenticated user's organizations
- Set includePrivate: true with read:org scope for complete results
- Results are cached for 15 minutes to improve performance
- Combine with checkOrganizationMembership for detailed membership info`,
      inputSchema: ListUserOrganizationsSchema.shape,
      annotations: {
        title: 'List User Organizations',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: ListUserOrganizationsParams): Promise<CallToolResult> => {
        try {
          const organizations = await organizationService.getUserOrganizations(
            args.username
          );

          const hints = generateHints({
            toolName: ORGANIZATION_TOOL_NAMES.LIST_USER_ORGANIZATIONS,
            hasResults: organizations.length > 0,
            totalItems: organizations.length,
            customHints:
              organizations.length > 0
                ? [
                    `Found ${organizations.length} organization${organizations.length === 1 ? '' : 's'}`,
                    'Use checkOrganizationMembership for detailed membership info',
                    'Use checkTeamMembership to check team access within organizations',
                    args.includePrivate
                      ? 'Private organizations included (requires read:org scope)'
                      : 'Set includePrivate: true to include private organizations',
                  ]
                : [
                    'No organizations found for this user',
                    'User may have private organization memberships not visible',
                    'Requires read:org scope to see private organizations',
                    'Check username spelling if searching for specific user',
                  ],
          });

          return createResult({
            data: {
              username: args.username || 'authenticated user',
              organizations: organizations.map(org => ({
                login: org.login,
                id: org.id,
                description: org.description,
                publicRepos: org.public_repos,
                createdAt: org.created_at,
                updatedAt: org.updated_at,
              })),
              totalCount: organizations.length,
            },
            hints,
          });
        } catch (error) {
          const hints = generateHints({
            toolName: ORGANIZATION_TOOL_NAMES.LIST_USER_ORGANIZATIONS,
            hasResults: false,
            totalItems: 0,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            customHints: [
              'Ensure you have a valid GitHub token',
              'Check that the username is correct (if specified)',
              'Private organizations require read:org scope',
              'Some users may have private organization memberships',
            ],
          });

          return createResult({
            isError: true,
            error: `Failed to list user organizations: ${error instanceof Error ? error.message : String(error)}`,
            hints,
          });
        }
      }
    )
  );
}

/**
 * Register check team membership tool
 */
export function registerCheckTeamMembershipTool(server: McpServer): void {
  server.registerTool(
    ORGANIZATION_TOOL_NAMES.CHECK_TEAM_MEMBERSHIP,
    {
      description: `Check if a user is a member of a specific team within a GitHub organization.

FEATURES:
- Check team membership for authenticated user or specific username
- Returns membership status and role (member/maintainer)
- Supports both public and private teams
- Caches results for performance (15-minute TTL)
- Integrates with organization membership checking

BEST PRACTICES:
- Use team slug (not display name) for team parameter
- Requires organization membership to check team membership
- Use without username to check authenticated user
- Team access requires appropriate organization permissions`,
      inputSchema: TeamMembershipSchema.shape,
      annotations: {
        title: 'Check Team Membership',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withSecurityValidation(
      async (args: TeamMembershipParams): Promise<CallToolResult> => {
        try {
          const result = await organizationService.checkTeamMembership(
            args.organization,
            args.team,
            args.username
          );

          const response = {
            organization: args.organization,
            team: args.team,
            username: args.username || 'authenticated user',
            isMember: result.isMember,
            role: result.role,
          };

          const hints = generateHints({
            toolName: ORGANIZATION_TOOL_NAMES.CHECK_TEAM_MEMBERSHIP,
            hasResults: true,
            totalItems: 1,
            customHints: result.isMember
              ? [
                  `User is a ${result.role || 'member'} of team ${args.team}`,
                  'Use listOrganizationTeams to see all teams in the organization',
                  'Team membership requires organization membership',
                ]
              : [
                  `User is not a member of team ${args.team}`,
                  'Check that the team slug is correct (not display name)',
                  'User must be an organization member to join teams',
                  'Some teams may be private and not visible',
                ],
          });

          return createResult({
            data: response,
            hints,
          });
        } catch (error) {
          const hints = generateHints({
            toolName: ORGANIZATION_TOOL_NAMES.CHECK_TEAM_MEMBERSHIP,
            hasResults: false,
            totalItems: 0,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            customHints: [
              'Ensure you have a valid GitHub token',
              'Check that organization and team names are correct',
              'Use team slug (e.g., "developers") not display name',
              'Team access requires organization membership',
              'Some teams may be private and require special permissions',
            ],
          });

          return createResult({
            isError: true,
            error: `Failed to check team membership: ${error instanceof Error ? error.message : String(error)}`,
            hints,
          });
        }
      }
    )
  );
}

/**
 * Register all organization tools
 */
export function registerAllOrganizationTools(server: McpServer): void {
  registerCheckOrganizationMembershipTool(server);
  registerListUserOrganizationsTool(server);
  registerCheckTeamMembershipTool(server);
}
