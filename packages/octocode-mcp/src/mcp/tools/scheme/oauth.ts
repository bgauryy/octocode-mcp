import { z } from 'zod';
import { BaseQuerySchema } from './baseSchema.js';

/**
 * OAuth Tool Schemas
 *
 * Zod validation schemas for OAuth-related MCP tools that integrate with
 * the existing OAuthManager infrastructure.
 */

// OAuth Initiate Tool Schema
export const OAuthInitiateSchema = BaseQuerySchema.extend({
  scopes: z
    .array(z.string())
    .optional()
    .describe('OAuth scopes to request')
    .default(['repo', 'read:user', 'read:org']),
  organization: z
    .string()
    .optional()
    .describe('Organization to validate membership for after OAuth completion'),
  callbackMethod: z
    .enum(['local_server', 'manual', 'deep_link', 'device_flow'])
    .optional()
    .describe('Method for handling OAuth callback')
    .default('device_flow'),
  callbackPort: z
    .number()
    .min(1024)
    .max(65535)
    .optional()
    .describe(
      'Port for local callback server (only used with local_server method)'
    )
    .default(8765),
  openBrowser: z
    .boolean()
    .optional()
    .describe(
      'Automatically open the authorization URL in the default browser (only used with local_server method)'
    )
    .default(true),
});

export type OAuthInitiateParams = z.infer<typeof OAuthInitiateSchema>;

// OAuth Callback Tool Schema
export const OAuthCallbackSchema = BaseQuerySchema.extend({
  code: z
    .string()
    .min(1)
    .describe('Authorization code from GitHub OAuth callback'),
  state: z
    .string()
    .min(1)
    .describe(
      'State parameter from GitHub OAuth callback (must match initiate state)'
    ),
});

export type OAuthCallbackParams = z.infer<typeof OAuthCallbackSchema>;

// OAuth Status Tool Schema
export const OAuthStatusSchema = BaseQuerySchema.extend({
  includeScopes: z
    .boolean()
    .optional()
    .describe('Include detailed scope information in response')
    .default(true),
  includeOrganizations: z
    .boolean()
    .optional()
    .describe('Include user organization memberships in response')
    .default(false),
});

export type OAuthStatusParams = z.infer<typeof OAuthStatusSchema>;

// OAuth Revoke Tool Schema
export const OAuthRevokeSchema = BaseQuerySchema.extend({
  revokeRefreshToken: z
    .boolean()
    .optional()
    .describe('Also revoke the refresh token (if available)')
    .default(true),
  revokeRemote: z
    .boolean()
    .optional()
    .describe(
      'Revoke token remotely with GitHub API (if false, only clears local tokens)'
    )
    .default(true),
});

export type OAuthRevokeParams = z.infer<typeof OAuthRevokeSchema>;

// Organization Membership Check Schema
export const OrganizationMembershipSchema = BaseQuerySchema.extend({
  organization: z
    .string()
    .min(1)
    .describe('Organization name to check membership for'),
  username: z
    .string()
    .optional()
    .describe('Username to check (defaults to authenticated user)'),
  includeTeams: z
    .boolean()
    .optional()
    .describe('Include team memberships in response')
    .default(false),
});

export type OrganizationMembershipParams = z.infer<
  typeof OrganizationMembershipSchema
>;

// List User Organizations Schema
export const ListUserOrganizationsSchema = BaseQuerySchema.extend({
  username: z
    .string()
    .optional()
    .describe(
      'Username to list organizations for (defaults to authenticated user)'
    ),
  includePrivate: z
    .boolean()
    .optional()
    .describe(
      'Include private organization memberships (requires read:org scope)'
    )
    .default(true),
});

export type ListUserOrganizationsParams = z.infer<
  typeof ListUserOrganizationsSchema
>;

// Team Membership Check Schema
export const TeamMembershipSchema = BaseQuerySchema.extend({
  organization: z.string().min(1).describe('Organization name'),
  team: z.string().min(1).describe('Team slug within the organization'),
  username: z
    .string()
    .optional()
    .describe('Username to check (defaults to authenticated user)'),
});

export type TeamMembershipParams = z.infer<typeof TeamMembershipSchema>;

// OAuth State Response Schema (for responses)
export const OAuthStateResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  state: z.string(),
  codeVerifier: z.string().optional(), // Only included for debugging
  expiresAt: z.string().datetime(),
  callbackMethod: z.enum(['local_server', 'manual', 'deep_link']),
  callbackUrl: z.string().url().optional(),
  organization: z.string().optional(),
  instructions: z.string(),
});

export type OAuthStateResponse = z.infer<typeof OAuthStateResponseSchema>;

// OAuth Status Response Schema
export const OAuthStatusResponseSchema = z.object({
  authenticated: z.boolean(),
  source: z.enum([
    'oauth',
    'github_app',
    'env',
    'cli',
    'authorization',
    'unknown',
  ]),
  tokenType: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).optional(),
  clientId: z.string().optional(),
  organization: z.string().optional(),
  organizationMember: z.boolean().optional(),
  organizations: z.array(z.string()).optional(),
  permissions: z
    .object({
      canAccessOrganizations: z.boolean(),
      canAccessPrivateRepos: z.boolean(),
      canReadUser: z.boolean(),
      hasRefreshCapability: z.boolean(),
    })
    .optional(),
});

export type OAuthStatusResponse = z.infer<typeof OAuthStatusResponseSchema>;

// Organization Membership Response Schema
export const OrganizationMembershipResponseSchema = z.object({
  organization: z.string(),
  username: z.string(),
  isMember: z.boolean(),
  role: z.enum(['member', 'admin', 'owner']).optional(),
  visibility: z.enum(['public', 'private']).optional(),
  teams: z
    .array(
      z.object({
        name: z.string(),
        slug: z.string(),
        role: z.enum(['member', 'maintainer']),
        privacy: z.enum(['closed', 'secret']),
      })
    )
    .optional(),
});

export type OrganizationMembershipResponse = z.infer<
  typeof OrganizationMembershipResponseSchema
>;
