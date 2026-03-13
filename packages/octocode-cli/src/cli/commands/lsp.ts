/**
 * LSP research tool commands
 */

import type { CLICommand, ParsedArgs } from '../types.js';
import {
  executeGotoDefinition,
  executeFindReferences,
  executeCallHierarchy,
} from 'octocode-mcp/public';
import { ensureInitialized } from './init.js';
import { outputResult, outputError } from './output.js';
import { withContext } from './query.js';
import { requireOption } from './index.js';

const lspDefinitionCommand: CLICommand = {
  name: 'lsp-definition',
  description: 'Go to symbol definition using LSP',
  usage: 'octocode lsp-definition --uri <path> --symbol <name> --line-hint <n>',
  options: [
    { name: 'uri', description: 'File path', hasValue: true },
    { name: 'symbol', description: 'Symbol name', hasValue: true },
    {
      name: 'line-hint',
      description: 'Line number hint (1-indexed)',
      hasValue: true,
    },
    {
      name: 'order-hint',
      description: 'Order hint for same-line symbols',
      hasValue: true,
      default: '0',
    },
    {
      name: 'context-lines',
      description: 'Context lines (0-20)',
      hasValue: true,
      default: '5',
    },
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
    const uri = requireOption(args, 'uri', 'lsp-definition');
    if (!uri) return;
    const symbol = requireOption(args, 'symbol', 'lsp-definition');
    if (!symbol) return;
    const lineHint = requireOption(args, 'line-hint', 'lsp-definition');
    if (!lineHint) return;
    try {
      await ensureInitialized();
      const charOffset = args.options['char-offset'] as string | undefined;
      const charLength = args.options['char-length'] as string | undefined;
      const result = await executeGotoDefinition({
        queries: [
          withContext({
            uri,
            symbolName: symbol,
            lineHint: parseInt(lineHint, 10),
            orderHint: parseInt(
              (args.options['order-hint'] as string) || '0',
              10
            ),
            contextLines: parseInt(
              (args.options['context-lines'] as string) || '5',
              10
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

const lspReferencesCommand: CLICommand = {
  name: 'lsp-references',
  description: 'Find all references to a symbol using LSP',
  usage: 'octocode lsp-references --uri <path> --symbol <name> --line-hint <n>',
  options: [
    { name: 'uri', description: 'File path', hasValue: true },
    { name: 'symbol', description: 'Symbol name', hasValue: true },
    {
      name: 'line-hint',
      description: 'Line number hint (1-indexed)',
      hasValue: true,
    },
    {
      name: 'order-hint',
      description: 'Order hint for same-line symbols',
      hasValue: true,
      default: '0',
    },
    { name: 'include-declaration', description: 'Include declaration' },
    { name: 'no-include-declaration', description: 'Exclude declaration' },
    {
      name: 'context-lines',
      description: 'Context lines (0-10)',
      hasValue: true,
      default: '2',
    },
    {
      name: 'refs-per-page',
      description: 'References per page (1-50)',
      hasValue: true,
      default: '20',
    },
    { name: 'page', description: 'Page number', hasValue: true, default: '1' },
    {
      name: 'include-pattern',
      description: 'Comma-separated include glob patterns',
      hasValue: true,
    },
    {
      name: 'exclude-pattern',
      description: 'Comma-separated exclude glob patterns',
      hasValue: true,
    },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    const uri = requireOption(args, 'uri', 'lsp-references');
    if (!uri) return;
    const symbol = requireOption(args, 'symbol', 'lsp-references');
    if (!symbol) return;
    const lineHint = requireOption(args, 'line-hint', 'lsp-references');
    if (!lineHint) return;
    try {
      await ensureInitialized();
      const includePattern = args.options['include-pattern'] as
        | string
        | undefined;
      const excludePattern = args.options['exclude-pattern'] as
        | string
        | undefined;
      // Default includeDeclaration to true unless --no-include-declaration is set
      const includeDeclaration = !args.options['no-include-declaration'];
      const result = await executeFindReferences({
        queries: [
          withContext({
            uri,
            symbolName: symbol,
            lineHint: parseInt(lineHint, 10),
            orderHint: parseInt(
              (args.options['order-hint'] as string) || '0',
              10
            ),
            includeDeclaration,
            contextLines: parseInt(
              (args.options['context-lines'] as string) || '2',
              10
            ),
            referencesPerPage: parseInt(
              (args.options['refs-per-page'] as string) || '20',
              10
            ),
            page: parseInt((args.options['page'] as string) || '1', 10),
            includePattern: includePattern?.split(',').map(s => s.trim()),
            excludePattern: excludePattern?.split(',').map(s => s.trim()),
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

const lspCallHierarchyCommand: CLICommand = {
  name: 'lsp-call-hierarchy',
  description: 'Trace call relationships (incoming/outgoing)',
  usage:
    'octocode lsp-call-hierarchy --uri <path> --symbol <name> --line-hint <n> --direction <incoming|outgoing>',
  options: [
    { name: 'uri', description: 'File path', hasValue: true },
    { name: 'symbol', description: 'Symbol name', hasValue: true },
    {
      name: 'line-hint',
      description: 'Line number hint (1-indexed)',
      hasValue: true,
    },
    {
      name: 'direction',
      description: 'Direction: incoming|outgoing',
      hasValue: true,
    },
    {
      name: 'order-hint',
      description: 'Order hint for same-line symbols',
      hasValue: true,
      default: '0',
    },
    {
      name: 'depth',
      description: 'Call depth (1-3)',
      hasValue: true,
      default: '1',
    },
    {
      name: 'context-lines',
      description: 'Context lines (0-10)',
      hasValue: true,
      default: '2',
    },
    {
      name: 'calls-per-page',
      description: 'Calls per page (1-30)',
      hasValue: true,
      default: '15',
    },
    { name: 'page', description: 'Page number', hasValue: true, default: '1' },
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
    const uri = requireOption(args, 'uri', 'lsp-call-hierarchy');
    if (!uri) return;
    const symbol = requireOption(args, 'symbol', 'lsp-call-hierarchy');
    if (!symbol) return;
    const lineHint = requireOption(args, 'line-hint', 'lsp-call-hierarchy');
    if (!lineHint) return;
    const direction = requireOption(args, 'direction', 'lsp-call-hierarchy');
    if (!direction) return;
    try {
      await ensureInitialized();
      const charOffset = args.options['char-offset'] as string | undefined;
      const charLength = args.options['char-length'] as string | undefined;
      const result = await executeCallHierarchy({
        queries: [
          withContext({
            uri,
            symbolName: symbol,
            lineHint: parseInt(lineHint, 10),
            direction,
            orderHint: parseInt(
              (args.options['order-hint'] as string) || '0',
              10
            ),
            depth: parseInt((args.options['depth'] as string) || '1', 10),
            contextLines: parseInt(
              (args.options['context-lines'] as string) || '2',
              10
            ),
            callsPerPage: parseInt(
              (args.options['calls-per-page'] as string) || '15',
              10
            ),
            page: parseInt((args.options['page'] as string) || '1', 10),
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

export const lspCommands: CLICommand[] = [
  lspDefinitionCommand,
  lspReferencesCommand,
  lspCallHierarchyCommand,
];
