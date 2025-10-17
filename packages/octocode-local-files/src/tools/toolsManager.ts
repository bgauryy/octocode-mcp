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
import { viewBinary } from './local_view_binary.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import {
  BulkSearchContentSchema,
  LOCAL_SEARCH_CONTENT_DESCRIPTION,
} from '../scheme/local_search_content.js';
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
import {
  ViewBinaryQuerySchema,
  LOCAL_VIEW_BINARY_DESCRIPTION,
} from '../scheme/local_view_binary.js';
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
      description: LOCAL_SEARCH_CONTENT_DESCRIPTION,
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

  // Register local_find_files tool
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

  // Register local_fetch_content tool
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

  // Register local_view_binary tool (single query, no bulk)
  server.registerTool(
    TOOL_NAMES.LOCAL_VIEW_BINARY,
    {
      description: LOCAL_VIEW_BINARY_DESCRIPTION,
      inputSchema: ViewBinaryQuerySchema.shape,
    },
    async (args): Promise<CallToolResult> => {
      const parsed = ViewBinaryQuerySchema.parse(args);
      const result = await viewBinary(parsed);

      // Format as single result response (not bulk)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: result.status === 'error',
      };
    }
  );
}
