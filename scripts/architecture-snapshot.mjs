#!/usr/bin/env node
/**
 * Extract a compact architecture/maintainability snapshot from scan summary JSON.
 *
 * Usage:
 *   node scripts/architecture-snapshot.mjs \
 *     --summary skills/octocode-code-engineer/.octocode/scan/check-each-tool-current/summary.json \
 *     --out .octocode/scan/architecture-snapshot.json
 */
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { summary: '', out: '' };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--summary') {
      args.summary = argv[++i] ?? '';
      continue;
    }
    if (token === '--out') {
      args.out = argv[++i] ?? '';
      continue;
    }
  }
  return args;
}

function pickAspectScore(aspects, key) {
  const hit = aspects.find(aspect => aspect.aspect === key);
  return hit ? { score: hit.score, grade: hit.grade } : null;
}

function createSnapshot(summary) {
  const aspects = summary?.qualityRating?.aspects ?? [];
  const featureScores = summary?.featureScores ?? [];
  const byCategory = Object.fromEntries(
    featureScores.map(item => [
      item.category,
      {
        findings: item.findings,
        score: item.score,
        grade: item.grade,
      },
    ])
  );

  return {
    generatedAt: summary.generatedAt ?? null,
    root: summary.repoRoot ?? null,
    totals: summary?.agentOutput?.findingStats?.overall ?? null,
    aspects: {
      architectureStructure: pickAspectScore(aspects, 'architecture-structure'),
      maintainabilityEvolvability: pickAspectScore(
        aspects,
        'maintainability-evolvability'
      ),
      namingQuality: pickAspectScore(aspects, 'naming-quality'),
      folderTopology: pickAspectScore(aspects, 'folder-topology'),
      codebaseConsistency: pickAspectScore(aspects, 'codebase-consistency'),
    },
    categories: {
      shotgunSurgery: byCategory['shotgun-surgery'] ?? null,
      highCoupling: byCategory['high-coupling'] ?? null,
      lowCohesion: byCategory['low-cohesion'] ?? null,
      missingErrorBoundary: byCategory['missing-error-boundary'] ?? null,
      cognitiveComplexity: byCategory['cognitive-complexity'] ?? null,
      architectureSdpViolation: byCategory['architecture-sdp-violation'] ?? null,
      dependencyCriticalPath: byCategory['dependency-critical-path'] ?? null,
    },
  };
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.summary) {
    throw new Error('Missing required --summary <path/to/summary.json>');
  }

  const summaryPath = path.resolve(args.summary);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const snapshot = createSnapshot(summary);
  const output = `${JSON.stringify(snapshot, null, 2)}\n`;

  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, 'utf8');
    console.log(`Wrote architecture snapshot: ${outPath}`);
    return;
  }

  process.stdout.write(output);
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`architecture-snapshot error: ${message}`);
  process.exitCode = 1;
}

