/**
 * LSP research tool commands
 */

import type { CLIOption } from '../types.js';
import {
  executeGotoDefinition,
  executeFindReferences,
  executeCallHierarchy,
  LSPGotoDefinitionQuerySchema,
  LSPFindReferencesQuerySchema,
  LSPCallHierarchyQuerySchema,
} from 'octocode-mcp/public';
import { createToolCommand } from '../schema-bridge.js';

const prettyOption: CLIOption = {
  name: 'pretty',
  description: 'Human-readable output',
};

const lspDefinitionCommand = createToolCommand({
  name: 'lsp-definition',
  description: 'Go to symbol definition using LSP',
  usage:
    'octocode lsp-definition --uri <path> --symbol-name <name> --line-hint <n>',
  category: 'lsp',
  schema: LSPGotoDefinitionQuerySchema,
  execute: executeGotoDefinition,
  requiredOptions: ['uri', 'symbol-name', 'line-hint'],
  extraOptions: [prettyOption],
});

const lspReferencesCommand = createToolCommand({
  name: 'lsp-references',
  description: 'Find all references to a symbol using LSP',
  usage:
    'octocode lsp-references --uri <path> --symbol-name <name> --line-hint <n>',
  category: 'lsp',
  schema: LSPFindReferencesQuerySchema,
  execute: executeFindReferences,
  requiredOptions: ['uri', 'symbol-name', 'line-hint'],
  extraOptions: [prettyOption],
});

const lspCallHierarchyCommand = createToolCommand({
  name: 'lsp-call-hierarchy',
  description: 'Trace call relationships (incoming/outgoing)',
  usage:
    'octocode lsp-call-hierarchy --uri <path> --symbol-name <name> --line-hint <n> --direction <incoming|outgoing>',
  category: 'lsp',
  schema: LSPCallHierarchyQuerySchema,
  execute: executeCallHierarchy,
  requiredOptions: ['uri', 'symbol-name', 'line-hint', 'direction'],
  extraOptions: [prettyOption],
});

export const lspCommands = [
  lspDefinitionCommand,
  lspReferencesCommand,
  lspCallHierarchyCommand,
];
