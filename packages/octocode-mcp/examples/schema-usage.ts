/**
 * Example: Using Octocode MCP Schemas & Metadata
 *
 * This script demonstrates how to import Zod schemas from the octocode-mcp
 * public API and convert them to JSON Schema format for MCP clients.
 *
 * Run with: npx tsx examples/schema-usage.ts
 * Output is written to: examples/output/schema-validation-output.txt
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output file path
const OUTPUT_FILE = path.join(__dirname, 'output', 'schema-validation-output.txt');

// Capture console output
let outputBuffer: string[] = [];
const originalLog = console.log;
const captureLog = (...args: unknown[]) => {
  const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)).join(' ');
  outputBuffer.push(message);
  originalLog(...args);
};
console.log = captureLog;

// Import schemas from octocode-mcp public API
import {
  // GitHub Schemas
  GitHubCodeSearchQuerySchema,
  GitHubCodeSearchBulkQuerySchema,
  GitHubViewRepoStructureQuerySchema,
  GitHubViewRepoStructureBulkQuerySchema,
  GitHubReposSearchSingleQuerySchema,
  GitHubReposSearchQuerySchema,
  GitHubPullRequestSearchQuerySchema,
  GitHubPullRequestSearchBulkQuerySchema,
  FileContentQuerySchema,
  FileContentBulkQuerySchema,
  // Local Schemas
  RipgrepQuerySchema,
  BulkRipgrepQuerySchema,
  FetchContentQuerySchema,
  BulkFetchContentSchema,
  FindFilesQuerySchema,
  BulkFindFilesSchema,
  ViewStructureQuerySchema,
  BulkViewStructureSchema,
  // LSP Schemas
  LSPGotoDefinitionQuerySchema,
  BulkLSPGotoDefinitionSchema,
  LSPFindReferencesQuerySchema,
  BulkLSPFindReferencesSchema,
  LSPCallHierarchyQuerySchema,
  BulkLSPCallHierarchySchema,
  // Package Search Schemas
  NpmPackageQuerySchema,
  PythonPackageQuerySchema,
  PackageSearchBulkQuerySchema,
} from '../src/public.js';

console.log('='.repeat(80));
console.log('OCTOCODE MCP TOOL SCHEMAS - JSON SCHEMA OUTPUT');
console.log('='.repeat(80));

// ============================================================================
// GitHub Tool Schemas
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('GITHUB TOOL SCHEMAS');
console.log('='.repeat(80));

console.log('\n📋 GitHubCodeSearchQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(GitHubCodeSearchQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 GitHubCodeSearchBulkQuerySchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(GitHubCodeSearchBulkQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 GitHubViewRepoStructureQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(GitHubViewRepoStructureQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 GitHubViewRepoStructureBulkQuerySchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(GitHubViewRepoStructureBulkQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 GitHubReposSearchSingleQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(GitHubReposSearchSingleQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 GitHubReposSearchQuerySchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(GitHubReposSearchQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 GitHubPullRequestSearchQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(GitHubPullRequestSearchQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 GitHubPullRequestSearchBulkQuerySchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(GitHubPullRequestSearchBulkQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 FileContentQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(FileContentQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 FileContentBulkQuerySchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(FileContentBulkQuerySchema, { $refStrategy: 'none' }), null, 2));

// ============================================================================
// Local Tool Schemas
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('LOCAL TOOL SCHEMAS');
console.log('='.repeat(80));

console.log('\n📋 RipgrepQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(RipgrepQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 BulkRipgrepQuerySchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(BulkRipgrepQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 FetchContentQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(FetchContentQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 BulkFetchContentSchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(BulkFetchContentSchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 FindFilesQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(FindFilesQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 BulkFindFilesSchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(BulkFindFilesSchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 ViewStructureQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(ViewStructureQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 BulkViewStructureSchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(BulkViewStructureSchema, { $refStrategy: 'none' }), null, 2));

// ============================================================================
// LSP Tool Schemas
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('LSP TOOL SCHEMAS');
console.log('='.repeat(80));

console.log('\n📋 LSPGotoDefinitionQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(LSPGotoDefinitionQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 BulkLSPGotoDefinitionSchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(BulkLSPGotoDefinitionSchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 LSPFindReferencesQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(LSPFindReferencesQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 BulkLSPFindReferencesSchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(BulkLSPFindReferencesSchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 LSPCallHierarchyQuerySchema (Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(LSPCallHierarchyQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 BulkLSPCallHierarchySchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(BulkLSPCallHierarchySchema, { $refStrategy: 'none' }), null, 2));

// ============================================================================
// Package Search Schemas
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('PACKAGE SEARCH SCHEMAS');
console.log('='.repeat(80));

console.log('\n📋 NpmPackageQuerySchema (NPM Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(NpmPackageQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 PythonPackageQuerySchema (Python Single Query):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(PythonPackageQuerySchema, { $refStrategy: 'none' }), null, 2));

console.log('\n📋 PackageSearchBulkQuerySchema (Bulk - MCP Format):');
console.log('─'.repeat(40));
console.log(JSON.stringify(zodToJsonSchema(PackageSearchBulkQuerySchema, { $refStrategy: 'none' }), null, 2));

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

console.log('\nSchemas Output:');
console.log('  📦 GitHub Tools: 5 single + 5 bulk = 10 schemas');
console.log('  📦 Local Tools: 4 single + 4 bulk = 8 schemas');
console.log('  📦 LSP Tools: 3 single + 3 bulk = 6 schemas');
console.log('  📦 Package Search: 2 single + 1 bulk = 3 schemas');
console.log('\n  Total: 27 schemas');

// ============================================================================
// Write Output to File
// ============================================================================

// Restore original console.log
console.log = originalLog;

// Write captured output to file
const outputContent = outputBuffer.join('\n');
try {
  fs.writeFileSync(OUTPUT_FILE, outputContent, 'utf-8');
  console.log(`\n✅ Output written to: ${OUTPUT_FILE}`);
  console.log(`   File size: ${outputContent.length} bytes`);
  console.log(`   Lines: ${outputBuffer.length}`);
} catch (error) {
  console.error(`\n❌ Failed to write output file:`, error instanceof Error ? error.message : String(error));
}

console.log('\n🎉 Schema output complete!');
