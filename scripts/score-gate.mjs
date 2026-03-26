#!/usr/bin/env node
/**
 * Score gate checker for octocode scan summary JSON outputs.
 *
 * Usage:
 *   node scripts/score-gate.mjs \
 *     --summary skills/octocode-code-engineer/.octocode/scan/check-each-tool-current/summary.json \
 *     --min-aspect architecture-structure:78 \
 *     --min-aspect maintainability-evolvability:80 \
 *     --max-category shotgun-surgery:12 \
 *     --max-category high-coupling:8
 */
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    summary: '',
    minAspect: [],
    maxCategory: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--summary') {
      args.summary = argv[++i] ?? '';
      continue;
    }
    if (token === '--min-aspect') {
      args.minAspect.push(argv[++i] ?? '');
      continue;
    }
    if (token === '--max-category') {
      args.maxCategory.push(argv[++i] ?? '');
      continue;
    }
  }

  return args;
}

function parseGate(expr, kind) {
  const [name, rawThreshold] = expr.split(':');
  const threshold = Number(rawThreshold);
  if (!name || Number.isNaN(threshold)) {
    throw new Error(`Invalid ${kind} expression: "${expr}"`);
  }
  return { name, threshold };
}

function readJson(filePath) {
  const absolute = path.resolve(filePath);
  const raw = fs.readFileSync(absolute, 'utf8');
  return JSON.parse(raw);
}

function formatStatus(ok) {
  return ok ? 'PASS' : 'FAIL';
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.summary) {
    throw new Error('Missing required --summary <path/to/summary.json>');
  }

  const summary = readJson(args.summary);
  const aspects = summary?.qualityRating?.aspects ?? [];
  const featureScores = summary?.featureScores ?? [];

  const aspectMap = new Map(aspects.map(a => [a.aspect, a]));
  const categoryMap = new Map(featureScores.map(c => [c.category, c]));

  const minAspectGates = args.minAspect.map(expr => parseGate(expr, 'aspect'));
  const maxCategoryGates = args.maxCategory.map(expr =>
    parseGate(expr, 'category')
  );

  let hasFailures = false;

  if (minAspectGates.length > 0) {
    console.log('\nAspect Gates');
    for (const gate of minAspectGates) {
      const aspect = aspectMap.get(gate.name);
      if (!aspect) {
        hasFailures = true;
        console.log(
          `[FAIL] ${gate.name}: missing (expected >= ${gate.threshold})`
        );
        continue;
      }
      const ok = aspect.score >= gate.threshold;
      if (!ok) hasFailures = true;
      console.log(
        `[${formatStatus(ok)}] ${gate.name}: ${aspect.score} (expected >= ${gate.threshold})`
      );
    }
  }

  if (maxCategoryGates.length > 0) {
    console.log('\nCategory Gates');
    for (const gate of maxCategoryGates) {
      const category = categoryMap.get(gate.name);
      if (!category) {
        hasFailures = true;
        console.log(
          `[FAIL] ${gate.name}: missing (expected findings <= ${gate.threshold})`
        );
        continue;
      }
      const findings = Number(category.findings ?? 0);
      const ok = findings <= gate.threshold;
      if (!ok) hasFailures = true;
      console.log(
        `[${formatStatus(ok)}] ${gate.name}: ${findings} findings (expected <= ${gate.threshold})`
      );
    }
  }

  if (minAspectGates.length === 0 && maxCategoryGates.length === 0) {
    console.log(
      'No gates provided. Use --min-aspect and/or --max-category to evaluate thresholds.'
    );
    return;
  }

  if (hasFailures) {
    process.exitCode = 1;
    console.log('\nScore gate check failed.');
  } else {
    console.log('\nScore gate check passed.');
  }
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`score-gate error: ${message}`);
  process.exitCode = 1;
}

