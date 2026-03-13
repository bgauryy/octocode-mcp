import path from 'path';
import { fileURLToPath } from 'url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createMockMcpServer,
  type MockMcpServer,
} from '../fixtures/mcp-fixtures.js';
import { registerLocalFetchContentTool } from '../../src/tools/local_fetch_content/index.js';
import { registerLocalRipgrepTool } from '../../src/tools/local_ripgrep/index.js';
import { registerLSPCallHierarchyTool } from '../../src/tools/lsp_call_hierarchy/index.js';
import { registerLSPFindReferencesTool } from '../../src/tools/lsp_find_references/index.js';
import { registerLSPGotoDefinitionTool } from '../../src/tools/lsp_goto_definition/lsp_goto_definition.js';

type ToolRegistrar = (server: McpServer) => unknown;

const FLOWS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(FLOWS_DIR, 'fixtures');

export const localResearchFlowTools = {
  whereIsXDefined: [
    registerLocalRipgrepTool,
    registerLSPGotoDefinitionTool,
    registerLocalFetchContentTool,
  ] satisfies ToolRegistrar[],
  impactAnalysis: [
    registerLocalRipgrepTool,
    registerLSPFindReferencesTool,
    registerLSPCallHierarchyTool,
    registerLocalFetchContentTool,
  ] satisfies ToolRegistrar[],
} as const;

export function getFlowFixturePath(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

export function createFlowHarness(
  toolRegistrars: readonly ToolRegistrar[]
): Pick<MockMcpServer, 'callTool' | 'cleanup'> {
  const mockServer = createMockMcpServer();

  for (const registerTool of toolRegistrars) {
    registerTool(mockServer.server);
  }

  return {
    callTool: mockServer.callTool,
    cleanup: mockServer.cleanup,
  };
}
