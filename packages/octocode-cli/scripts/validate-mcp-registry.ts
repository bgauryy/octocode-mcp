#!/usr/bin/env npx tsx
/**
 * MCP Registry Validation Script
 *
 * Validates all MCP entries in the registry by checking:
 * - GitHub repositories exist and are accessible
 * - npm packages exist (for npx installations)
 * - pip packages exist (for pip/uvx installations)
 * - Repositories are not archived/disabled
 * - Repositories are not stale (no updates in 1+ year) - flagged for removal
 *
 * Usage:
 *   npx tsx scripts/validate-mcp-registry.ts
 *   yarn validate:mcp
 *   yarn validate:mcp --json
 *   yarn validate:mcp --check-packages
 */

import {
  MCP_REGISTRY,
  type MCPRegistryEntry,
} from '../src/configs/mcp-registry.js';

interface ValidationResult {
  id: string;
  name: string;
  repository: string;
  status: 'valid' | 'invalid' | 'error' | 'warning';
  error?: string;
  statusCode?: number;
  stars?: number;
  lastPushed?: string;
  npmPackage?: string;
  npmValid?: boolean;
  npmError?: string;
  pipPackage?: string;
  pipValid?: boolean;
  pipError?: string;
}

interface GitHubRepoInfo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  archived: boolean;
  disabled: boolean;
  stargazers_count: number;
  pushed_at: string;
}

interface NpmPackageInfo {
  name: string;
  version: string;
  description?: string;
}

interface PyPIPackageInfo {
  info: {
    name: string;
    version: string;
    summary?: string;
  };
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Extract owner and repo from a GitHub URL
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const patterns = [
    /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\/.*)?$/,
    /^github\.com\/([^\/]+)\/([^\/]+?)(?:\/.*)?$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ''),
      };
    }
  }

  return null;
}

/**
 * Check if a GitHub repository exists
 */
async function checkRepository(
  owner: string,
  repo: string
): Promise<{
  exists: boolean;
  error?: string;
  statusCode?: number;
  data?: GitHubRepoInfo;
}> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'octocode-mcp-validator',
        ...(process.env.GITHUB_TOKEN && {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
        }),
        ...(process.env.GITHUB_PERSONAL_ACCESS_TOKEN && {
          Authorization: `token ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
        }),
      },
    });

    if (response.ok) {
      const data = (await response.json()) as GitHubRepoInfo;
      return { exists: true, statusCode: response.status, data };
    }

    if (response.status === 404) {
      return {
        exists: false,
        error: 'Repository not found',
        statusCode: response.status,
      };
    }

    if (response.status === 403) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        return {
          exists: false,
          error:
            'Rate limit exceeded. Set GITHUB_TOKEN env var for higher limits.',
          statusCode: response.status,
        };
      }
      return {
        exists: false,
        error: 'Access forbidden',
        statusCode: response.status,
      };
    }

    return {
      exists: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
      statusCode: response.status,
    };
  } catch (err) {
    return {
      exists: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Check if an npm package exists
 */
async function checkNpmPackage(
  packageName: string
): Promise<{ exists: boolean; error?: string; data?: NpmPackageInfo }> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'octocode-mcp-validator',
      },
    });

    if (response.ok) {
      const data = (await response.json()) as NpmPackageInfo;
      return { exists: true, data };
    }

    if (response.status === 404) {
      return { exists: false, error: 'Package not found on npm' };
    }

    return { exists: false, error: `HTTP ${response.status}` };
  } catch (err) {
    return {
      exists: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Check if a pip package exists on PyPI
 */
async function checkPipPackage(
  packageName: string
): Promise<{ exists: boolean; error?: string; data?: PyPIPackageInfo }> {
  const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'octocode-mcp-validator',
      },
    });

    if (response.ok) {
      const data = (await response.json()) as PyPIPackageInfo;
      return { exists: true, data };
    }

    if (response.status === 404) {
      return { exists: false, error: 'Package not found on PyPI' };
    }

    return { exists: false, error: `HTTP ${response.status}` };
  } catch (err) {
    return {
      exists: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Validate a single MCP entry
 */
async function validateMCP(
  mcp: MCPRegistryEntry,
  checkPackages: boolean
): Promise<ValidationResult> {
  const parsed = parseGitHubUrl(mcp.repository);

  if (!parsed) {
    return {
      id: mcp.id,
      name: mcp.name,
      repository: mcp.repository,
      status: 'error',
      error: 'Could not parse GitHub URL',
    };
  }

  const result = await checkRepository(parsed.owner, parsed.repo);

  if (!result.exists) {
    return {
      id: mcp.id,
      name: mcp.name,
      repository: mcp.repository,
      status: 'invalid',
      error: result.error,
      statusCode: result.statusCode,
    };
  }

  // Check if repo is archived or disabled
  if (result.data?.archived) {
    return {
      id: mcp.id,
      name: mcp.name,
      repository: mcp.repository,
      status: 'invalid',
      error: 'Repository is archived',
      statusCode: result.statusCode,
      stars: result.data.stargazers_count,
    };
  }

  if (result.data?.disabled) {
    return {
      id: mcp.id,
      name: mcp.name,
      repository: mcp.repository,
      status: 'invalid',
      error: 'Repository is disabled',
      statusCode: result.statusCode,
      stars: result.data.stargazers_count,
    };
  }

  // Check for stale repos (no updates in 1+ year)
  const lastPushed = result.data?.pushed_at
    ? new Date(result.data.pushed_at)
    : null;
  const isStale = lastPushed && Date.now() - lastPushed.getTime() > ONE_YEAR_MS;

  const validationResult: ValidationResult = {
    id: mcp.id,
    name: mcp.name,
    repository: mcp.repository,
    status: isStale ? 'warning' : 'valid',
    error: isStale
      ? 'Repository has not been updated in over 1 year'
      : undefined,
    statusCode: result.statusCode,
    stars: result.data?.stargazers_count,
    lastPushed: result.data?.pushed_at,
  };

  // Check npm package if requested
  if (checkPackages && mcp.npmPackage && mcp.installationType === 'npx') {
    const npmResult = await checkNpmPackage(mcp.npmPackage);
    validationResult.npmPackage = mcp.npmPackage;
    validationResult.npmValid = npmResult.exists;
    if (!npmResult.exists) {
      validationResult.npmError = npmResult.error;
      if (validationResult.status === 'valid') {
        validationResult.status = 'warning';
        validationResult.error = `npm package not found: ${mcp.npmPackage}`;
      }
    }
  }

  // Check pip package if requested
  if (checkPackages && mcp.pipPackage && mcp.installationType === 'pip') {
    const pipResult = await checkPipPackage(mcp.pipPackage);
    validationResult.pipPackage = mcp.pipPackage;
    validationResult.pipValid = pipResult.exists;
    if (!pipResult.exists) {
      validationResult.pipError = pipResult.error;
      if (validationResult.status === 'valid') {
        validationResult.status = 'warning';
        validationResult.error = `pip package not found: ${mcp.pipPackage}`;
      }
    }
  }

  return validationResult;
}

/**
 * Validate all MCPs with rate limiting
 */
async function validateAllMCPs(
  concurrency: number = 5,
  delayMs: number = 100,
  checkPackages: boolean = false
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const total = MCP_REGISTRY.length;

  console.log(`\n🔍 Validating ${total} MCP entries...`);
  if (checkPackages) {
    console.log('   (including npm/pip package validation)\n');
  } else {
    console.log(
      '   (use --check-packages to also validate npm/pip packages)\n'
    );
  }

  for (let i = 0; i < total; i += concurrency) {
    const batch = MCP_REGISTRY.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(mcp => validateMCP(mcp, checkPackages))
    );
    results.push(...batchResults);

    const progress = Math.min(i + concurrency, total);
    const validCount = results.filter(r => r.status === 'valid').length;
    const warningCount = results.filter(r => r.status === 'warning').length;
    const invalidCount = results.filter(r => r.status === 'invalid').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    process.stdout.write(
      `\r  Progress: ${progress}/${total} | ✅ ${validCount} | ⚠️  ${warningCount} | ❌ ${invalidCount} | 🔴 ${errorCount}`
    );

    if (i + concurrency < total) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log('\n');
  return results;
}

/**
 * Format date as relative time
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${(diffDays / 365).toFixed(1)} years ago`;
}

/**
 * Print validation report
 */
function printReport(results: ValidationResult[]): void {
  const valid = results.filter(r => r.status === 'valid');
  const warnings = results.filter(r => r.status === 'warning');
  const invalid = results.filter(r => r.status === 'invalid');
  const errors = results.filter(r => r.status === 'error');

  console.log('═'.repeat(80));
  console.log('                        MCP REGISTRY VALIDATION REPORT');
  console.log('═'.repeat(80));
  console.log();

  // Count stale repos
  const staleCount = warnings.filter(w =>
    w.error?.includes('not been updated in over 1 year')
  ).length;

  // Summary
  console.log('📊 SUMMARY');
  console.log('─'.repeat(40));
  console.log(`  Total MCPs:     ${results.length}`);
  console.log(`  ✅ Valid:       ${valid.length}`);
  console.log(`  ⚠️  Warnings:    ${warnings.length}`);
  console.log(`  🗑️  Stale:       ${staleCount}`);
  console.log(`  ❌ Invalid:     ${invalid.length}`);
  console.log(`  🔴 Errors:      ${errors.length}`);
  console.log();

  // Invalid MCPs
  if (invalid.length > 0) {
    console.log('❌ INVALID MCPs (Repository not found or inaccessible)');
    console.log('─'.repeat(80));
    for (const mcp of invalid) {
      console.log(`  • ${mcp.id}`);
      console.log(`    Name:       ${mcp.name}`);
      console.log(`    Repository: ${mcp.repository}`);
      console.log(`    Error:      ${mcp.error}`);
      if (mcp.statusCode) {
        console.log(`    Status:     HTTP ${mcp.statusCode}`);
      }
      console.log();
    }
  }

  // Stale repos (no updates in 1+ year)
  const staleRepos = warnings.filter(w =>
    w.error?.includes('not been updated in over 1 year')
  );
  if (staleRepos.length > 0) {
    console.log('🗑️  STALE MCPs - CONSIDER REMOVING FROM REGISTRY');
    console.log('─'.repeat(80));
    console.log(
      '   The following MCPs have not been updated in over 1 year and may be abandoned.'
    );
    console.log('   Consider removing them from mcp-registry.ts:\n');
    for (const mcp of staleRepos) {
      console.log(`  • ${mcp.id}`);
      console.log(`    Name:       ${mcp.name}`);
      console.log(`    Repository: ${mcp.repository}`);
      if (mcp.lastPushed) {
        console.log(`    Last push:  ${formatRelativeTime(mcp.lastPushed)}`);
      }
      if (mcp.stars !== undefined) {
        console.log(`    Stars:      ${mcp.stars}`);
      }
      console.log();
    }
    console.log(
      '   👆 ACTION REQUIRED: Remove stale MCPs from mcp-registry.ts!\n'
    );
  }

  // Other warnings (package issues)
  const otherWarnings = warnings.filter(
    w => !w.error?.includes('not been updated in over 1 year')
  );
  if (otherWarnings.length > 0) {
    console.log('⚠️  WARNINGS (Package issues)');
    console.log('─'.repeat(80));
    for (const mcp of otherWarnings) {
      console.log(`  • ${mcp.id}`);
      console.log(`    Name:       ${mcp.name}`);
      console.log(`    Repository: ${mcp.repository}`);
      console.log(`    Warning:    ${mcp.error}`);
      if (mcp.lastPushed) {
        console.log(`    Last push:  ${formatRelativeTime(mcp.lastPushed)}`);
      }
      if (mcp.stars !== undefined) {
        console.log(`    Stars:      ${mcp.stars}`);
      }
      if (mcp.npmError) {
        console.log(`    npm:        ${mcp.npmError}`);
      }
      if (mcp.pipError) {
        console.log(`    pip:        ${mcp.pipError}`);
      }
      console.log();
    }
  }

  // Errors
  if (errors.length > 0) {
    console.log('🔴 ERRORS (Could not validate)');
    console.log('─'.repeat(80));
    for (const mcp of errors) {
      console.log(`  • ${mcp.id}`);
      console.log(`    Name:       ${mcp.name}`);
      console.log(`    Repository: ${mcp.repository}`);
      console.log(`    Error:      ${mcp.error}`);
      console.log();
    }
  }

  // Top 10 by stars
  const sortedByStars = [...results]
    .filter(r => r.stars !== undefined)
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .slice(0, 10);

  if (sortedByStars.length > 0) {
    console.log('⭐ TOP 10 BY STARS');
    console.log('─'.repeat(40));
    for (const mcp of sortedByStars) {
      const stars = (mcp.stars ?? 0).toString().padStart(6);
      console.log(`  ${stars} ⭐  ${mcp.name}`);
    }
    console.log();
  }

  // All valid
  if (invalid.length === 0 && errors.length === 0) {
    console.log('✅ All MCP repositories are valid!\n');
  }

  console.log('═'.repeat(80));
}

/**
 * Output results as JSON
 */
function outputJson(results: ValidationResult[]): void {
  const invalid = results.filter(
    r => r.status === 'invalid' || r.status === 'error'
  );
  const warnings = results.filter(r => r.status === 'warning');
  console.log(
    JSON.stringify(
      {
        invalid,
        warnings,
        total: results.length,
        validCount: results.filter(r => r.status === 'valid').length,
      },
      null,
      2
    )
  );
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const checkPackages = args.includes('--check-packages');
  const concurrency = parseInt(
    args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5'
  );

  if (!jsonOutput) {
    console.log(
      '╔═══════════════════════════════════════════════════════════════════════════════╗'
    );
    console.log(
      '║              MCP REGISTRY VALIDATOR - octocode-cli                            ║'
    );
    console.log(
      '╚═══════════════════════════════════════════════════════════════════════════════╝'
    );

    if (
      !process.env.GITHUB_TOKEN &&
      !process.env.GITHUB_PERSONAL_ACCESS_TOKEN
    ) {
      console.log(
        '\n⚠️  TIP: Set GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN for higher rate limits\n'
      );
    }
  }

  const results = await validateAllMCPs(concurrency, 100, checkPackages);

  if (jsonOutput) {
    outputJson(results);
  } else {
    printReport(results);
  }

  // Exit with error code if any invalid MCPs found (warnings don't cause failure)
  const hasInvalid = results.some(
    r => r.status === 'invalid' || r.status === 'error'
  );
  process.exit(hasInvalid ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
