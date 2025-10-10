import { ToolName } from '../constants';
import type { QueryStatus } from '../utils/bulkOperations.js';
import {
  NAVIGATION_GENERAL,
  NAVIGATION_TOOL,
  RESEARCH_GENERAL,
  RESEARCH_TOOL,
  NO_RESULTS_GENERAL,
  NO_RESULTS_TOOL,
  ERROR_RECOVERY_GENERAL,
  ERROR_RECOVERY_TOOL,
  EMPTY_QUERY_VALIDATION_HINTS,
} from './hintsContent';

export interface HintContext {
  toolName: ToolName;
  resultType: 'hasResults' | 'empty' | 'failed';
  errorMessage?: string;
}

export interface OrganizedHints {
  hasResults?: string[];
  empty?: string[];
  failed?: string[];
}

export function getHints(context: HintContext): OrganizedHints {
  const hints: OrganizedHints = {};

  if (context.resultType === 'hasResults') {
    const hasResultsHints = getHasResultsHints(context.toolName);
    if (hasResultsHints.length > 0) {
      hints.hasResults = hasResultsHints;
    }
  }

  if (context.resultType === 'empty') {
    const emptyHints = getEmptyHints(context.toolName);
    if (emptyHints.length > 0) {
      hints.empty = emptyHints;
    }
  }

  if (context.resultType === 'failed') {
    const failedHints = getFailedHints(context.toolName, context.errorMessage);
    if (failedHints.length > 0) {
      hints.failed = failedHints;
    }
  }

  return hints;
}

export function generateHints(context: HintContext): OrganizedHints {
  return getHints(context);
}

export function generateEmptyQueryHints(_toolName: ToolName): string[] {
  return EMPTY_QUERY_VALIDATION_HINTS;
}

function getHasResultsHints(toolName: ToolName): string[] {
  const hints: string[] = [];

  hints.push(...RESEARCH_GENERAL);

  const toolResearch = RESEARCH_TOOL[toolName];
  if (toolResearch) {
    hints.push(...toolResearch);
  }

  hints.push(...NAVIGATION_GENERAL);
  const toolNavigation = NAVIGATION_TOOL[toolName];
  if (toolNavigation) {
    hints.push(...toolNavigation);
  }

  return hints;
}

function getEmptyHints(toolName: ToolName): string[] {
  const hints: string[] = [];

  hints.push(...NO_RESULTS_GENERAL);

  const toolNoResults = NO_RESULTS_TOOL[toolName];
  if (toolNoResults) {
    hints.push(...toolNoResults);
  }

  hints.push(...NAVIGATION_GENERAL);
  const toolNavigation = NAVIGATION_TOOL[toolName];
  if (toolNavigation) {
    hints.push(...toolNavigation);
  }

  return hints;
}

function getFailedHints(toolName: ToolName, errorMessage?: string): string[] {
  const hints: string[] = [];

  if (errorMessage) {
    const errorType = detectErrorType(errorMessage);
    if (errorType && ERROR_RECOVERY_GENERAL[errorType]) {
      hints.push(ERROR_RECOVERY_GENERAL[errorType]);
    }
  }

  const toolHints = ERROR_RECOVERY_TOOL[toolName];
  if (toolHints) {
    hints.push(...toolHints);
  }

  hints.push(...NAVIGATION_GENERAL);
  const toolNavigation = NAVIGATION_TOOL[toolName];
  if (toolNavigation) {
    hints.push(...toolNavigation);
  }

  return hints;
}

function detectErrorType(
  errorMessage: string
): keyof typeof ERROR_RECOVERY_GENERAL | null {
  const error = errorMessage.toLowerCase();

  if (error.includes('rate limit') || error.includes('too many requests')) {
    return 'RATE_LIMIT';
  }
  if (
    error.includes('auth') ||
    error.includes('token') ||
    error.includes('unauthorized')
  ) {
    return 'AUTH_REQUIRED';
  }
  if (
    error.includes('network') ||
    error.includes('connection') ||
    error.includes('timeout')
  ) {
    return 'NETWORK_ERROR';
  }
  if (error.includes('not found') || error.includes('404')) {
    return 'NOT_FOUND';
  }
  if (
    error.includes('access denied') ||
    error.includes('forbidden') ||
    error.includes('403')
  ) {
    return 'ACCESS_DENIED';
  }

  return null;
}

export function deduplicateHintsByStatus(
  hints: Array<{ status: QueryStatus; hints: string[] }>
): {
  hasResultsStatusHints: string[];
  emptyStatusHints: string[];
  errorStatusHints: string[];
} {
  const hasResultsSet = new Set<string>();
  const emptySet = new Set<string>();
  const errorSet = new Set<string>();

  hints.forEach(({ status, hints }) => {
    if (status === 'hasResults') {
      hints.forEach(h => hasResultsSet.add(h));
    } else if (status === 'empty') {
      hints.forEach(h => emptySet.add(h));
    } else if (status === 'error') {
      hints.forEach(h => errorSet.add(h));
    }
  });

  return {
    hasResultsStatusHints: Array.from(hasResultsSet),
    emptyStatusHints: Array.from(emptySet),
    errorStatusHints: Array.from(errorSet),
  };
}

export function generateInstructions(
  totalCount: number,
  hasResultsCount: number,
  emptyCount: number,
  errorCount: number
): string {
  const lines: string[] = [
    `Bulk response with ${totalCount} results: ${hasResultsCount} hasResults, ${emptyCount} empty, ${errorCount} failed.`,
    'Each result includes the original query, status, and data.',
  ];

  if (hasResultsCount > 0) {
    lines.push(
      'Review hasResultsStatusHints for guidance on results with data.'
    );
  }
  if (emptyCount > 0) {
    lines.push('Review emptyStatusHints for no-results scenarios.');
  }
  if (errorCount > 0) {
    lines.push('Review errorStatusHints for error recovery strategies.');
  }

  return lines.join('\n');
}
