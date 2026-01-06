/**
 * Research Output Utilities
 *
 * Handles formatting and storage of research findings from Octocode MCP tools.
 * Findings are stored in `.octocode/research/findings.md` in the project directory.
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ============================================
// Types
// ============================================

export interface ResearchFinding {
  /** Tool name that generated this finding */
  tool: string;
  /** ISO timestamp of when the finding was captured */
  timestamp: string;
  /** Summarized query/input sent to the tool */
  query: string;
  /** Summarized response/output from the tool */
  summary: string;
}

export interface ResearchOutputConfig {
  /** Project root directory (defaults to cwd) */
  projectRoot?: string;
  /** Maximum length for query summary */
  maxQueryLength?: number;
  /** Maximum length for response summary */
  maxSummaryLength?: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_QUERY_LENGTH = 200;
const DEFAULT_MAX_SUMMARY_LENGTH = 500;
const RESEARCH_DIR = '.octocode/research';
const FINDINGS_FILE = 'findings.md';

// ============================================
// Main Functions
// ============================================

/**
 * Append a research finding to the findings file
 */
export async function appendResearchFinding(
  cwd: string,
  finding: ResearchFinding,
  config: ResearchOutputConfig = {}
): Promise<void> {
  const researchDir = join(cwd, RESEARCH_DIR);
  const findingsPath = join(researchDir, FINDINGS_FILE);

  // Ensure research directory exists
  ensureResearchDir(researchDir);

  // Initialize findings file if it doesn't exist
  if (!existsSync(findingsPath)) {
    initializeFindingsFile(findingsPath);
  }

  // Format the finding entry
  const entry = formatFindingEntry(finding, config);

  // Append to file
  appendFileSync(findingsPath, entry, { encoding: 'utf-8' });
}

/**
 * Summarize a tool query/input for display
 */
export function summarizeQuery(
  input: unknown,
  maxLength: number = DEFAULT_MAX_QUERY_LENGTH
): string {
  if (!input) return '(no input)';

  try {
    // Handle object inputs (most Octocode tools)
    if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;

      // Extract key fields for common tool patterns
      const keyFields = extractKeyFields(obj);
      if (keyFields) {
        return truncate(keyFields, maxLength);
      }

      // Fall back to JSON stringification
      const json = JSON.stringify(obj, null, 0);
      return truncate(json, maxLength);
    }

    // Handle string inputs
    if (typeof input === 'string') {
      return truncate(input, maxLength);
    }

    return truncate(String(input), maxLength);
  } catch {
    return '(unable to summarize query)';
  }
}

/**
 * Summarize a tool response for display
 */
export function summarizeResponse(
  response: unknown,
  maxLength: number = DEFAULT_MAX_SUMMARY_LENGTH
): string {
  if (!response) return '(no response)';

  try {
    // Handle structured Octocode responses
    if (typeof response === 'object' && response !== null) {
      const obj = response as Record<string, unknown>;

      // Check for common response patterns
      const summary = extractResponseSummary(obj);
      if (summary) {
        return truncate(summary, maxLength);
      }

      // Check for content array (typical MCP response)
      if (Array.isArray(obj.content)) {
        const textContent = obj.content
          .filter(
            (c: { type?: string }) =>
              typeof c === 'object' && c?.type === 'text'
          )
          .map((c: { text?: string }) => c?.text || '')
          .join('\n');
        if (textContent) {
          return truncate(textContent, maxLength);
        }
      }

      // Fall back to JSON stringification
      const json = JSON.stringify(obj, null, 0);
      return truncate(json, maxLength);
    }

    // Handle string responses
    if (typeof response === 'string') {
      return truncate(response, maxLength);
    }

    return truncate(String(response), maxLength);
  } catch {
    return '(unable to summarize response)';
  }
}

/**
 * Get the short tool name from full MCP tool name
 */
export function getShortToolName(toolName: string): string {
  // mcp__octocode-local__localSearchCode -> localSearchCode
  const parts = toolName.split('__');
  return parts[parts.length - 1] || toolName;
}

/**
 * Check if a tool is an Octocode research tool
 */
export function isOctocodeResearchTool(toolName: string): boolean {
  return toolName.startsWith('mcp__octocode');
}

/**
 * Get the research directory path for a project
 */
export function getResearchDir(cwd: string): string {
  return join(cwd, RESEARCH_DIR);
}

/**
 * Get the findings file path for a project
 */
export function getFindingsPath(cwd: string): string {
  return join(cwd, RESEARCH_DIR, FINDINGS_FILE);
}

/**
 * Check if a project has a research directory
 */
export function hasResearchDir(cwd: string): boolean {
  return existsSync(getResearchDir(cwd));
}

/**
 * Read existing findings from a project
 */
export function readFindings(cwd: string): string | null {
  const findingsPath = getFindingsPath(cwd);
  if (!existsSync(findingsPath)) {
    return null;
  }
  return readFileSync(findingsPath, 'utf-8');
}

// ============================================
// Helper Functions
// ============================================

/**
 * Ensure the research directory exists
 */
function ensureResearchDir(researchDir: string): void {
  if (!existsSync(researchDir)) {
    mkdirSync(researchDir, { recursive: true });
  }

  // Also ensure parent .octocode exists
  const parentDir = dirname(researchDir);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
}

/**
 * Initialize a new findings file with header
 */
function initializeFindingsFile(findingsPath: string): void {
  const header = `# Research Findings

> Auto-captured by Octocode MCP tools
> Created: ${new Date().toISOString()}

---

`;
  appendFileSync(findingsPath, header, { encoding: 'utf-8' });
}

/**
 * Format a finding entry for the markdown file
 */
function formatFindingEntry(
  finding: ResearchFinding,
  config: ResearchOutputConfig
): string {
  const maxQuery = config.maxQueryLength ?? DEFAULT_MAX_QUERY_LENGTH;
  const maxSummary = config.maxSummaryLength ?? DEFAULT_MAX_SUMMARY_LENGTH;

  const shortTool = getShortToolName(finding.tool);
  const timestamp = formatTimestamp(finding.timestamp);
  const query = truncate(finding.query, maxQuery);
  const summary = truncate(finding.summary, maxSummary);

  return `
## ${shortTool}
**Time:** ${timestamp}

**Query:**
\`\`\`
${query}
\`\`\`

**Result:**
${summary}

---
`;
}

/**
 * Format an ISO timestamp for display
 */
function formatTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoTimestamp;
  }
}

/**
 * Truncate a string to max length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Extract key fields from common tool input patterns
 */
function extractKeyFields(obj: Record<string, unknown>): string | null {
  // Pattern: search tools with 'pattern' or 'query'
  if (obj.pattern) {
    const path = obj.path ? ` in ${obj.path}` : '';
    return `Search: "${obj.pattern}"${path}`;
  }

  if (obj.query) {
    return `Query: "${obj.query}"`;
  }

  // Pattern: repository tools (check before path-only)
  if (obj.owner && obj.repo) {
    const path = obj.path ? `/${obj.path}` : '';
    return `Repo: ${obj.owner}/${obj.repo}${path}`;
  }

  // Pattern: package search
  if (obj.name && obj.ecosystem) {
    return `Package: ${obj.ecosystem}/${obj.name}`;
  }

  // Pattern: file content tools with 'path'
  if (obj.path && !obj.pattern) {
    const matchString = obj.matchString ? ` (match: ${obj.matchString})` : '';
    return `File: ${obj.path}${matchString}`;
  }

  return null;
}

/**
 * Extract summary from common response patterns
 */
function extractResponseSummary(obj: Record<string, unknown>): string | null {
  // Pattern: files array with matches
  if (Array.isArray(obj.files)) {
    const fileCount = obj.files.length;
    const totalMatches = obj.totalMatches ?? 'unknown';
    return `Found ${totalMatches} matches in ${fileCount} files`;
  }

  // Pattern: status with data
  if (obj.status && obj.data) {
    const data = obj.data as Record<string, unknown>;
    if (data.content && typeof data.content === 'string') {
      return truncate(data.content, 300);
    }
    if (data.totalLines) {
      return `File: ${data.path || 'unknown'} (${data.totalLines} lines)`;
    }
  }

  // Pattern: structure response
  if (obj.structure && typeof obj.structure === 'object') {
    const summary = obj.summary as Record<string, unknown> | undefined;
    if (summary) {
      return `Structure: ${summary.totalFiles ?? '?'} files, ${summary.totalFolders ?? '?'} folders`;
    }
  }

  // Pattern: results array
  if (Array.isArray(obj.results)) {
    return `${obj.results.length} results returned`;
  }

  return null;
}
