#!/usr/bin/env node

/**
 * CLI Script for Repository Analysis
 *
 * Usage:
 *   node scripts/analyze.js --repoPath=/path/to/repo --outPath=/path/to/output
 *   node scripts/analyze.js -r /path/to/repo -o /path/to/output
 *
 * Options:
 *   --repoPath, -r    Path to the repository to analyze (required)
 *   --outPath, -o     Path to output the results (optional, defaults to repo/scripts)
 *   --includeTests    Include test files in analysis (default: false)
 *   --json            Output only JSON (no markdown files)
 *   --quiet, -q       Suppress console output
 *   --help, -h        Show this help message
 */

import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

// Parse command line arguments
const { values, positionals } = parseArgs({
  options: {
    repoPath: { type: 'string', short: 'r' },
    outPath: { type: 'string', short: 'o' },
    includeTests: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    quiet: { type: 'boolean', short: 'q', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
  strict: false,
});

// Show help
if (values.help) {
  console.log(`
Repository Documentation Generator

Usage:
  node scripts/analyze.js --repoPath=/path/to/repo [--outPath=/path/to/output]

Options:
  --repoPath, -r    Path to the repository to analyze (required)
  --outPath, -o     Path to output the results (optional, defaults to <repo>/scripts)
  --includeTests    Include test files in analysis (default: false)
  --json            Output only JSON (skip markdown generation)
  --quiet, -q       Suppress console output
  --help, -h        Show this help message

Examples:
  # Analyze a repository and output to default location
  node scripts/analyze.js --repoPath=../my-project

  # Analyze with custom output path
  node scripts/analyze.js -r ../my-project -o ./analysis-output

  # Analyze including tests, JSON only
  node scripts/analyze.js -r ../my-project --includeTests --json
`);
  process.exit(0);
}

// Get repo path from args
const repoPath = values.repoPath || positionals[0];

if (!repoPath) {
  console.error('Error: --repoPath is required');
  console.error('Usage: node scripts/analyze.js --repoPath=/path/to/repo');
  process.exit(1);
}

// Resolve paths
const resolvedRepoPath = resolve(repoPath);
const resolvedOutPath = values.outPath
  ? resolve(values.outPath)
  : join(resolvedRepoPath, 'scripts');

// Validate repo path
if (!existsSync(resolvedRepoPath)) {
  console.error(`Error: Repository path does not exist: ${resolvedRepoPath}`);
  process.exit(1);
}

if (!existsSync(join(resolvedRepoPath, 'package.json'))) {
  console.error(`Error: No package.json found at ${resolvedRepoPath}`);
  process.exit(1);
}

// Import and run the analyzer
async function main() {
  try {
    // Dynamic import of the compiled module
    const { analyzeRepository } = await import('../dist/src/index.js');

    if (!values.quiet) {
      console.log('🔍 Starting repository analysis...');
      console.log(`   Repository: ${resolvedRepoPath}`);
      console.log(`   Output: ${resolvedOutPath}`);
      console.log('');
    }

    const analysis = await analyzeRepository(resolvedRepoPath, resolvedOutPath, {
      includeTests: values.includeTests,
    });

    if (values.json) {
      // Output only JSON to stdout
      console.log(JSON.stringify(analysis, null, 2));
    } else if (!values.quiet) {
      console.log('\n📊 Analysis Summary:');
      console.log(`   Package: ${analysis.package.name}@${analysis.package.version}`);
      console.log(`   Files analyzed: ${analysis.moduleGraph.totalFiles}`);
      console.log(`   Total exports: ${analysis.moduleGraph.totalExports}`);
      console.log(`   Unused exports: ${analysis.insights.unusedExports.length}`);
      console.log(`   Unused dependencies: ${analysis.dependencies.unused.length}`);
      console.log(`   Circular dependencies: ${analysis.insights.circularDependencies.length}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    if (!values.quiet) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
