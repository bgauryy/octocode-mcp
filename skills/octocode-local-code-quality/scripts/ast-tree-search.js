#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function printHelp() {
  console.log(`
ast-tree-search — Search generated ast-trees.txt output

Usage:
  node scripts/ast-tree-search.js [options]

Options:
  --input, -i <path>       Path to ast-trees.txt, a scan directory, or .octocode/scan (default: .octocode/scan)
  --pattern, -p <regex>    Regex to match against AST tree lines
  --kind, -k <kind>        Match a node kind (supports snake_case or PascalCase)
  --context, -C <n>        Context lines around each match (default: 0)
  --json                   Output matches as JSON
  --ignore-case            Case-insensitive pattern matching
  --help, -h               Show this message

Examples:
  node scripts/ast-tree-search.js -i .octocode/scan -k function_declaration
  node scripts/ast-tree-search.js -i .octocode/scan/2026-03-18T23-43-21-490Z -k ClassDeclaration
  node scripts/ast-tree-search.js -i .octocode/scan -p 'IfStatement|SwitchStatement'
`);
}

function parseArgs(argv) {
  const opts = {
    input: '.octocode/scan',
    pattern: '',
    kind: '',
    context: 0,
    json: false,
    ignoreCase: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
      case '-i':
        opts.input = argv[++i] || '';
        break;
      case '--pattern':
      case '-p':
        opts.pattern = argv[++i] || '';
        break;
      case '--kind':
      case '-k':
        opts.kind = argv[++i] || '';
        break;
      case '--context':
      case '-C':
        opts.context = Number.parseInt(argv[++i] || '0', 10);
        break;
      case '--json':
        opts.json = true;
        break;
      case '--ignore-case':
        opts.ignoreCase = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  if (!opts.pattern && !opts.kind) {
    console.error('Error: Must provide --pattern or --kind');
    printHelp();
    process.exit(1);
  }

  if (!Number.isFinite(opts.context) || opts.context < 0) {
    console.error('Error: --context must be a non-negative integer');
    process.exit(1);
  }

  return opts;
}

function toSnakeCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

function toPascalCase(value) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatchers(opts) {
  const flags = opts.ignoreCase ? 'i' : '';
  const patternRegex = opts.pattern ? new RegExp(opts.pattern, flags) : null;

  let kindRegex = null;
  if (opts.kind) {
    const snake = toSnakeCase(opts.kind);
    const pascal = toPascalCase(snake);
    kindRegex = new RegExp(`\\b(?:${escapeRegExp(snake)}|${escapeRegExp(pascal)})\\b`, flags);
  }

  return {
    matches(line) {
      if (patternRegex && !patternRegex.test(line)) {
        return false;
      }
      if (kindRegex && !kindRegex.test(line)) {
        return false;
      }
      return true;
    },
  };
}

function resolveAstTreeFile(inputPath) {
  const absolute = path.resolve(inputPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Input does not exist: ${absolute}`);
  }

  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    return absolute;
  }

  const directAstFile = path.join(absolute, 'ast-trees.txt');
  if (fs.existsSync(directAstFile) && fs.statSync(directAstFile).isFile()) {
    return directAstFile;
  }

  const candidates = fs.readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(absolute, entry.name, 'ast-trees.txt'))
    .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (candidates.length > 0) {
    return candidates[0];
  }

  throw new Error(`No ast-trees.txt found under: ${absolute}`);
}

function searchAstTree(filePath, opts) {
  const matcher = buildMatchers(opts);
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const matches = [];
  let currentSection = '';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim();
    }
    if (!matcher.matches(line)) {
      continue;
    }

    const start = Math.max(0, index - opts.context);
    const end = Math.min(lines.length, index + opts.context + 1);

    matches.push({
      section: currentSection,
      lineNumber: index + 1,
      line,
      context: lines.slice(start, end).map((contextLine, offset) => ({
        lineNumber: start + offset + 1,
        line: contextLine,
      })),
    });
  }

  return {
    inputFile: filePath,
    query: opts.kind ? `kind=${opts.kind}` : `pattern=${opts.pattern}`,
    totalMatches: matches.length,
    matches,
  };
}

function formatText(result, opts) {
  const lines = [];
  lines.push(`\nAST tree search: ${result.query}`);
  lines.push(`Input file: ${result.inputFile}`);
  lines.push(`Matches: ${result.totalMatches}\n`);

  let currentSection = '';
  for (const match of result.matches) {
    if (match.section !== currentSection) {
      currentSection = match.section;
      lines.push(`-- ${currentSection || '(no section)'} --`);
    }

    if (opts.context > 0) {
      for (const contextLine of match.context) {
        const marker = contextLine.lineNumber === match.lineNumber ? '>' : ' ';
        lines.push(` ${marker} ${String(contextLine.lineNumber).padStart(4)} | ${contextLine.line}`);
      }
      lines.push('');
      continue;
    }

    lines.push(`  L${match.lineNumber}  ${match.line}`);
  }

  if (result.totalMatches === 0) {
    lines.push('No matches found.');
  }

  lines.push('');
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const filePath = resolveAstTreeFile(opts.input);
  const result = searchAstTree(filePath, opts);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(formatText(result, opts));
}

main();
