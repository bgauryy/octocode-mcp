/**
 * File Tools
 *
 * Provider-agnostic file operation tools for the unified agent loop.
 * Compatible with Vercel AI SDK tool format.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { readFile, writeFile, readdir } from 'fs/promises';
import { dirname, relative, resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

/**
 * Read tool - Read file contents
 */
export const readTool = tool({
  description:
    'Read the contents of a file at the specified path. Returns the file content as text. Use this to examine code, configuration files, or any text-based files.',
  parameters: z.object({
    path: z
      .string()
      .describe('The path to the file to read (relative or absolute)'),
    offset: z
      .number()
      .optional()
      .describe('Line number to start reading from (1-indexed)'),
    limit: z.number().optional().describe('Maximum number of lines to read'),
  }),
  execute: async ({ path, offset, limit }) => {
    try {
      const resolvedPath = resolve(path);
      const content = await readFile(resolvedPath, 'utf-8');

      if (offset !== undefined || limit !== undefined) {
        const lines = content.split('\n');
        const start = offset ? offset - 1 : 0;
        const end = limit ? start + limit : lines.length;
        return lines.slice(start, end).join('\n');
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`File not found: ${path}`);
        }
        throw new Error(`Failed to read file: ${error.message}`);
      }
      throw error;
    }
  },
});

/**
 * Write tool - Write content to a file
 */
export const writeTool = tool({
  description:
    'Write content to a file at the specified path. Creates the file if it does not exist, or overwrites existing content. Creates parent directories if needed.',
  parameters: z.object({
    path: z.string().describe('The path to the file to write'),
    content: z.string().describe('The content to write to the file'),
  }),
  execute: async ({ path, content }) => {
    try {
      const resolvedPath = resolve(path);
      const dir = dirname(resolvedPath);

      // Create parent directories if they don't exist
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      await writeFile(resolvedPath, content, 'utf-8');
      return `Successfully wrote to ${path}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to write file: ${error.message}`);
      }
      throw error;
    }
  },
});

/**
 * Edit tool - Make targeted edits to a file
 */
export const editTool = tool({
  description:
    'Make targeted edits to a file by replacing a specific string with a new string. Use this for precise code modifications.',
  parameters: z.object({
    path: z.string().describe('The path to the file to edit'),
    oldString: z.string().describe('The exact string to find and replace'),
    newString: z.string().describe('The string to replace it with'),
    replaceAll: z
      .boolean()
      .optional()
      .describe('Replace all occurrences (default: false)'),
  }),
  execute: async ({ path, oldString, newString, replaceAll }) => {
    try {
      const resolvedPath = resolve(path);
      let content = await readFile(resolvedPath, 'utf-8');

      if (!content.includes(oldString)) {
        throw new Error(
          `String not found in file: "${oldString.slice(0, 50)}..."`
        );
      }

      if (replaceAll) {
        content = content.split(oldString).join(newString);
      } else {
        content = content.replace(oldString, newString);
      }

      await writeFile(resolvedPath, content, 'utf-8');
      return `Successfully edited ${path}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to edit file: ${error.message}`);
      }
      throw error;
    }
  },
});

/**
 * Glob tool - Find files matching a pattern
 */
export const globTool = tool({
  description:
    'Find files matching a glob pattern. Returns a list of matching file paths. Useful for discovering files in a project.',
  parameters: z.object({
    pattern: z
      .string()
      .describe('The glob pattern to match (e.g., "**/*.ts", "src/**/*.js")'),
    cwd: z.string().optional().describe('Working directory to search from'),
    ignore: z.array(z.string()).optional().describe('Patterns to ignore'),
  }),
  execute: async ({ pattern, cwd, ignore }) => {
    try {
      const workDir = cwd ? resolve(cwd) : process.cwd();

      // Use find command with glob pattern support
      const ignoreArgs = (ignore || ['node_modules', '.git', 'dist', 'out'])
        .map(p => `-not -path "*/${p}/*"`)
        .join(' ');

      // Convert glob to find pattern
      const findPattern = pattern
        .replace(/\*\*/g, '*')
        .replace(/\*\.(\w+)$/, '-name "*.${1}"');

      const cmd = `find "${workDir}" -type f ${findPattern.includes('-name') ? findPattern : `-name "${pattern}"`} ${ignoreArgs} 2>/dev/null | head -100`;

      const result = execSync(cmd, { encoding: 'utf-8' }).trim();
      const files = result
        ? result.split('\n').map(f => relative(workDir, f))
        : [];

      return JSON.stringify(files, null, 2);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Glob search failed: ${error.message}`);
      }
      throw error;
    }
  },
});

/**
 * List directory tool - List files in a directory
 */
export const listDirTool = tool({
  description:
    'List files and directories in the specified path. Returns names with type indicators.',
  parameters: z.object({
    path: z.string().describe('The directory path to list'),
    recursive: z
      .boolean()
      .optional()
      .describe('List recursively (default: false)'),
  }),
  execute: async ({ path: dirPath, recursive }) => {
    try {
      const resolvedPath = resolve(dirPath);

      if (recursive) {
        const cmd = `find "${resolvedPath}" -maxdepth 3 -type f -o -type d 2>/dev/null | head -100`;
        const result = execSync(cmd, { encoding: 'utf-8' }).trim();
        return result || 'Empty directory';
      }

      const entries = await readdir(resolvedPath, { withFileTypes: true });
      const items = entries.map(entry => {
        const suffix = entry.isDirectory() ? '/' : '';
        return `${entry.name}${suffix}`;
      });

      return items.join('\n') || 'Empty directory';
    } catch (error) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`Directory not found: ${dirPath}`);
        }
        throw new Error(`Failed to list directory: ${error.message}`);
      }
      throw error;
    }
  },
});

/**
 * File tools collection
 */
export const fileTools = {
  Read: readTool,
  Write: writeTool,
  Edit: editTool,
  Glob: globTool,
  ListDir: listDirTool,
};
