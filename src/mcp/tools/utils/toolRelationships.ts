import {
  API_STATUS_CHECK_TOOL_NAME,
  GITHUB_GET_FILE_CONTENT_TOOL_NAME,
  GITHUB_SEARCH_CODE_TOOL_NAME,
  GITHUB_SEARCH_COMMITS_TOOL_NAME,
  GITHUB_SEARCH_ISSUES_TOOL_NAME,
  GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
  GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
  GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
  PACKAGE_SEARCH_TOOL_NAME,
} from './toolConstants';

/**
 * Tool relationship map for flexible cross-tool research guidance
 * Provides strategic suggestions rather than rigid workflows
 */
export const TOOL_NAMES = {
  API_STATUS_CHECK: API_STATUS_CHECK_TOOL_NAME,
  GITHUB_FETCH_CONTENT: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
  GITHUB_SEARCH_CODE: GITHUB_SEARCH_CODE_TOOL_NAME,
  GITHUB_SEARCH_COMMITS: GITHUB_SEARCH_COMMITS_TOOL_NAME,
  GITHUB_SEARCH_ISSUES: GITHUB_SEARCH_ISSUES_TOOL_NAME,
  GITHUB_SEARCH_PULL_REQUESTS: GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
  GITHUB_SEARCH_REPOSITORIES: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
  GITHUB_VIEW_REPO_STRUCTURE: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
  PACKAGE_SEARCH: PACKAGE_SEARCH_TOOL_NAME,
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

export interface ToolSuggestion {
  tool: ToolName;
  reason: string;
  condition?:
    | 'no_results'
    | 'access_denied'
    | 'not_found'
    | 'rate_limit'
    | 'auth_required';
  priority?: 'high' | 'medium' | 'low';
  strategic?: boolean; // Indicates this is a strategic choice, not just a fallback
}

export interface ToolRelationship {
  // When current tool fails - immediate alternatives
  fallbackTools: ToolSuggestion[];
  // When current tool succeeds - natural progressions
  nextSteps: ToolSuggestion[];
  // Optional prerequisites - what should be done first
  prerequisites?: ToolSuggestion[];
  // Strategic alternatives - different research angles
  strategicAlternatives?: ToolSuggestion[];
  // Cross-connections - related research paths
  crossConnections?: ToolSuggestion[];
}

export interface ToolContext {
  hasError?: boolean;
  errorType?:
    | 'no_results'
    | 'access_denied'
    | 'not_found'
    | 'rate_limit'
    | 'auth_required';
  hasResults?: boolean;
  totalItems?: number;
  previousTools?: ToolName[]; // For circular prevention
  customHints?: string[]; // Custom hints from the tool
  researchGoal?: 'discovery' | 'analysis' | 'debugging' | 'exploration'; // Research intent
}

export interface ToolSuggestionResult {
  fallback: ToolSuggestion[];
  nextSteps: ToolSuggestion[];
  prerequisites: ToolSuggestion[];
  strategicAlternatives: ToolSuggestion[];
  crossConnections: ToolSuggestion[];
  customHints: string[];
  preventCircular: boolean;
  researchGuidance: string[];
}

export const TOOL_RELATIONSHIPS: Record<ToolName, ToolRelationship> = {
  [TOOL_NAMES.PACKAGE_SEARCH]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason:
          'find repositories by topic or language when package search fails',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'search for usage examples across repositories',
        priority: 'medium',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'explore source structure and organization',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'examine key documentation and configuration files',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'find real-world usage examples',
        priority: 'medium',
      },
    ],
    strategicAlternatives: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'investigate problems and community discussions',
        priority: 'medium',
        strategic: true,
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'analyze development history and recent changes',
        priority: 'low',
        strategic: true,
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'understand community and project health',
        priority: 'medium',
        strategic: true,
      },
    ],
    crossConnections: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'investigate known problems, roadmaps, and community health',
        priority: 'medium',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        reason: 'examine recent improvements and pending features',
        priority: 'low',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.PACKAGE_SEARCH,
        reason: 'search for packages or libraries when repository search fails',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'search within content globally',
        priority: 'medium',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'dive directly into implementations and patterns',
        priority: 'high',
        strategic: true,
      },
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'examine structure and identify key components',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'read documentation and configuration',
        priority: 'medium',
      },
    ],
    strategicAlternatives: [],
    crossConnections: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        reason: 'examine workflow and collaboration practices',
        priority: 'low',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'analyze activity and contributor patterns',
        priority: 'medium',
        strategic: true,
      },
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.PACKAGE_SEARCH,
        reason: 'search for package implementations when code search fails',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'find repositories by topic when content search fails',
        priority: 'medium',
      },
      {
        tool: TOOL_NAMES.API_STATUS_CHECK,
        reason: 'check authentication if no results found',
        condition: 'no_results',
        priority: 'low',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'view full content with context',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'explore structure and find related components',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.PACKAGE_SEARCH,
        reason: 'resolve dependencies found in content',
        priority: 'medium',
      },
    ],
    prerequisites: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'verify paths and understand structure before searching',
        priority: 'medium',
      },
    ],
    strategicAlternatives: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'trace evolution and understand decisions',
        priority: 'medium',
        strategic: true,
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'find discussions about patterns and problems',
        priority: 'medium',
        strategic: true,
      },
    ],
    crossConnections: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'understand problems and discussions around this code',
        priority: 'medium',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'trace evolution and recent changes to this code',
        priority: 'medium',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        reason: 'examine changes and review discussions',
        priority: 'low',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'verify correct path and explore alternatives',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'search for similar content when file not found',
        priority: 'medium',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.PACKAGE_SEARCH,
        reason: 'resolve any dependencies mentioned in content',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'find usage examples and related implementations',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'explore related components and broader context',
        priority: 'medium',
      },
    ],
    prerequisites: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'verify content exists and get correct path',
        priority: 'high',
      },
    ],
    strategicAlternatives: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'trace history and understand changes over time',
        priority: 'medium',
        strategic: true,
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'find discussions about content-specific problems',
        priority: 'low',
        strategic: true,
      },
    ],
    crossConnections: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'trace change history and evolution of this content',
        priority: 'medium',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        reason: 'examine recent changes and reviews',
        priority: 'low',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'find the correct repository when structure view fails',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.API_STATUS_CHECK,
        reason: 'check authentication if access denied',
        condition: 'access_denied',
        priority: 'medium',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'read key documentation and configuration',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.PACKAGE_SEARCH,
        reason: 'analyze dependencies from configuration',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'search within using discovered structure',
        priority: 'medium',
      },
    ],
    strategicAlternatives: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'understand challenges and community feedback',
        priority: 'medium',
        strategic: true,
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'analyze development patterns and activity',
        priority: 'low',
        strategic: true,
      },
    ],
    crossConnections: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        reason: 'examine workflow and contribution patterns',
        priority: 'low',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'find repositories first when commit search fails',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'find related discussions and reports',
        priority: 'medium',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'view content from specific commits using commit IDs',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        reason: 'find pull requests that introduced these commits',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'find current implementation and compare changes',
        priority: 'medium',
      },
    ],
    strategicAlternatives: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'find motivation and context for changes',
        priority: 'high',
        strategic: true,
      },
      {
        tool: TOOL_NAMES.PACKAGE_SEARCH,
        reason: 'analyze dependency changes and updates',
        priority: 'medium',
        strategic: true,
      },
    ],
    crossConnections: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'find issues and discussions that motivated these changes',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'understand context and impacted areas',
        priority: 'low',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        reason: 'find related solutions when issue search fails',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'find repositories first when issue search fails',
        priority: 'medium',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'find content related to discussions',
        priority: 'low',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        reason: 'find solutions or implementations for issues',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'find changes that addressed the issues',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'find content related to the issues',
        priority: 'medium',
      },
    ],
    strategicAlternatives: [
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'examine specific content mentioned in discussions',
        priority: 'medium',
        strategic: true,
      },
      {
        tool: TOOL_NAMES.PACKAGE_SEARCH,
        reason: 'investigate dependencies mentioned in compatibility issues',
        priority: 'low',
        strategic: true,
      },
    ],
    crossConnections: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'trace commits that resolved or referenced these issues',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'understand project context for reported issues',
        priority: 'low',
      },
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: {
    fallbackTools: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'find related issues and original problem statements',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'find specific commit IDs for detailed viewing',
        priority: 'medium',
      },
    ],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        reason: 'view content using branch names or commit IDs',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        reason: 'examine individual changes for detailed analysis',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'find current implementation and compare changes',
        priority: 'medium',
      },
    ],
    strategicAlternatives: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        reason: 'understand original motivation and problem context',
        priority: 'high',
        strategic: true,
      },
      {
        tool: TOOL_NAMES.PACKAGE_SEARCH,
        reason: 'analyze dependency updates or changes',
        priority: 'medium',
        strategic: true,
      },
    ],
    crossConnections: [
      {
        tool: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        reason: 'understand context and impact scope',
        priority: 'low',
      },
    ],
  },

  [TOOL_NAMES.API_STATUS_CHECK]: {
    fallbackTools: [],
    nextSteps: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        reason: 'search accessible repositories after checking authentication',
        priority: 'high',
      },
      {
        tool: TOOL_NAMES.PACKAGE_SEARCH,
        reason: 'search public packages as alternative',
        priority: 'high',
      },
    ],
    strategicAlternatives: [
      {
        tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
        reason: 'search publicly available content after confirming access',
        priority: 'medium',
        strategic: true,
      },
    ],
    crossConnections: [],
  },
};

/**
 * Get tool suggestions with circular prevention and strategic guidance
 */
export function getToolSuggestions(
  currentTool: ToolName,
  context: ToolContext = {}
): ToolSuggestionResult {
  const relationships = TOOL_RELATIONSHIPS[currentTool];

  if (!relationships) {
    return {
      fallback: [],
      nextSteps: [],
      prerequisites: [],
      strategicAlternatives: [],
      crossConnections: [],
      customHints: context.customHints || [],
      preventCircular: false,
      researchGuidance: [],
    };
  }

  const previousTools = context.previousTools || [];

  // Filter out tools that were recently used (circular prevention)
  const filterCircular = (suggestions: ToolSuggestion[]): ToolSuggestion[] => {
    return suggestions.filter(suggestion => {
      // Don't suggest the current tool
      if (suggestion.tool === currentTool) return false;

      // Don't suggest tools used in the last 2 steps to prevent immediate circles
      const recentTools = previousTools.slice(-2);
      return !recentTools.includes(suggestion.tool);
    });
  };

  // Filter fallback tools based on context and circular prevention
  let fallback = relationships.fallbackTools.filter(item => {
    if (!item.condition) return true;

    switch (item.condition) {
      case 'no_results':
        return context.errorType === 'no_results';
      case 'access_denied':
        return context.errorType === 'access_denied';
      case 'not_found':
        return context.errorType === 'not_found';
      case 'rate_limit':
        return context.errorType === 'rate_limit';
      case 'auth_required':
        return context.errorType === 'auth_required';
      default:
        return true;
    }
  });

  fallback = filterCircular(fallback);

  // Return next steps only if operation was successful
  let nextSteps = context.hasResults ? relationships.nextSteps : [];
  nextSteps = filterCircular(nextSteps);

  // Prerequisites are always available but filtered for circular prevention
  let prerequisites = relationships.prerequisites || [];
  prerequisites = filterCircular(prerequisites);

  // Strategic alternatives - always available for flexible research
  let strategicAlternatives = relationships.strategicAlternatives || [];
  strategicAlternatives = filterCircular(strategicAlternatives);

  // Cross connections - for exploring related areas
  let crossConnections = relationships.crossConnections || [];
  crossConnections = filterCircular(crossConnections);

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sortByPriority = (suggestions: ToolSuggestion[]) => {
    return suggestions.sort((a, b) => {
      const aPriority = priorityOrder[a.priority || 'medium'];
      const bPriority = priorityOrder[b.priority || 'medium'];
      return aPriority - bPriority;
    });
  };

  // Generate research guidance based on context
  const researchGuidance = generateResearchGuidance(currentTool, context, {
    hasStrategicOptions: strategicAlternatives.length > 0,
    hasCrossConnections: crossConnections.length > 0,
    hasMultipleNextSteps: nextSteps.length > 1,
  });

  return {
    fallback: sortByPriority(fallback),
    nextSteps: sortByPriority(nextSteps),
    prerequisites: sortByPriority(prerequisites),
    strategicAlternatives: sortByPriority(strategicAlternatives),
    crossConnections: sortByPriority(crossConnections),
    customHints: context.customHints || [],
    preventCircular: previousTools.length > 0,
    researchGuidance,
  };
}

/**
 * Generate strategic research guidance for the LLM
 */
function generateResearchGuidance(
  _currentTool: ToolName,
  context: ToolContext,
  options: {
    hasStrategicOptions: boolean;
    hasCrossConnections: boolean;
    hasMultipleNextSteps: boolean;
  }
): string[] {
  const guidance: string[] = [];

  // Core guidance based on research goal
  if (context.researchGoal) {
    switch (context.researchGoal) {
      case 'discovery':
        guidance.push(
          'DISCOVERY MODE: Focus on breadth - explore multiple angles and gather diverse information'
        );
        break;
      case 'analysis':
        guidance.push(
          'ANALYSIS MODE: Focus on depth - examine specific implementations and trace relationships'
        );
        break;
      case 'debugging':
        guidance.push(
          'DEBUG MODE: Follow the trail - trace issues through commits, PRs, and related discussions'
        );
        break;
      case 'exploration':
        guidance.push(
          'EXPLORATION MODE: Be flexible - use strategic alternatives to uncover unexpected insights'
        );
        break;
    }
  }

  // Guidance based on current state
  if (context.hasResults) {
    if (options.hasMultipleNextSteps) {
      guidance.push(
        'SUCCESS: You have multiple good options - choose based on what aspect you want to explore next'
      );
    }
    if (options.hasStrategicOptions) {
      guidance.push(
        'STRATEGIC CHOICE: Consider alternative approaches that might reveal different insights'
      );
    }
  } else if (context.hasError) {
    guidance.push(
      'BLOCKED: Try fallback approaches or pivot to strategic alternatives for different angles'
    );
  }

  // Cross-connection guidance
  if (options.hasCrossConnections) {
    guidance.push(
      'CROSS-RESEARCH: Explore connections to related areas for comprehensive understanding'
    );
  }

  // Circular prevention guidance
  if (context.previousTools && context.previousTools.length > 3) {
    guidance.push(
      'RESEARCH FLOW: You have explored several tools - consider strategic alternatives to break new ground'
    );
  }

  // General strategic guidance
  guidance.push(
    'CHOOSE WISELY: Each tool offers different perspectives - select based on your specific research needs'
  );

  return guidance;
}

/**
 * Generate formatted hints for LLM with strategic guidance
 */
export function generateToolHints(
  currentTool: ToolName,
  context: ToolContext = {}
): string[] {
  const suggestions = getToolSuggestions(currentTool, context);
  const hints: string[] = [];

  // Add research guidance first
  hints.push(...suggestions.researchGuidance);

  // Add custom hints from the tool
  if (suggestions.customHints.length > 0) {
    hints.push(...suggestions.customHints.map(hint => `CUSTOM: ${hint}`));
  }

  // Add error-specific fallbacks
  if (context.hasError && suggestions.fallback.length > 0) {
    const topFallback = suggestions.fallback[0];
    hints.push(`FALLBACK: ${topFallback.reason} -> use ${topFallback.tool}`);
  }

  // Add success next steps with choices
  if (context.hasResults && suggestions.nextSteps.length > 0) {
    const topNext = suggestions.nextSteps[0];
    hints.push(`NEXT: ${topNext.reason} -> use ${topNext.tool}`);

    // Add strategic alternatives as choices
    if (suggestions.strategicAlternatives.length > 0) {
      const topStrategy = suggestions.strategicAlternatives[0];
      hints.push(
        `ALTERNATIVE: ${topStrategy.reason} -> use ${topStrategy.tool}`
      );
    }

    // Add second option if available
    if (suggestions.nextSteps.length > 1) {
      const secondNext = suggestions.nextSteps[1];
      hints.push(`ALSO: ${secondNext.reason} -> use ${secondNext.tool}`);
    }
  }

  // Add prerequisites if needed
  if (suggestions.prerequisites.length > 0) {
    const topPrereq = suggestions.prerequisites[0];
    hints.push(`FIRST: ${topPrereq.reason} -> use ${topPrereq.tool}`);
  }

  // Add cross-connections for broader exploration
  if (suggestions.crossConnections.length > 0) {
    const topCross = suggestions.crossConnections[0];
    hints.push(`EXPLORE: ${topCross.reason} -> use ${topCross.tool}`);
  }

  // Add context-specific guidance
  if (context.errorType === 'auth_required') {
    hints.push(`Authentication required: run "gh auth login" then retry`);
  } else if (context.errorType === 'rate_limit') {
    hints.push(`Rate limited: wait 5-10 minutes or use fewer targeted queries`);
  } else if (context.totalItems && context.totalItems > 50) {
    hints.push(
      `Large result set: consider filtering or using more specific parameters`
    );
  }

  return hints.slice(0, 8); // Allow more hints for better guidance
}

/**
 * Simple helper for tools to generate hints with minimal setup
 */
export function generateSmartHints(
  toolName: ToolName,
  results: {
    hasResults?: boolean;
    totalItems?: number;
    errorMessage?: string;
    customHints?: string[];
  },
  previousTools?: ToolName[]
): string[] {
  const context: ToolContext = {
    hasResults: results.hasResults ?? (results.totalItems || 0) > 0,
    hasError: !!results.errorMessage,
    totalItems: results.totalItems,
    customHints: results.customHints,
    previousTools,
    // Infer research goal from context
    researchGoal: results.hasResults
      ? 'analysis'
      : results.errorMessage
        ? 'debugging'
        : 'exploration',
  };

  // Detect error type from message
  if (results.errorMessage) {
    const message = results.errorMessage.toLowerCase();
    if (message.includes('rate limit')) context.errorType = 'rate_limit';
    else if (message.includes('auth')) context.errorType = 'auth_required';
    else if (message.includes('not found')) context.errorType = 'not_found';
    else if (message.includes('access denied'))
      context.errorType = 'access_denied';
    else if (message.includes('no results')) context.errorType = 'no_results';
  }

  return generateToolHints(toolName, context);
}

// Legacy compatibility exports
export function generateSmartResearchHints(
  currentTool: string,
  context: any
): string[] {
  // Convert to new system temporarily for backward compatibility
  return generateSmartHints(currentTool as any, {
    hasResults: context?.hasResults,
    totalItems:
      context?.foundFiles?.length || context?.foundPackages?.length || 0,
    customHints: [],
  });
}
