/**
 * Organization Service
 *
 * Provides organization membership checking and management functionality
 * that integrates with existing GitHub API infrastructure and token management.
 */

import { Octokit } from '@octokit/rest';
import { getGitHubToken } from '../mcp/tools/utils/tokenManager.js';
import { ConfigManager } from '../config/serverConfig.js';
// Simple in-memory cache for organization data

export interface OrganizationMember {
  login: string;
  id: number;
  role: 'member' | 'admin' | 'owner';
  state: 'active' | 'pending';
}

export interface TeamMember {
  login: string;
  id: number;
  role: 'member' | 'maintainer';
  state: 'active' | 'pending';
}

export interface OrganizationInfo {
  login: string;
  id: number;
  description: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export interface TeamInfo {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  privacy: 'closed' | 'secret';
  permission: 'pull' | 'push' | 'admin' | 'maintain' | 'triage';
  members_count: number;
  repos_count: number;
}

export class OrganizationService {
  private octokit: Octokit | null = null;
  private cache = new Map<string, { data: unknown; expiresAt: number }>(); // Simple in-memory cache
  private readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  /**
   * Get authenticated Octokit instance
   */
  private async getOctokit(): Promise<Octokit> {
    if (!this.octokit) {
      const token = await getGitHubToken();
      if (!token) {
        throw new Error(
          'No GitHub token available for organization operations'
        );
      }

      const config = ConfigManager.getConfig();
      this.octokit = new Octokit({
        auth: token,
        baseUrl: config.githubHost
          ? `${config.githubHost}/api/v3`
          : 'https://api.github.com',
        userAgent: `octocode-mcp/${config.version}`,
      });
    }
    return this.octokit;
  }

  /**
   * Check if a user is a member of an organization
   */
  async checkMembership(
    organization: string,
    username?: string
  ): Promise<{
    isMember: boolean;
    role?: 'member' | 'admin' | 'owner';
    visibility?: 'public' | 'private';
  }> {
    const cacheKey = `membership_${organization}_${username || 'authenticated'}`;
    const cached = this.getCached(cacheKey);
    if (cached)
      return cached as {
        isMember: boolean;
        role?: 'member' | 'admin' | 'owner';
        visibility?: 'public' | 'private';
      };

    try {
      const octokit = await this.getOctokit();

      if (username) {
        // Check specific user's membership
        try {
          const response = await octokit.rest.orgs.getMembershipForUser({
            org: organization,
            username,
          });

          const result = {
            isMember: true,
            role: response.data.role as 'member' | 'admin',
            visibility:
              response.data.state === 'active'
                ? 'public'
                : ('private' as 'public' | 'private'),
          };

          this.setCached(cacheKey, result);
          return result;
        } catch (error: unknown) {
          if ((error as { status?: number }).status === 404) {
            // Try public membership check as fallback
            try {
              await octokit.rest.orgs.checkMembershipForUser({
                org: organization,
                username,
              });

              const result = { isMember: true, visibility: 'public' as const };
              this.setCached(cacheKey, result);
              return result;
            } catch {
              const result = { isMember: false };
              this.setCached(cacheKey, result);
              return result;
            }
          }
          throw error;
        }
      } else {
        // Check authenticated user's membership
        try {
          const response =
            await octokit.rest.orgs.getMembershipForAuthenticatedUser({
              org: organization,
            });

          const result = {
            isMember: true,
            role: response.data.role as 'member' | 'admin',
            visibility:
              response.data.state === 'active'
                ? 'public'
                : ('private' as 'public' | 'private'),
          };

          this.setCached(cacheKey, result);
          return result;
        } catch (error: unknown) {
          if ((error as { status?: number }).status === 404) {
            const result = { isMember: false };
            this.setCached(cacheKey, result);
            return result;
          }
          throw error;
        }
      }
    } catch (error: unknown) {
      // Don't cache errors, but provide a reasonable response
      return { isMember: false };
    }
  }

  /**
   * Get organizations for a user
   */
  async getUserOrganizations(username?: string): Promise<OrganizationInfo[]> {
    const cacheKey = `user_orgs_${username || 'authenticated'}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached as OrganizationInfo[];

    try {
      const octokit = await this.getOctokit();

      const response = username
        ? await octokit.rest.orgs.listForUser({ username })
        : await octokit.rest.orgs.listForAuthenticatedUser();

      const organizations = response.data.map(org => ({
        login: org.login,
        id: org.id,
        description: org.description,
        public_repos:
          'public_repos' in org
            ? (org as { public_repos: number }).public_repos
            : 0,
        public_gists:
          'public_gists' in org
            ? (org as { public_gists: number }).public_gists
            : 0,
        followers:
          'followers' in org ? (org as { followers: number }).followers : 0,
        following:
          'following' in org ? (org as { following: number }).following : 0,
        created_at:
          'created_at' in org
            ? (org as { created_at: string }).created_at
            : new Date().toISOString(),
        updated_at:
          'updated_at' in org
            ? (org as { updated_at: string }).updated_at
            : new Date().toISOString(),
      }));

      this.setCached(cacheKey, organizations);
      return organizations;
    } catch (error: unknown) {
      // Return empty array on error rather than throwing
      return [];
    }
  }

  /**
   * Check team membership for a user
   */
  async checkTeamMembership(
    organization: string,
    teamSlug: string,
    username?: string
  ): Promise<{ isMember: boolean; role?: 'member' | 'maintainer' }> {
    const cacheKey = `team_membership_${organization}_${teamSlug}_${username || 'authenticated'}`;
    const cached = this.getCached(cacheKey);
    if (cached)
      return cached as { isMember: boolean; role?: 'member' | 'maintainer' };

    try {
      const octokit = await this.getOctokit();

      if (username) {
        // Check specific user's team membership
        try {
          const response = await octokit.rest.teams.getMembershipForUserInOrg({
            org: organization,
            team_slug: teamSlug,
            username,
          });

          const result = {
            isMember: response.data.state === 'active',
            role: response.data.role as 'member' | 'maintainer',
          };

          this.setCached(cacheKey, result);
          return result;
        } catch (error: unknown) {
          if ((error as { status?: number }).status === 404) {
            const result = { isMember: false };
            this.setCached(cacheKey, result);
            return result;
          }
          throw error;
        }
      } else {
        // Check authenticated user's team membership
        try {
          // First get the authenticated user
          const userResponse = await octokit.rest.users.getAuthenticated();
          const authenticatedUsername = userResponse.data.login;

          const response = await octokit.rest.teams.getMembershipForUserInOrg({
            org: organization,
            team_slug: teamSlug,
            username: authenticatedUsername,
          });

          const result = {
            isMember: response.data.state === 'active',
            role: response.data.role as 'member' | 'maintainer',
          };

          this.setCached(cacheKey, result);
          return result;
        } catch (error: unknown) {
          if ((error as { status?: number }).status === 404) {
            const result = { isMember: false };
            this.setCached(cacheKey, result);
            return result;
          }
          throw error;
        }
      }
    } catch (error: unknown) {
      return { isMember: false };
    }
  }

  /**
   * Get teams for an organization
   */
  async getOrganizationTeams(organization: string): Promise<TeamInfo[]> {
    const cacheKey = `org_teams_${organization}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached as TeamInfo[];

    try {
      const octokit = await this.getOctokit();

      const response = await octokit.rest.teams.list({
        org: organization,
      });

      const teams = response.data.map(team => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        privacy: team.privacy as 'closed' | 'secret',
        permission: team.permission as
          | 'pull'
          | 'push'
          | 'admin'
          | 'maintain'
          | 'triage',
        members_count:
          'members_count' in team
            ? (team as { members_count: number }).members_count
            : 0,
        repos_count:
          'repos_count' in team
            ? (team as { repos_count: number }).repos_count
            : 0,
      }));

      this.setCached(cacheKey, teams);
      return teams;
    } catch (error: unknown) {
      return [];
    }
  }

  /**
   * Get user's teams in an organization
   */
  async getUserTeams(
    organization: string,
    username?: string
  ): Promise<TeamInfo[]> {
    const cacheKey = `user_teams_${organization}_${username || 'authenticated'}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached as TeamInfo[];

    try {
      const octokit = await this.getOctokit();

      if (!username) {
        // Get authenticated user's teams
        const response = await octokit.rest.teams.listForAuthenticatedUser();
        const userTeams = response.data
          .filter(team => team.organization.login === organization)
          .map(team => ({
            id: team.id,
            name: team.name,
            slug: team.slug,
            description: team.description,
            privacy: team.privacy as 'closed' | 'secret',
            permission: team.permission as
              | 'pull'
              | 'push'
              | 'admin'
              | 'maintain'
              | 'triage',
            members_count: team.members_count || 0,
            repos_count: team.repos_count || 0,
          }));

        this.setCached(cacheKey, userTeams);
        return userTeams;
      } else {
        // For specific user, we need to check each team individually
        const allTeams = await this.getOrganizationTeams(organization);
        const userTeams: TeamInfo[] = [];

        for (const team of allTeams) {
          const membership = await this.checkTeamMembership(
            organization,
            team.slug,
            username
          );
          if (membership.isMember) {
            userTeams.push(team);
          }
        }

        this.setCached(cacheKey, userTeams);
        return userTeams;
      }
    } catch (error: unknown) {
      return [];
    }
  }

  /**
   * Get authenticated user info
   */
  async getAuthenticatedUser(): Promise<{ login: string; id: number } | null> {
    const cacheKey = 'authenticated_user';
    const cached = this.getCached(cacheKey);
    if (cached) return cached as { login: string; id: number };

    try {
      const octokit = await this.getOctokit();
      const response = await octokit.rest.users.getAuthenticated();

      const user = {
        login: response.data.login,
        id: response.data.id,
      };

      this.setCached(cacheKey, user);
      return user;
    } catch (error: unknown) {
      return null;
    }
  }

  /**
   * Clear cache (useful for testing or when tokens change)
   */
  clearCache(): void {
    this.cache.clear();
    this.octokit = null; // Force re-authentication
  }

  // Cache helper methods
  private getCached(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCached(key: string, data: unknown): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.CACHE_TTL,
    });
  }
}
