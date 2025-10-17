/**
 * Tool registration and management
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_NAMES } from '../constants.js';
import { searchContent } from './local_search_content.js';
import { viewStructure } from './local_view_structure.js';
import { findFiles } from './local_find_files.js';
import { fetchContent } from './local_fetch_content.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { BulkSearchContentSchema } from '../scheme/local_search_content.js';
import { BulkViewStructureSchema } from '../scheme/local_view_structure.js';
import { BulkFindFilesSchema } from '../scheme/local_find_files.js';
import { BulkFetchContentSchema } from '../scheme/local_fetch_content.js';
import { TOOL_DESCRIPTIONS } from '../scheme/toolsDescriptions.js';
import type {
  SearchContentQuery,
  SearchContentResult,
  ViewStructureQuery,
  ViewStructureResult,
  FindFilesQuery,
  FindFilesResult,
  FetchContentQuery,
  FetchContentResult,
} from '../types.js';

/**
 * Registers all tools with the MCP server
 */
export function registerTools(server: McpServer): void {
  // Register local_search_content tool
  server.registerTool(
    TOOL_NAMES.LOCAL_SEARCH_CONTENT,
    {
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.LOCAL_SEARCH_CONTENT],
      inputSchema: BulkSearchContentSchema.shape,
    },
    async (args): Promise<CallToolResult> => {
      const parsed = BulkSearchContentSchema.parse(args);
      return executeBulkOperation<SearchContentQuery, SearchContentResult>(
        parsed.queries,
        searchContent,
        { toolName: TOOL_NAMES.LOCAL_SEARCH_CONTENT }
      );
    }
  );

  // Register local_view_structure tool
  server.registerTool(
    TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
    {
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.LOCAL_VIEW_STRUCTURE],
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

  // Register local_find_files tool
  server.registerTool(
    TOOL_NAMES.LOCAL_FIND_FILES,
    {
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.LOCAL_FIND_FILES],
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

  // Register local_fetch_content tool
  server.registerTool(
    TOOL_NAMES.LOCAL_FETCH_CONTENT,
    {
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.LOCAL_FETCH_CONTENT],
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
