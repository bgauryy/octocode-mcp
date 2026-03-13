/**
 * Local research tool commands
 */

import type { CLIOption } from '../types.js';
import {
  executeRipgrepSearch,
  executeFetchContent,
  executeFindFiles,
  executeViewStructure,
  RipgrepQuerySchema,
  FetchContentQuerySchema,
  FindFilesQuerySchema,
  ViewStructureQuerySchema,
} from 'octocode-mcp/public';
import { createToolCommand } from '../schema-bridge.js';

const prettyOption: CLIOption = {
  name: 'pretty',
  description: 'Human-readable output',
};

const localSearchCommand = createToolCommand({
  name: 'local-search',
  description: 'Search local code with ripgrep',
  usage: 'octocode local-search --pattern <pattern> --path <path>',
  category: 'local',
  schema: RipgrepQuerySchema,
  execute: executeRipgrepSearch,
  requiredOptions: ['pattern', 'path'],
  extraOptions: [prettyOption],
});

const localFileCommand = createToolCommand({
  name: 'local-file',
  description: 'Read local file content',
  usage: 'octocode local-file --path <path>',
  category: 'local',
  schema: FetchContentQuerySchema,
  execute: executeFetchContent,
  requiredOptions: ['path'],
  extraOptions: [prettyOption],
});

const localFindCommand = createToolCommand({
  name: 'local-find',
  description: 'Find local files by name, type, or metadata',
  usage: 'octocode local-find --path <path> [--name <pattern>]',
  category: 'local',
  schema: FindFilesQuerySchema,
  execute: executeFindFiles,
  requiredOptions: ['path'],
  extraOptions: [prettyOption],
});

const localTreeCommand = createToolCommand({
  name: 'local-tree',
  description: 'View local directory structure',
  usage: 'octocode local-tree --path <path> [--depth <n>]',
  category: 'local',
  schema: ViewStructureQuerySchema,
  execute: executeViewStructure,
  requiredOptions: ['path'],
  extraOptions: [prettyOption],
});

export const localCommands = [
  localSearchCommand,
  localFileCommand,
  localFindCommand,
  localTreeCommand,
];
