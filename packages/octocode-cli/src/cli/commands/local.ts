/**
 * Local research tool commands
 */

import type { CLICommand, ParsedArgs } from '../types.js';
import {
  executeRipgrepSearch,
  executeFetchContent,
  executeFindFiles,
  executeViewStructure,
} from 'octocode-mcp/public';
import { ensureInitialized } from './init.js';
import { outputResult, outputError } from './output.js';
import { withContext } from './query.js';
import { requireOption } from './index.js';

const localSearchCommand: CLICommand = {
  name: 'local-search',
  description: 'Search local code with ripgrep',
  usage: 'octocode local-search --pattern <pattern> --path <path>',
  options: [
    { name: 'pattern', description: 'Search pattern (regex)', hasValue: true },
    { name: 'path', description: 'Directory or file path', hasValue: true },
    {
      name: 'mode',
      description: 'Mode: discovery|paginated|detailed',
      hasValue: true,
    },
    { name: 'fixed-string', description: 'Treat pattern as literal string' },
    { name: 'smart-case', description: 'Smart case matching' },
    { name: 'case-insensitive', description: 'Case insensitive search' },
    { name: 'case-sensitive', description: 'Case sensitive search' },
    { name: 'whole-word', description: 'Match whole words only' },
    { name: 'invert-match', description: 'Invert match' },
    {
      name: 'type',
      description: 'File type filter (e.g., ts, py)',
      hasValue: true,
    },
    {
      name: 'include',
      description: 'Comma-separated include globs',
      hasValue: true,
    },
    {
      name: 'exclude',
      description: 'Comma-separated exclude globs',
      hasValue: true,
    },
    {
      name: 'exclude-dir',
      description: 'Comma-separated directories to exclude',
      hasValue: true,
    },
    { name: 'no-ignore', description: "Don't respect .gitignore" },
    { name: 'hidden', description: 'Search hidden files' },
    { name: 'files-only', description: 'Return file paths only' },
    { name: 'count', description: 'Return match counts only' },
    {
      name: 'context-lines',
      description: 'Context lines around matches (0-50)',
      hasValue: true,
    },
    {
      name: 'max-files',
      description: 'Maximum files to search (1-1000)',
      hasValue: true,
    },
    {
      name: 'files-per-page',
      description: 'Files per page (1-50)',
      hasValue: true,
      default: '10',
    },
    {
      name: 'file-page',
      description: 'File page number',
      hasValue: true,
      default: '1',
    },
    { name: 'multiline', description: 'Enable multiline matching' },
    {
      name: 'sort',
      description: 'Sort: path|modified|accessed|created',
      hasValue: true,
      default: 'path',
    },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    const pattern = requireOption(args, 'pattern', 'local-search');
    if (!pattern) return;
    const searchPath = requireOption(args, 'path', 'local-search');
    if (!searchPath) return;
    try {
      await ensureInitialized();
      const include = args.options['include'] as string | undefined;
      const exclude = args.options['exclude'] as string | undefined;
      const excludeDir = args.options['exclude-dir'] as string | undefined;
      const contextLines = args.options['context-lines'] as string | undefined;
      const maxFiles = args.options['max-files'] as string | undefined;
      const result = await executeRipgrepSearch({
        queries: [
          withContext({
            pattern,
            path: searchPath,
            mode: args.options['mode'] as string | undefined,
            fixedString: Boolean(args.options['fixed-string']),
            smartCase: Boolean(args.options['smart-case']),
            caseInsensitive: Boolean(args.options['case-insensitive']),
            caseSensitive: Boolean(args.options['case-sensitive']),
            wholeWord: Boolean(args.options['whole-word']),
            invertMatch: Boolean(args.options['invert-match']),
            type: args.options['type'] as string | undefined,
            include: include?.split(',').map(s => s.trim()),
            exclude: exclude?.split(',').map(s => s.trim()),
            excludeDir: excludeDir?.split(',').map(s => s.trim()),
            noIgnore: Boolean(args.options['no-ignore']),
            hidden: Boolean(args.options['hidden']),
            filesOnly: Boolean(args.options['files-only']),
            count: Boolean(args.options['count']),
            contextLines: contextLines ? parseInt(contextLines, 10) : undefined,
            maxFiles: maxFiles ? parseInt(maxFiles, 10) : undefined,
            filesPerPage: parseInt(
              (args.options['files-per-page'] as string) || '10',
              10
            ),
            filePageNumber: parseInt(
              (args.options['file-page'] as string) || '1',
              10
            ),
            multiline: Boolean(args.options['multiline']),
            sort: (args.options['sort'] as string) || 'path',
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

const localFileCommand: CLICommand = {
  name: 'local-file',
  description: 'Read local file content',
  usage: 'octocode local-file --path <path>',
  options: [
    { name: 'path', description: 'File path', hasValue: true },
    { name: 'full-content', description: 'Get full file content' },
    { name: 'start-line', description: 'Start line number', hasValue: true },
    { name: 'end-line', description: 'End line number', hasValue: true },
    {
      name: 'match',
      description: 'Extract lines matching this string',
      hasValue: true,
    },
    {
      name: 'context-lines',
      description: 'Context lines around match (1-50)',
      hasValue: true,
      default: '5',
    },
    { name: 'match-regex', description: 'Treat match string as regex' },
    { name: 'match-case-sensitive', description: 'Case-sensitive match' },
    {
      name: 'char-offset',
      description: 'Character offset for pagination',
      hasValue: true,
    },
    {
      name: 'char-length',
      description: 'Character length for pagination',
      hasValue: true,
    },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    const filePath = requireOption(args, 'path', 'local-file');
    if (!filePath) return;
    try {
      await ensureInitialized();
      const startLine = args.options['start-line'] as string | undefined;
      const endLine = args.options['end-line'] as string | undefined;
      const charOffset = args.options['char-offset'] as string | undefined;
      const charLength = args.options['char-length'] as string | undefined;
      const result = await executeFetchContent({
        queries: [
          withContext({
            path: filePath,
            fullContent: Boolean(args.options['full-content']),
            startLine: startLine ? parseInt(startLine, 10) : undefined,
            endLine: endLine ? parseInt(endLine, 10) : undefined,
            matchString: args.options['match'] as string | undefined,
            matchStringContextLines: parseInt(
              (args.options['context-lines'] as string) || '5',
              10
            ),
            matchStringIsRegex: Boolean(args.options['match-regex']),
            matchStringCaseSensitive: Boolean(
              args.options['match-case-sensitive']
            ),
            charOffset: charOffset ? parseInt(charOffset, 10) : undefined,
            charLength: charLength ? parseInt(charLength, 10) : undefined,
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

const localFindCommand: CLICommand = {
  name: 'local-find',
  description: 'Find local files by name, type, or metadata',
  usage: 'octocode local-find --path <path> [--name <pattern>]',
  options: [
    { name: 'path', description: 'Directory path to search', hasValue: true },
    {
      name: 'name',
      description: 'Filename pattern (exact or glob)',
      hasValue: true,
    },
    {
      name: 'iname',
      description: 'Case-insensitive filename pattern',
      hasValue: true,
    },
    {
      name: 'names',
      description: 'Comma-separated filename patterns',
      hasValue: true,
    },
    {
      name: 'regex',
      description: 'Regex pattern for filename',
      hasValue: true,
    },
    {
      name: 'type',
      description: 'File type: f|d|l (file|dir|link)',
      hasValue: true,
    },
    { name: 'empty', description: 'Find empty files/dirs' },
    {
      name: 'max-depth',
      description: 'Max directory depth (1-10)',
      hasValue: true,
    },
    {
      name: 'min-depth',
      description: 'Min directory depth (0-10)',
      hasValue: true,
    },
    {
      name: 'modified-within',
      description: 'Modified within (e.g., 1h, 7d)',
      hasValue: true,
    },
    { name: 'modified-before', description: 'Modified before', hasValue: true },
    {
      name: 'size-greater',
      description: 'Larger than (e.g., 1k, 1M)',
      hasValue: true,
    },
    { name: 'size-less', description: 'Smaller than', hasValue: true },
    {
      name: 'exclude-dir',
      description: 'Comma-separated directories to exclude',
      hasValue: true,
    },
    {
      name: 'sort-by',
      description: 'Sort: modified|size|name|path',
      hasValue: true,
      default: 'modified',
    },
    { name: 'limit', description: 'Max results', hasValue: true },
    { name: 'details', description: 'Show file details' },
    {
      name: 'files-per-page',
      description: 'Files per page (1-50)',
      hasValue: true,
      default: '20',
    },
    {
      name: 'file-page',
      description: 'Page number',
      hasValue: true,
      default: '1',
    },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    const searchPath = requireOption(args, 'path', 'local-find');
    if (!searchPath) return;
    try {
      await ensureInitialized();
      const names = args.options['names'] as string | undefined;
      const maxDepth = args.options['max-depth'] as string | undefined;
      const minDepth = args.options['min-depth'] as string | undefined;
      const excludeDir = args.options['exclude-dir'] as string | undefined;
      const limit = args.options['limit'] as string | undefined;
      const result = await executeFindFiles({
        queries: [
          withContext({
            path: searchPath,
            name: args.options['name'] as string | undefined,
            iname: args.options['iname'] as string | undefined,
            names: names?.split(',').map(s => s.trim()),
            regex: args.options['regex'] as string | undefined,
            type: args.options['type'] as string | undefined,
            empty: Boolean(args.options['empty']),
            maxDepth: maxDepth ? parseInt(maxDepth, 10) : undefined,
            minDepth: minDepth ? parseInt(minDepth, 10) : undefined,
            modifiedWithin: args.options['modified-within'] as
              | string
              | undefined,
            modifiedBefore: args.options['modified-before'] as
              | string
              | undefined,
            sizeGreater: args.options['size-greater'] as string | undefined,
            sizeLess: args.options['size-less'] as string | undefined,
            excludeDir: excludeDir?.split(',').map(s => s.trim()),
            sortBy: (args.options['sort-by'] as string) || 'modified',
            limit: limit ? parseInt(limit, 10) : undefined,
            details:
              args.options['details'] !== undefined
                ? Boolean(args.options['details'])
                : true,
            filesPerPage: parseInt(
              (args.options['files-per-page'] as string) || '20',
              10
            ),
            filePageNumber: parseInt(
              (args.options['file-page'] as string) || '1',
              10
            ),
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

const localTreeCommand: CLICommand = {
  name: 'local-tree',
  description: 'View local directory structure',
  usage: 'octocode local-tree --path <path> [--depth <n>]',
  options: [
    { name: 'path', description: 'Directory path', hasValue: true },
    { name: 'details', description: 'Show file details' },
    { name: 'hidden', description: 'Show hidden files' },
    {
      name: 'sort-by',
      description: 'Sort: name|size|time|extension',
      hasValue: true,
      default: 'time',
    },
    { name: 'reverse', description: 'Reverse sort order' },
    {
      name: 'entries-per-page',
      description: 'Entries per page (1-50)',
      hasValue: true,
      default: '20',
    },
    { name: 'page', description: 'Page number', hasValue: true, default: '1' },
    { name: 'pattern', description: 'Glob pattern filter', hasValue: true },
    { name: 'dirs-only', description: 'Show directories only' },
    { name: 'files-only', description: 'Show files only' },
    { name: 'extension', description: 'Filter by extension', hasValue: true },
    {
      name: 'extensions',
      description: 'Comma-separated extensions',
      hasValue: true,
    },
    { name: 'depth', description: 'Directory depth (1-5)', hasValue: true },
    { name: 'recursive', description: 'Recursive listing' },
    { name: 'limit', description: 'Max entries', hasValue: true },
    { name: 'summary', description: 'Show summary' },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    const treePath = requireOption(args, 'path', 'local-tree');
    if (!treePath) return;
    try {
      await ensureInitialized();
      const extensions = args.options['extensions'] as string | undefined;
      const depth = args.options['depth'] as string | undefined;
      const limit = args.options['limit'] as string | undefined;
      const result = await executeViewStructure({
        queries: [
          withContext({
            path: treePath,
            details: Boolean(args.options['details']),
            hidden: Boolean(args.options['hidden']),
            sortBy: (args.options['sort-by'] as string) || 'time',
            reverse: Boolean(args.options['reverse']),
            entriesPerPage: parseInt(
              (args.options['entries-per-page'] as string) || '20',
              10
            ),
            entryPageNumber: parseInt(
              (args.options['page'] as string) || '1',
              10
            ),
            pattern: args.options['pattern'] as string | undefined,
            directoriesOnly: Boolean(args.options['dirs-only']),
            filesOnly: Boolean(args.options['files-only']),
            extension: args.options['extension'] as string | undefined,
            extensions: extensions?.split(',').map(s => s.trim()),
            depth: depth ? parseInt(depth, 10) : undefined,
            recursive: Boolean(args.options['recursive']),
            limit: limit ? parseInt(limit, 10) : undefined,
            summary:
              args.options['summary'] !== undefined
                ? Boolean(args.options['summary'])
                : true,
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

export const localCommands: CLICommand[] = [
  localSearchCommand,
  localFileCommand,
  localFindCommand,
  localTreeCommand,
];
