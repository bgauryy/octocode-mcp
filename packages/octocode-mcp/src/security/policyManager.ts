/**
 * Enterprise Policy Manager
 *
 * Provides policy evaluation framework for enterprise access controls.
 * Initial implementation with scaffolding for future policy expansion.
 * Supports basic policies like MFA requirements and repository access controls.
 */

export interface Policy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: PolicyCondition[];
  actions: PolicyAction[];
}

export interface PolicyCondition {
  type:
    | 'user_in_list'
    | 'user_is_admin'
    | 'org_member'
    | 'team_member'
    | 'mfa_enabled'
    | 'repo_visibility';
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains';
  value: string | string[] | boolean;
}

export interface PolicyAction {
  type: 'allow' | 'deny' | 'require_approval' | 'audit_log' | 'rate_limit';
  parameters?: Record<string, unknown>;
}

export interface PolicyEvaluationContext {
  userId?: string;
  organizationId?: string;
  resource?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  policies: Array<{
    policyId: string;
    matched: boolean;
    action: PolicyAction['type'];
  }>;
  requirements?: string[];
  auditEvents?: Array<{
    action: string;
    details: Record<string, unknown>;
  }>;
}

export class PolicyManager {
  private static policies = new Map<string, Policy>();
  private static initialized = false;

  /**
   * Initialize policy manager with default policies
   */
  static initialize(): void {
    if (this.initialized) return;

    this.initialized = true;

    // Load default policies based on environment configuration
    this.loadDefaultPolicies();
  }

  /**
   * Register a policy
   */
  static registerPolicy(policy: Policy): void {
    this.policies.set(policy.id, policy);
  }

  /**
   * Get all registered policies
   */
  static getPolicies(): Policy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get a specific policy by ID
   */
  static getPolicy(policyId: string): Policy | null {
    return this.policies.get(policyId) || null;
  }

  /**
   * Evaluate policies for a given context
   */
  static async evaluatePolicies(
    context: PolicyEvaluationContext
  ): Promise<PolicyEvaluationResult> {
    if (!this.initialized) {
      return { allowed: true, policies: [] };
    }

    const result: PolicyEvaluationResult = {
      allowed: true,
      policies: [],
      requirements: [],
      auditEvents: [],
    };

    // Evaluate each enabled policy
    for (const policy of this.policies.values()) {
      if (!policy.enabled) continue;

      const policyResult = await this.evaluatePolicy(policy, context);
      result.policies.push({
        policyId: policy.id,
        matched: policyResult.matched,
        action: policyResult.action,
      });

      // Process policy actions
      if (policyResult.matched) {
        for (const action of policy.actions) {
          switch (action.type) {
            case 'deny':
              result.allowed = false;
              break;
            case 'require_approval':
              result.requirements = result.requirements || [];
              result.requirements.push(
                `Approval required by policy: ${policy.name}`
              );
              break;
            case 'audit_log':
              result.auditEvents = result.auditEvents || [];
              result.auditEvents.push({
                action: `policy_${policy.id}_triggered`,
                details: {
                  policyName: policy.name,
                  context,
                  ...action.parameters,
                },
              });
              break;
            case 'rate_limit':
              // Rate limiting is handled by RateLimiter - just log for now
              result.auditEvents = result.auditEvents || [];
              result.auditEvents.push({
                action: `policy_rate_limit_applied`,
                details: {
                  policyName: policy.name,
                  parameters: action.parameters,
                },
              });
              break;
          }
        }
      }
    }

    return result;
  }

  /**
   * Check if MFA is required for a user/organization
   */
  static isMfaRequired(organizationId?: string): boolean {
    if (!organizationId) return false;

    const mfaPolicy = this.policies.get('require_mfa');
    return mfaPolicy?.enabled || false;
  }

  /**
   * Check if repository access is restricted
   */
  static isRepositoryAccessRestricted(organizationId?: string): boolean {
    if (!organizationId) return false;

    const repoPolicy = this.policies.get('restrict_repo_access');
    return repoPolicy?.enabled || false;
  }

  /**
   * Remove a policy
   */
  static removePolicy(policyId: string): boolean {
    return this.policies.delete(policyId);
  }

  /**
   * Clear all policies (for testing)
   */
  static clearPolicies(): void {
    this.policies.clear();
  }

  /**
   * Get policy statistics
   */
  static getStats(): {
    initialized: boolean;
    totalPolicies: number;
    enabledPolicies: number;
    policies: Array<{ id: string; name: string; enabled: boolean }>;
  } {
    const policies = Array.from(this.policies.values());

    return {
      initialized: this.initialized,
      totalPolicies: policies.length,
      enabledPolicies: policies.filter(p => p.enabled).length,
      policies: policies.map(p => ({
        id: p.id,
        name: p.name,
        enabled: p.enabled,
      })),
    };
  }

  // ===== PRIVATE METHODS =====

  private static loadDefaultPolicies(): void {
    // MFA Requirement Policy
    if (process.env.REQUIRE_MFA === 'true') {
      this.registerPolicy({
        id: 'require_mfa',
        name: 'Multi-Factor Authentication Required',
        description:
          'Requires users to have MFA enabled for organization access',
        enabled: true,
        conditions: [
          {
            type: 'org_member',
            field: 'organizationId',
            operator: 'equals',
            value: process.env.GITHUB_ORGANIZATION || '',
          },
        ],
        actions: [
          { type: 'audit_log', parameters: { event: 'mfa_policy_checked' } },
        ],
      });
    }

    // Repository Access Restriction Policy
    if (process.env.RESTRICT_TO_MEMBERS === 'true') {
      this.registerPolicy({
        id: 'restrict_repo_access',
        name: 'Restrict Repository Access to Members',
        description: 'Only organization members can access repositories',
        enabled: true,
        conditions: [
          {
            type: 'org_member',
            field: 'organizationId',
            operator: 'equals',
            value: process.env.GITHUB_ORGANIZATION || '',
          },
        ],
        actions: [
          {
            type: 'audit_log',
            parameters: { event: 'repo_access_policy_checked' },
          },
        ],
      });
    }

    // Admin User Policy
    if (process.env.GITHUB_ADMIN_USERS) {
      this.registerPolicy({
        id: 'admin_users',
        name: 'Administrative Users',
        description: 'Grants administrative privileges to specified users',
        enabled: true,
        conditions: [
          {
            type: 'user_in_list',
            field: 'userId',
            operator: 'in',
            value: process.env.GITHUB_ADMIN_USERS.split(',').map(u => u.trim()),
          },
        ],
        actions: [
          { type: 'allow' },
          { type: 'audit_log', parameters: { event: 'admin_access_granted' } },
        ],
      });
    }
  }

  private static async evaluatePolicy(
    policy: Policy,
    context: PolicyEvaluationContext
  ): Promise<{ matched: boolean; action: PolicyAction['type'] }> {
    // Evaluate all conditions (AND logic)
    let allConditionsMet = true;

    for (const condition of policy.conditions) {
      const conditionMet = await this.evaluateCondition(condition, context);
      if (!conditionMet) {
        allConditionsMet = false;
        break;
      }
    }

    // Determine primary action
    const primaryAction =
      policy.actions.find(a => a.type === 'deny' || a.type === 'allow')?.type ||
      'allow';

    return {
      matched: allConditionsMet,
      action: primaryAction,
    };
  }

  private static async evaluateCondition(
    condition: PolicyCondition,
    context: PolicyEvaluationContext
  ): Promise<boolean> {
    const fieldValue = this.getContextValue(condition.field, context);

    switch (condition.type) {
      case 'user_in_list':
        return this.evaluateOperator(
          fieldValue,
          condition.operator,
          condition.value
        );

      case 'user_is_admin':
        // This would require integration with OrganizationManager
        return false; // Placeholder

      case 'org_member':
        return this.evaluateOperator(
          fieldValue,
          condition.operator,
          condition.value
        );

      case 'team_member':
        // This would require GitHub API integration
        return false; // Placeholder

      case 'mfa_enabled':
        // GitHub API doesn't expose MFA status
        return false; // Placeholder

      case 'repo_visibility':
        return this.evaluateOperator(
          fieldValue,
          condition.operator,
          condition.value
        );

      default:
        return false;
    }
  }

  private static getContextValue(
    field: string,
    context: PolicyEvaluationContext
  ): unknown {
    switch (field) {
      case 'userId':
        return context.userId;
      case 'organizationId':
        return context.organizationId;
      case 'resource':
        return context.resource;
      case 'action':
        return context.action;
      default:
        return context.metadata?.[field];
    }
  }

  private static evaluateOperator(
    fieldValue: unknown,
    operator: PolicyCondition['operator'],
    expectedValue: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === expectedValue;

      case 'not_equals':
        return fieldValue !== expectedValue;

      case 'in':
        return (
          Array.isArray(expectedValue) && expectedValue.includes(fieldValue)
        );

      case 'not_in':
        return (
          Array.isArray(expectedValue) && !expectedValue.includes(fieldValue)
        );

      case 'contains':
        return (
          typeof fieldValue === 'string' &&
          typeof expectedValue === 'string' &&
          fieldValue.includes(expectedValue)
        );

      default:
        return false;
    }
  }
}

// ===== CONVENIENCE FUNCTIONS =====

/**
 * Quick policy check for common scenarios
 */
export async function checkUserAccess(
  userId: string,
  organizationId?: string,
  resource?: string
): Promise<{ allowed: boolean; requirements?: string[] }> {
  const result = await PolicyManager.evaluatePolicies({
    userId,
    organizationId,
    resource,
    action: 'access',
  });

  return {
    allowed: result.allowed,
    requirements: result.requirements,
  };
}
