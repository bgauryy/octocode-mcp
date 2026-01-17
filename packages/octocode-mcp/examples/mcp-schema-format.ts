/**
 * Example: MCP Protocol Schema Format
 *
 * Demonstrates how Octocode MCP schemas convert to JSON Schema
 * using the EXACT same function as the official MCP SDK.
 *
 * Run with: npx tsx examples/mcp-schema-format.ts
 */

// Use the EXACT same function MCP SDK uses internally
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';

import {
  // Tool metadata
  getMetadata,
  initializeToolMetadata,
  TOOL_NAMES,
  // Bulk schemas (what MCP tools actually use)
  BulkRipgrepQuerySchema,
  BulkFetchContentSchema,
  BulkLSPCallHierarchySchema,
  GitHubCodeSearchBulkQuerySchema,
  GitHubViewRepoStructureBulkQuerySchema,
  PackageSearchBulkQuerySchema,
} from '../src/public.js';

console.log('=' .repeat(70));
console.log('MCP PROTOCOL SCHEMA FORMAT');
console.log('How Octocode schemas appear to AI clients via MCP protocol');
console.log('=' .repeat(70));

console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│  MCP SDK Schema Conversion - Using toJsonSchemaCompat               │
├─────────────────────────────────────────────────────────────────────┤
│  This example uses the EXACT function from MCP SDK:                 │
│                                                                     │
│    import { toJsonSchemaCompat } from                               │
│      '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';  │
│                                                                     │
│  This is what MCP SDK uses internally when you call:                │
│    server.registerTool('name', { inputSchema: zodSchema }, handler) │
│                                                                     │
│  The function wraps zodToJsonSchema with:                           │
│    { strictUnions: true, pipeStrategy: 'input' }                    │
└─────────────────────────────────────────────────────────────────────┘
`);

// Helper to convert and display schema using MCP SDK's exact function
function showMCPSchema(name: string, schema: unknown) {
  console.log('\n' + '─'.repeat(70));
  console.log(`📋 ${name}`);
  console.log('─'.repeat(70));
  
  // Using toJsonSchemaCompat - the EXACT function MCP SDK uses internally
  const jsonSchema = toJsonSchemaCompat(schema as Parameters<typeof toJsonSchemaCompat>[0]);
  console.log(JSON.stringify(jsonSchema, null, 2));
}

// ============================================================================
// LOCAL TOOLS
// ============================================================================

console.log('\n' + '═'.repeat(70));
console.log('LOCAL TOOLS (localSearchCode, localGetFileContent, etc.)');
console.log('═'.repeat(70));

showMCPSchema('localSearchCode (BulkRipgrepQuerySchema)', BulkRipgrepQuerySchema);
showMCPSchema('localGetFileContent (BulkFetchContentSchema)', BulkFetchContentSchema);

// ============================================================================
// LSP TOOLS
// ============================================================================

console.log('\n' + '═'.repeat(70));
console.log('LSP TOOLS (lspCallHierarchy, lspFindReferences, etc.)');
console.log('═'.repeat(70));

showMCPSchema('lspCallHierarchy (BulkLSPCallHierarchySchema)', BulkLSPCallHierarchySchema);

// ============================================================================
// GITHUB TOOLS
// ============================================================================

console.log('\n' + '═'.repeat(70));
console.log('GITHUB TOOLS (githubSearchCode, githubViewRepoStructure, etc.)');
console.log('═'.repeat(70));

showMCPSchema('githubSearchCode (GitHubCodeSearchBulkQuerySchema)', GitHubCodeSearchBulkQuerySchema);
showMCPSchema('githubViewRepoStructure (GitHubViewRepoStructureBulkQuerySchema)', GitHubViewRepoStructureBulkQuerySchema);

// ============================================================================
// PACKAGE SEARCH
// ============================================================================

console.log('\n' + '═'.repeat(70));
console.log('PACKAGE SEARCH');
console.log('═'.repeat(70));

showMCPSchema('packageSearch (PackageSearchBulkQuerySchema)', PackageSearchBulkQuerySchema);

// ============================================================================
// METADATA FROM API
// ============================================================================

console.log('\n' + '═'.repeat(70));
console.log('METADATA FROM API (getMetadata)');
console.log('═'.repeat(70));

try {
  const metadata = await getMetadata();
  
  console.log('\n📋 Tool Names from API:');
  console.log(JSON.stringify(metadata.toolNames, null, 2));
  
  console.log('\n📋 Base Schema Fields:');
  console.log(JSON.stringify(metadata.baseSchema, null, 2));
  
  console.log('\n📋 Available Tools:');
  Object.keys(metadata.tools).forEach(tool => {
    console.log(`  - ${tool}`);
  });
  
  console.log('\n📋 Sample Tool Schema (githubSearchCode):');
  const sampleTool = metadata.tools['githubSearchCode'];
  if (sampleTool) {
    console.log(JSON.stringify(sampleTool.schema, null, 2));
  }
} catch (e) {
  console.log('Error fetching metadata:', e instanceof Error ? e.message : String(e));
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '═'.repeat(70));
console.log('SUMMARY');
console.log('═'.repeat(70));

console.log(`
✅ All Octocode schemas are compatible with MCP protocol

Key points:
1. Schemas are defined using Zod (same as MCP SDK)
2. This example uses toJsonSchemaCompat from @modelcontextprotocol/sdk
3. This is the EXACT same function MCP SDK uses internally
4. Bulk queries: { queries: Array<SingleQuery> } with min 1, max 3-5 items

Tool Categories:
  📍 Local Tools: localSearchCode, localViewStructure, localFindFiles, localGetFileContent
  🔤 LSP Tools: lspGotoDefinition, lspFindReferences, lspCallHierarchy
  🐙 GitHub Tools: githubSearchCode, githubViewRepoStructure, githubGetFileContent, 
                   githubSearchRepositories, githubSearchPullRequests
  📦 Package: packageSearch

References:
  - MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk
  - toJsonSchemaCompat: @modelcontextprotocol/sdk/server/zod-json-schema-compat.js
  - Zod: https://zod.dev
`);

console.log('\n🎉 Done!');
