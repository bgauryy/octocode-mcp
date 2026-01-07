#!/usr/bin/env npx tsx
/**
 * Skills Marketplace Validation Script
 *
 * Validates all skills marketplace entries in the registry by checking:
 * - GitHub repositories exist and are accessible
 * - Skills path exists in the repository
 * - Repositories are not archived/disabled
 * - Repositories are not stale (no updates in 1+ year) - flagged for removal
 * - Skills directory contains actual skills
 *
 * Usage:
 *   npx tsx scripts/validate-skills-marketplace.ts
 *   yarn validate:skills
 *   yarn validate:skills --json
 *   yarn validate:skills --check-skills
 */

import {
  SKILLS_MARKETPLACES,
  type MarketplaceSource,
} from '../src/configs/skills-marketplace.js';

interface ValidationResult {
  id: string;
  name: string;
  owner: string;
  repo: string;
  url: string;
  status: 'valid' | 'invalid' | 'error' | 'warning';
  error?: string;
  statusCode?: number;
  stars?: number;
  lastPushed?: string;
  skillsPathValid?: boolean;
  skillsPathError?: string;
  skillsCount?: number;
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

interface GitHubContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Get authorization headers for GitHub API
 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'octocode-skills-validator',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  } else if (process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`;
  }

  return headers;
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
    const response = await fetch(url, { headers: getAuthHeaders() });

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
 * Check if a path exists in a GitHub repository and count skills
 */
async function checkSkillsPath(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  skillPattern: 'flat-md' | 'skill-folders'
): Promise<{
  exists: boolean;
  error?: string;
  skillsCount?: number;
}> {
  // Empty path means root directory - always exists if repo exists
  const apiPath = path || '';
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}?ref=${branch}`;

  try {
    const response = await fetch(url, { headers: getAuthHeaders() });

    if (!response.ok) {
      if (response.status === 404) {
        return { exists: false, error: `Skills path '${path}' not found` };
      }
      return { exists: false, error: `HTTP ${response.status}` };
    }

    const contents = (await response.json()) as GitHubContentItem[];

    if (!Array.isArray(contents)) {
      return { exists: false, error: 'Skills path is not a directory' };
    }

    // Count skills based on pattern
    let skillsCount = 0;
    if (skillPattern === 'flat-md') {
      // Count .md files (excluding README.md)
      skillsCount = contents.filter(
        item =>
          item.type === 'file' &&
          item.name.endsWith('.md') &&
          item.name.toLowerCase() !== 'readme.md'
      ).length;
    } else {
      // skill-folders: count directories that likely contain skills
      skillsCount = contents.filter(
        item =>
          item.type === 'dir' &&
          !item.name.startsWith('.') &&
          item.name.toLowerCase() !== 'node_modules'
      ).length;
    }

    return { exists: true, skillsCount };
  } catch (err) {
    return {
      exists: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Validate a single marketplace entry
 */
async function validateMarketplace(
  marketplace: MarketplaceSource,
  checkSkills: boolean
): Promise<ValidationResult> {
  const result = await checkRepository(marketplace.owner, marketplace.repo);

  if (!result.exists) {
    return {
      id: marketplace.id,
      name: marketplace.name,
      owner: marketplace.owner,
      repo: marketplace.repo,
      url: marketplace.url,
      status: 'invalid',
      error: result.error,
      statusCode: result.statusCode,
    };
  }

  // Check if repo is archived or disabled
  if (result.data?.archived) {
    return {
      id: marketplace.id,
      name: marketplace.name,
      owner: marketplace.owner,
      repo: marketplace.repo,
      url: marketplace.url,
      status: 'invalid',
      error: 'Repository is archived',
      statusCode: result.statusCode,
      stars: result.data.stargazers_count,
    };
  }

  if (result.data?.disabled) {
    return {
      id: marketplace.id,
      name: marketplace.name,
      owner: marketplace.owner,
      repo: marketplace.repo,
      url: marketplace.url,
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
    id: marketplace.id,
    name: marketplace.name,
    owner: marketplace.owner,
    repo: marketplace.repo,
    url: marketplace.url,
    status: isStale ? 'warning' : 'valid',
    error: isStale
      ? 'Repository has not been updated in over 1 year'
      : undefined,
    statusCode: result.statusCode,
    stars: result.data?.stargazers_count,
    lastPushed: result.data?.pushed_at,
  };

  // Check skills path if requested
  if (checkSkills) {
    const skillsResult = await checkSkillsPath(
      marketplace.owner,
      marketplace.repo,
      marketplace.skillsPath,
      marketplace.branch,
      marketplace.skillPattern
    );

    validationResult.skillsPathValid = skillsResult.exists;
    validationResult.skillsCount = skillsResult.skillsCount;

    if (!skillsResult.exists) {
      validationResult.skillsPathError = skillsResult.error;
      if (validationResult.status === 'valid') {
        validationResult.status = 'warning';
        validationResult.error = skillsResult.error;
      }
    } else if (skillsResult.skillsCount === 0) {
      validationResult.skillsPathError = 'No skills found in path';
      if (validationResult.status === 'valid') {
        validationResult.status = 'warning';
        validationResult.error = 'No skills found in skills path';
      }
    }
  }

  return validationResult;
}

/**
 * Validate all marketplaces with rate limiting
 */
async function validateAllMarketplaces(
  concurrency: number = 3,
  delayMs: number = 200,
  checkSkills: boolean = false
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const total = SKILLS_MARKETPLACES.length;

  console.log(`\n🔍 Validating ${total} skills marketplace entries...`);
  if (checkSkills) {
    console.log('   (including skills path validation)\n');
  } else {
    console.log(
      '   (use --check-skills to also validate skills directories)\n'
    );
  }

  for (let i = 0; i < total; i += concurrency) {
    const batch = SKILLS_MARKETPLACES.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(m => validateMarketplace(m, checkSkills))
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
  console.log('                    SKILLS MARKETPLACE VALIDATION REPORT');
  console.log('═'.repeat(80));
  console.log();

  // Count stale repos
  const staleCount = warnings.filter(w =>
    w.error?.includes('not been updated in over 1 year')
  ).length;

  // Summary
  console.log('📊 SUMMARY');
  console.log('─'.repeat(40));
  console.log(`  Total Marketplaces: ${results.length}`);
  console.log(`  ✅ Valid:           ${valid.length}`);
  console.log(`  ⚠️  Warnings:        ${warnings.length}`);
  console.log(`  🗑️  Stale:           ${staleCount}`);
  console.log(`  ❌ Invalid:         ${invalid.length}`);
  console.log(`  🔴 Errors:          ${errors.length}`);

  // Skills count summary
  const totalSkills = results.reduce((sum, r) => sum + (r.skillsCount || 0), 0);
  if (totalSkills > 0) {
    console.log(`  📚 Total Skills:    ${totalSkills}`);
  }
  console.log();

  // Invalid marketplaces
  if (invalid.length > 0) {
    console.log(
      '❌ INVALID MARKETPLACES (Repository not found or inaccessible)'
    );
    console.log('─'.repeat(80));
    for (const m of invalid) {
      console.log(`  • ${m.id}`);
      console.log(`    Name:       ${m.name}`);
      console.log(`    Repository: ${m.owner}/${m.repo}`);
      console.log(`    URL:        ${m.url}`);
      console.log(`    Error:      ${m.error}`);
      if (m.statusCode) {
        console.log(`    Status:     HTTP ${m.statusCode}`);
      }
      console.log();
    }
  }

  // Stale repos (no updates in 1+ year)
  const staleRepos = warnings.filter(w =>
    w.error?.includes('not been updated in over 1 year')
  );
  if (staleRepos.length > 0) {
    console.log('🗑️  STALE MARKETPLACES - CONSIDER REMOVING FROM REGISTRY');
    console.log('─'.repeat(80));
    console.log(
      '   The following marketplaces have not been updated in over 1 year and may be abandoned.'
    );
    console.log('   Consider removing them from skills-marketplace.ts:\n');
    for (const m of staleRepos) {
      console.log(`  • ${m.id}`);
      console.log(`    Name:       ${m.name}`);
      console.log(`    Repository: ${m.owner}/${m.repo}`);
      if (m.lastPushed) {
        console.log(`    Last push:  ${formatRelativeTime(m.lastPushed)}`);
      }
      if (m.stars !== undefined) {
        console.log(`    Stars:      ${m.stars}`);
      }
      console.log();
    }
    console.log(
      '   👆 ACTION REQUIRED: Remove stale marketplaces from skills-marketplace.ts!\n'
    );
  }

  // Other warnings (skills path issues)
  const otherWarnings = warnings.filter(
    w => !w.error?.includes('not been updated in over 1 year')
  );
  if (otherWarnings.length > 0) {
    console.log('⚠️  WARNINGS (Skills path issues)');
    console.log('─'.repeat(80));
    for (const m of otherWarnings) {
      console.log(`  • ${m.id}`);
      console.log(`    Name:       ${m.name}`);
      console.log(`    Repository: ${m.owner}/${m.repo}`);
      console.log(`    Warning:    ${m.error}`);
      if (m.lastPushed) {
        console.log(`    Last push:  ${formatRelativeTime(m.lastPushed)}`);
      }
      if (m.stars !== undefined) {
        console.log(`    Stars:      ${m.stars}`);
      }
      if (m.skillsPathError) {
        console.log(`    Skills:     ${m.skillsPathError}`);
      }
      console.log();
    }
  }

  // Errors
  if (errors.length > 0) {
    console.log('🔴 ERRORS (Could not validate)');
    console.log('─'.repeat(80));
    for (const m of errors) {
      console.log(`  • ${m.id}`);
      console.log(`    Name:       ${m.name}`);
      console.log(`    Repository: ${m.owner}/${m.repo}`);
      console.log(`    Error:      ${m.error}`);
      console.log();
    }
  }

  // Marketplaces by stars
  const sortedByStars = [...results]
    .filter(r => r.stars !== undefined)
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));

  if (sortedByStars.length > 0) {
    console.log('⭐ MARKETPLACES BY STARS');
    console.log('─'.repeat(40));
    for (const m of sortedByStars) {
      const stars = (m.stars ?? 0).toString().padStart(6);
      const skills =
        m.skillsCount !== undefined ? ` (${m.skillsCount} skills)` : '';
      console.log(`  ${stars} ⭐  ${m.name}${skills}`);
    }
    console.log();
  }

  // All valid
  if (invalid.length === 0 && errors.length === 0) {
    console.log('✅ All skills marketplace repositories are valid!\n');
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
        totalSkills: results.reduce((sum, r) => sum + (r.skillsCount || 0), 0),
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
  const checkSkills = args.includes('--check-skills');
  const concurrency = parseInt(
    args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3'
  );

  if (!jsonOutput) {
    console.log(
      '╔═══════════════════════════════════════════════════════════════════════════════╗'
    );
    console.log(
      '║            SKILLS MARKETPLACE VALIDATOR - octocode-cli                        ║'
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

  const results = await validateAllMarketplaces(concurrency, 200, checkSkills);

  if (jsonOutput) {
    outputJson(results);
  } else {
    printReport(results);
  }

  // Exit with error code if any invalid marketplaces found (warnings don't cause failure)
  const hasInvalid = results.some(
    r => r.status === 'invalid' || r.status === 'error'
  );
  process.exit(hasInvalid ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
