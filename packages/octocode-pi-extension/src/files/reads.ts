/**
 * Which tool calls showed the model a file: for the `file` tool's guard (`tool.ts`), and for compaction, which forgets a
 * read once its result is trimmed. Only Pi's `read` counts. MCP tools are the server's own contract (Octocode's
 * `localFetch` pages and minifies by its own rules), so the extension does not parse their inputs or results.
 */
import { resolveReadToolPath } from '../shared/home.js';

/** The file a Pi `read` call asked for (any range: Pi's own guard semantics); none for every other tool. */
export function readPaths(toolName: string, input: Record<string, unknown>, cwd: string): string[] {
  return toolName === 'read' && typeof input['path'] === 'string' ? [resolveReadToolPath(cwd, input['path'])] : [];
}
