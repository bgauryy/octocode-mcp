/**
 * Tool registration and management
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_NAMES } from '../constants.js';
import { searchContentRipgrep } from './local_ripgrep.js';
import { viewStructure } from './local_view_structure.js';
import { findFiles } from './local_find_files.js';
import { fetchContent } from './local_fetch_content.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import {
  BulkRipgrepQuerySchema,
  LOCAL_RIPGREP_DESCRIPTION,
  type RipgrepQuery,
} from '../scheme/local_ripgrep.js';
import {
  BulkViewStructureSchema,
  LOCAL_VIEW_STRUCTURE_DESCRIPTION,
} from '../scheme/local_view_structure.js';
import {
  BulkFindFilesSchema,
  LOCAL_FIND_FILES_DESCRIPTION,
} from '../scheme/local_find_files.js';
import {
  BulkFetchContentSchema,
  LOCAL_FETCH_CONTENT_DESCRIPTION,
} from '../scheme/local_fetch_content.js';
import type {
  ViewStructureQuery,
  ViewStructureResult,
  FindFilesQuery,
  FindFilesResult,
  FetchContentQuery,
  FetchContentResult,
  SearchContentResult,
} from '../types.js';
import { registerLocalResearchPrompt } from '../prompts/local_explorer.js';

/**
 * Registers all tools with the MCP server
 */
export function registerTools(server: McpServer): void {
  server.registerTool(
    TOOL_NAMES.LOCAL_RIPGREP,
    {
      description: LOCAL_RIPGREP_DESCRIPTION,
      inputSchema: BulkRipgrepQuerySchema.shape,
    },
    async (args): Promise<CallToolResult> => {
      const parsed = BulkRipgrepQuerySchema.parse(args);
      return executeBulkOperation<RipgrepQuery, SearchContentResult>(
        parsed.queries,
        searchContentRipgrep,
        { toolName: TOOL_NAMES.LOCAL_RIPGREP }
      );
    }
  );

  server.registerTool(
    TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
    {
      description: LOCAL_VIEW_STRUCTURE_DESCRIPTION,
      inputSchema: BulkViewStructureSchema.shape,
    },
    async (args): Promise<CallToolResult> => {
      const parsed = BulkViewStructureSchema.parse(args);
      return executeBulkOperation<ViewStructureQuery, ViewStructureResult>(
        parsed.queries,
        viewStructure,
        { toolName: TOOL_NAMES.LOCAL_VIEW_STRUCTURE }
      );
    }
  );

  server.registerTool(
    TOOL_NAMES.LOCAL_FIND_FILES,
    {
      description: LOCAL_FIND_FILES_DESCRIPTION,
      inputSchema: BulkFindFilesSchema.shape,
    },
    async (args): Promise<CallToolResult> => {
      const parsed = BulkFindFilesSchema.parse(args);
      return executeBulkOperation<FindFilesQuery, FindFilesResult>(
        parsed.queries,
        findFiles,
        { toolName: TOOL_NAMES.LOCAL_FIND_FILES }
      );
    }
  );

  server.registerTool(
    TOOL_NAMES.LOCAL_FETCH_CONTENT,
    {
      description: LOCAL_FETCH_CONTENT_DESCRIPTION,
      inputSchema: BulkFetchContentSchema.shape,
    },
    async (args): Promise<CallToolResult> => {
      const parsed = BulkFetchContentSchema.parse(args);
      return executeBulkOperation<FetchContentQuery, FetchContentResult>(
        parsed.queries,
        fetchContent,
        { toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT }
      );
    }
  );
}

/**
 * Registers all prompts with the MCP server
 */
export function registerPrompts(server: McpServer): void {
  registerLocalResearchPrompt(server);
}
