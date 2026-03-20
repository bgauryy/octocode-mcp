import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface ResearchFinding {
  tool: string;

  timestamp: string;

  query: string;

  summary: string;
}

interface ResearchOutputConfig {
  projectRoot?: string;

  maxQueryLength?: number;

  maxSummaryLength?: number;
}

const DEFAULT_MAX_QUERY_LENGTH = 200;
const DEFAULT_MAX_SUMMARY_LENGTH = 500;
const RESEARCH_DIR = '.octocode/research';
const FINDINGS_FILE = 'findings.md';

export async function appendResearchFinding(
  cwd: string,
  finding: ResearchFinding,
  config: ResearchOutputConfig = {}
): Promise<void> {
  const researchDir = join(cwd, RESEARCH_DIR);
  const findingsPath = join(researchDir, FINDINGS_FILE);

  ensureResearchDir(researchDir);

  if (!existsSync(findingsPath)) {
    initializeFindingsFile(findingsPath);
  }

  const entry = formatFindingEntry(finding, config);

  appendFileSync(findingsPath, entry, { encoding: 'utf-8' });
}

export function summarizeQuery(
  input: unknown,
  maxLength: number = DEFAULT_MAX_QUERY_LENGTH
): string {
  if (!input) return '(no input)';

  try {
    if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;

      const keyFields = extractKeyFields(obj);
      if (keyFields) {
        return truncate(keyFields, maxLength);
      }

      const json = JSON.stringify(obj, null, 0);
      return truncate(json, maxLength);
    }

    if (typeof input === 'string') {
      return truncate(input, maxLength);
    }

    return truncate(String(input), maxLength);
  } catch {
    return '(unable to summarize query)';
  }
}

export function summarizeResponse(
  response: unknown,
  maxLength: number = DEFAULT_MAX_SUMMARY_LENGTH
): string {
  if (!response) return '(no response)';

  try {
    if (typeof response === 'object' && response !== null) {
      const obj = response as Record<string, unknown>;

      const summary = extractResponseSummary(obj);
      if (summary) {
        return truncate(summary, maxLength);
      }

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

      const json = JSON.stringify(obj, null, 0);
      return truncate(json, maxLength);
    }

    if (typeof response === 'string') {
      return truncate(response, maxLength);
    }

    return truncate(String(response), maxLength);
  } catch {
    return '(unable to summarize response)';
  }
}

export function getShortToolName(toolName: string): string {
  const parts = toolName.split('__');
  return parts[parts.length - 1] || toolName;
}

export function isOctocodeResearchTool(toolName: string): boolean {
  return toolName.startsWith('mcp__octocode');
}

export function getResearchDir(cwd: string): string {
  return join(cwd, RESEARCH_DIR);
}

export function getFindingsPath(cwd: string): string {
  return join(cwd, RESEARCH_DIR, FINDINGS_FILE);
}

export function hasResearchDir(cwd: string): boolean {
  return existsSync(getResearchDir(cwd));
}

export function readFindings(cwd: string): string | null {
  const findingsPath = getFindingsPath(cwd);
  if (!existsSync(findingsPath)) {
    return null;
  }
  return readFileSync(findingsPath, 'utf-8');
}

function ensureResearchDir(researchDir: string): void {
  if (!existsSync(researchDir)) {
    mkdirSync(researchDir, { recursive: true });
  }

  const parentDir = dirname(researchDir);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
}

function initializeFindingsFile(findingsPath: string): void {
  const header = `# Research Findings

> Auto-captured by Octocode MCP tools
> Created: ${new Date().toISOString()}

---

`;
  appendFileSync(findingsPath, header, { encoding: 'utf-8' });
}

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

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

function extractKeyFields(obj: Record<string, unknown>): string | null {
  if (obj.pattern) {
    const path = obj.path ? ` in ${obj.path}` : '';
    return `Search: "${obj.pattern}"${path}`;
  }

  if (obj.query) {
    return `Query: "${obj.query}"`;
  }

  if (obj.owner && obj.repo) {
    const path = obj.path ? `/${obj.path}` : '';
    return `Repo: ${obj.owner}/${obj.repo}${path}`;
  }

  if (obj.name && obj.ecosystem) {
    return `Package: ${obj.ecosystem}/${obj.name}`;
  }

  if (obj.path && !obj.pattern) {
    const matchString = obj.matchString ? ` (match: ${obj.matchString})` : '';
    return `File: ${obj.path}${matchString}`;
  }

  return null;
}

function extractResponseSummary(obj: Record<string, unknown>): string | null {
  if (Array.isArray(obj.files)) {
    const fileCount = obj.files.length;
    const totalMatches = obj.totalMatches ?? 'unknown';
    return `Found ${totalMatches} matches in ${fileCount} files`;
  }

  if (obj.status && obj.data) {
    const data = obj.data as Record<string, unknown>;
    if (data.content && typeof data.content === 'string') {
      return truncate(data.content, 300);
    }
    if (data.totalLines) {
      return `File: ${data.path || 'unknown'} (${data.totalLines} lines)`;
    }
  }

  if (obj.structure && typeof obj.structure === 'object') {
    const summary = obj.summary as Record<string, unknown> | undefined;
    if (summary) {
      return `Structure: ${summary.totalFiles ?? '?'} files, ${summary.totalFolders ?? '?'} folders`;
    }
  }

  if (Array.isArray(obj.results)) {
    return `${obj.results.length} results returned`;
  }

  return null;
}
