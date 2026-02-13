/**
 * Zod validation schema for the githubCloneRepo tool.
 *
 * Accepts owner, repo, optional branch, and an optional sparse_path
 * for partial tree fetching (sparse checkout).
 *
 * SECURITY: owner, repo, and branch are used in filesystem paths.
 * They MUST be validated against path-traversal patterns (../ , / , \).
 */

import { z } from 'zod';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';

// ─────────────────────────────────────────────────────────────────────
// Validators
// ─────────────────────────────────────────────────────────────────────

/**
 * GitHub identifier pattern – prevents path traversal.
 * Allows alphanumeric, hyphens, underscores, dots (but NOT ".." or "/" or "\").
 * Matches GitHub's actual owner/repo naming rules.
 */
const GITHUB_IDENTIFIER = /^(?!\.\.?$)(?!.*\.\.)[a-zA-Z0-9._-]+$/;

/**
 * Branch name pattern – git branch names allow / for namespaces (e.g. feature/foo)
 * but must NOT contain ".." or start with "-".
 */
const SAFE_BRANCH = /^(?!-)(?!.*\.\.)(?!.*\\)[a-zA-Z0-9._/-]+$/;

/**
 * Sparse path pattern – allows / for subdirectories
 * but must NOT contain "..", "\", or start with "-" (git flag injection).
 */
const SAFE_SPARSE_PATH = /^(?!-)(?!.*\.\.)(?!.*\\)[a-zA-Z0-9._/@-]+$/;

// ─────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────

const CloneRepoQuerySchema = BaseQuerySchema.extend({
  owner: z
    .string()
    .min(1)
    .max(200)
    .regex(
      GITHUB_IDENTIFIER,
      'Invalid owner: must be a valid GitHub identifier (no path separators or "..")'
    )
    .describe('Repository owner or organisation (e.g. "facebook")'),
  repo: z
    .string()
    .min(1)
    .max(150)
    .regex(
      GITHUB_IDENTIFIER,
      'Invalid repo: must be a valid GitHub identifier (no path separators or "..")'
    )
    .describe('Repository name (e.g. "react")'),
  branch: z
    .string()
    .min(1)
    .max(255)
    .regex(
      SAFE_BRANCH,
      'Invalid branch: must not contain ".." or start with "-"'
    )
    .optional()
    .describe(
      'Branch to clone. Omit to use the repository\'s default branch (usually "main").'
    ),
  sparse_path: z
    .string()
    .min(1)
    .max(500)
    .regex(
      SAFE_SPARSE_PATH,
      'Invalid sparse_path: must not contain ".." or start with "-"'
    )
    .refine(val => !val.startsWith('/'), {
      message: 'sparse_path must be a relative path (no leading /)',
    })
    .optional()
    .describe(
      'Fetch only this subdirectory (sparse checkout). ' +
        'Dramatically faster for large monorepos – only matching files are downloaded. ' +
        'Examples: "src/compiler", "packages/core/src", "lib/utils". ' +
        'Omit to clone the entire repository.'
    ),
});

export const BulkCloneRepoSchema = createBulkQuerySchema(
  STATIC_TOOL_NAMES.GITHUB_CLONE_REPO,
  CloneRepoQuerySchema,
  { maxQueries: 3 }
);

// ─────────────────────────────────────────────────────────────────────
// Tool description (shown in the MCP tool listing)
// ─────────────────────────────────────────────────────────────────────

export const GITHUB_CLONE_REPO_DESCRIPTION = [
  '## Clone or partially fetch a GitHub repository for deep local analysis',
  '',
  'Downloads a repository (or a subdirectory of it) to the local octocode',
  'home directory so that **local filesystem tools** and **LSP semantic tools**',
  'can analyse the code offline.',
  '',
  '### Two modes',
  '',
  '| Mode | When to use | Parameter |',
  '|------|-------------|-----------|',
  '| **Full clone** | General exploration, LSP needs full project context | _(default)_ |',
  '| **Partial fetch** | Large monorepo, only need a specific package/dir | `sparse_path` |',
  '',
  '### How it works',
  '',
  '1. `git clone --depth 1 --single-branch` (shallow, fast)',
  '2. If `sparse_path` is set → `git sparse-checkout set <path>` (only that tree)',
  '3. Result cached for **24 hours** under `~/.octocode/repos/`',
  '4. Returns `localPath` – pass it to local tools for analysis',
  '',
  '### Branch resolution',
  '',
  '- If `branch` is provided, that branch is cloned.',
  '- If `branch` is omitted, the **default branch** is auto-detected via the GitHub API (falls back to `main`).',
  '- The resolved branch name is always included in the result and the cache path.',
  '',
  '### Cache path format',
  '',
  '```',
  '~/.octocode/repos/{owner}/{repo}/{branch}/           ← full clone',
  '~/.octocode/repos/{owner}/{repo}/{branch}__sp_{hash}/ ← sparse checkout',
  '```',
  '',
  '### After cloning, use these tools on `localPath`:',
  '',
  '- `localSearchCode` – ripgrep code search',
  '- `localGetFileContent` – read files',
  '- `localViewStructure` – browse directory tree',
  '- `localFindFiles` – find files by name/metadata',
  '- `lspGotoDefinition` – jump to symbol definitions',
  '- `lspFindReferences` – find all usages of a symbol',
  '- `lspCallHierarchy` – trace call relationships',
].join('\n');
