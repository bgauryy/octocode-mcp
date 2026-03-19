import { describe, expect, it, vi } from 'vitest';

import { parseArgs } from './cli.js';
import { DEFAULT_OPTS } from './types.js';

describe('parseArgs', () => {
  it('returns defaults when no args given', () => {
    const opts = parseArgs([]);
    expect(opts.json).toBe(false);
    expect(opts.includeTests).toBe(false);
    expect(opts.emitTree).toBe(true);
    expect(opts.graph).toBe(false);
    expect(opts.parser).toBe('auto');
    expect(opts.findingsLimit).toBe(Infinity);
    expect(opts.minFunctionStatements).toBe(6);
    expect(opts.minFlowStatements).toBe(6);
    expect(opts.criticalComplexityThreshold).toBe(30);
    expect(opts.deepLinkTopN).toBe(12);
    expect(opts.treeDepth).toBe(4);
    expect(opts.packageRoot).toMatch(/packages$/);
  });

  it('parses --json flag', () => {
    expect(parseArgs(['--json']).json).toBe(true);
  });

  it('parses --include-tests flag', () => {
    expect(parseArgs(['--include-tests']).includeTests).toBe(true);
  });

  it('parses --emit-tree and --no-tree flags', () => {
    expect(parseArgs(['--emit-tree']).emitTree).toBe(true);
    expect(parseArgs(['--no-tree']).emitTree).toBe(false);
    expect(parseArgs(['--emit-tree', '--no-tree']).emitTree).toBe(false);
    expect(parseArgs(['--no-tree', '--emit-tree']).emitTree).toBe(true);
  });

  it('parses --graph flag', () => {
    expect(parseArgs(['--graph']).graph).toBe(true);
  });

  it('parses --graph-advanced and --flow flags', () => {
    const opts = parseArgs(['--graph-advanced', '--flow']);
    expect(opts.graphAdvanced).toBe(true);
    expect(opts.flow).toBe(true);
  });

  it('parses --parser with valid values', () => {
    expect(parseArgs(['--parser', 'typescript']).parser).toBe('typescript');
    expect(parseArgs(['--parser', 'tree-sitter']).parser).toBe('tree-sitter');
    expect(parseArgs(['--parser', 'auto']).parser).toBe('auto');
  });

  it('parses --out as separate arg and --out= syntax', () => {
    expect(parseArgs(['--out', '/tmp/report.json']).out).toBe('/tmp/report.json');
    expect(parseArgs(['--out=/tmp/report.json']).out).toBe('/tmp/report.json');
  });

  it('parses --findings-limit', () => {
    expect(parseArgs(['--findings-limit', '500']).findingsLimit).toBe(500);
  });

  it('parses --min-function-statements', () => {
    expect(parseArgs(['--min-function-statements', '12']).minFunctionStatements).toBe(12);
  });

  it('parses --min-flow-statements', () => {
    expect(parseArgs(['--min-flow-statements', '8']).minFlowStatements).toBe(8);
  });

  it('parses --critical-complexity-threshold', () => {
    expect(parseArgs(['--critical-complexity-threshold', '25']).criticalComplexityThreshold).toBe(25);
  });

  it('parses --deep-link-topn', () => {
    expect(parseArgs(['--deep-link-topn', '30']).deepLinkTopN).toBe(30);
  });

  it('parses --tree-depth', () => {
    expect(parseArgs(['--tree-depth', '6']).treeDepth).toBe(6);
  });

  it('parses --coupling-threshold', () => {
    expect(parseArgs(['--coupling-threshold', '20']).couplingThreshold).toBe(20);
  });

  it('parses --fan-in-threshold', () => {
    expect(parseArgs(['--fan-in-threshold', '25']).fanInThreshold).toBe(25);
  });

  it('parses --fan-out-threshold', () => {
    expect(parseArgs(['--fan-out-threshold', '18']).fanOutThreshold).toBe(18);
  });

  it('parses --god-module-statements', () => {
    expect(parseArgs(['--god-module-statements', '600']).godModuleStatements).toBe(600);
  });

  it('parses --god-module-exports', () => {
    expect(parseArgs(['--god-module-exports', '30']).godModuleExports).toBe(30);
  });

  it('parses --god-function-statements', () => {
    expect(parseArgs(['--god-function-statements', '150']).godFunctionStatements).toBe(150);
  });

  it('parses --cognitive-complexity-threshold', () => {
    expect(parseArgs(['--cognitive-complexity-threshold', '20']).cognitiveComplexityThreshold).toBe(20);
  });

  it('parses --barrel-symbol-threshold', () => {
    expect(parseArgs(['--barrel-symbol-threshold', '50']).barrelSymbolThreshold).toBe(50);
  });

  it('parses --layer-order as comma-separated list', () => {
    const opts = parseArgs(['--layer-order', 'ui,service,repository']);
    expect(opts.layerOrder).toEqual(['ui', 'service', 'repository']);
  });

  it('trims whitespace in --layer-order values', () => {
    const opts = parseArgs(['--layer-order', ' ui , service , repo ']);
    expect(opts.layerOrder).toEqual(['ui', 'service', 'repo']);
  });

  // --features parsing
  it('parses --features with pillar name', () => {
    const opts = parseArgs(['--features=architecture']);
    expect(opts.features).toBeInstanceOf(Set);
    expect(opts.features!.has('dependency-cycle')).toBe(true);
    expect(opts.features!.has('dead-export')).toBe(false);
  });

  it('parses --features with individual category', () => {
    const opts = parseArgs(['--features=cognitive-complexity']);
    expect(opts.features).toBeInstanceOf(Set);
    expect(opts.features!.size).toBe(1);
    expect(opts.features!.has('cognitive-complexity')).toBe(true);
  });

  it('parses --features with mixed pillar and category', () => {
    const opts = parseArgs(['--features=architecture,empty-catch']);
    expect(opts.features).toBeInstanceOf(Set);
    expect(opts.features!.has('dependency-cycle')).toBe(true);
    expect(opts.features!.has('empty-catch')).toBe(true);
    expect(opts.features!.has('dead-export')).toBe(false);
  });

  it('parses --features with space separator', () => {
    const opts = parseArgs(['--features', 'dead-code']);
    expect(opts.features).toBeInstanceOf(Set);
    expect(opts.features!.has('dead-export')).toBe(true);
  });

  it('defaults features to null (all enabled)', () => {
    const opts = parseArgs([]);
    expect(opts.features).toBeNull();
  });

  // --exclude parsing
  it('parses --exclude with pillar name', () => {
    const opts = parseArgs(['--exclude=architecture']);
    expect(opts.features).toBeInstanceOf(Set);
    expect(opts.features!.has('dependency-cycle')).toBe(false);
    expect(opts.features!.has('dead-export')).toBe(true);
    expect(opts.features!.has('cognitive-complexity')).toBe(true);
  });

  it('parses --exclude with individual category', () => {
    const opts = parseArgs(['--exclude=dead-export']);
    expect(opts.features).toBeInstanceOf(Set);
    expect(opts.features!.has('dead-export')).toBe(false);
    expect(opts.features!.has('dead-re-export')).toBe(true);
  });

  it('falls back to defaults for NaN numeric args', () => {
    const opts = parseArgs([
      '--findings-limit', 'abc',
      '--coupling-threshold', 'xyz',
      '--fan-in-threshold', '',
      '--fan-out-threshold', 'NaN',
      '--god-module-statements', 'bad',
      '--god-module-exports', 'nope',
      '--god-function-statements', 'err',
      '--cognitive-complexity-threshold', 'x',
      '--barrel-symbol-threshold', '!!',
      '--min-function-statements', 'no',
      '--min-flow-statements', 'no',
      '--critical-complexity-threshold', 'no',
      '--deep-link-topn', 'no',
      '--tree-depth', 'no',
    ]);
    expect(opts.findingsLimit).toBe(DEFAULT_OPTS.findingsLimit);
    expect(opts.couplingThreshold).toBe(DEFAULT_OPTS.couplingThreshold);
    expect(opts.fanInThreshold).toBe(DEFAULT_OPTS.fanInThreshold);
    expect(opts.fanOutThreshold).toBe(DEFAULT_OPTS.fanOutThreshold);
    expect(opts.godModuleStatements).toBe(DEFAULT_OPTS.godModuleStatements);
    expect(opts.godModuleExports).toBe(DEFAULT_OPTS.godModuleExports);
    expect(opts.godFunctionStatements).toBe(DEFAULT_OPTS.godFunctionStatements);
    expect(opts.cognitiveComplexityThreshold).toBe(DEFAULT_OPTS.cognitiveComplexityThreshold);
    expect(opts.barrelSymbolThreshold).toBe(DEFAULT_OPTS.barrelSymbolThreshold);
    expect(opts.minFunctionStatements).toBe(DEFAULT_OPTS.minFunctionStatements);
    expect(opts.minFlowStatements).toBe(DEFAULT_OPTS.minFlowStatements);
    expect(opts.criticalComplexityThreshold).toBe(DEFAULT_OPTS.criticalComplexityThreshold);
    expect(opts.deepLinkTopN).toBe(DEFAULT_OPTS.deepLinkTopN);
    expect(opts.treeDepth).toBe(DEFAULT_OPTS.treeDepth);
  });

  it('handles multiple flags together', () => {
    const opts = parseArgs([
      '--json',
      '--include-tests',
      '--no-tree',
      '--graph',
      '--parser', 'typescript',
      '--findings-limit', '100',
      '--coupling-threshold', '10',
      '--layer-order', 'a,b,c',
    ]);
    expect(opts.json).toBe(true);
    expect(opts.includeTests).toBe(true);
    expect(opts.emitTree).toBe(false);
    expect(opts.graph).toBe(true);
    expect(opts.parser).toBe('typescript');
    expect(opts.findingsLimit).toBe(100);
    expect(opts.couplingThreshold).toBe(10);
    expect(opts.layerOrder).toEqual(['a', 'b', 'c']);
  });

  it('sets packageRoot relative to root', () => {
    const opts = parseArgs(['--root', '/tmp/myrepo']);
    expect(opts.packageRoot).toBe('/tmp/myrepo/packages');
    expect(opts.root).toBe('/tmp/myrepo');
  });

  it('--semantic enables semantic analysis', () => {
    const opts = parseArgs(['--semantic']);
    expect(opts.semantic).toBe(true);
  });

  it('semantic defaults to false', () => {
    const opts = parseArgs([]);
    expect(opts.semantic).toBe(false);
  });

  it('--override-chain-threshold sets threshold', () => {
    const opts = parseArgs(['--override-chain-threshold', '5']);
    expect(opts.overrideChainThreshold).toBe(5);
  });

  it('NaN guards for semantic thresholds', () => {
    const opts = parseArgs(['--override-chain-threshold', 'xyz']);
    expect(opts.overrideChainThreshold).toBe(3);
  });

  it('--no-diversify sets noDiversify to true', () => {
    expect(parseArgs(['--no-diversify']).noDiversify).toBe(true);
  });

  it('noDiversify defaults to false', () => {
    expect(parseArgs([]).noDiversify).toBe(false);
  });

  it('--features=test-quality auto-enables includeTests', () => {
    const opts = parseArgs(['--features=test-quality']);
    expect(opts.includeTests).toBe(true);
  });

  it('--features=low-assertion-density auto-enables includeTests', () => {
    const opts = parseArgs(['--features=low-assertion-density']);
    expect(opts.includeTests).toBe(true);
  });

  it('--features=architecture does not auto-enable includeTests', () => {
    const opts = parseArgs(['--features=architecture']);
    expect(opts.includeTests).toBe(false);
  });

  // ─── Additional parseArgs coverage (boolean flags) ──────────────────────────
  it('parses all boolean flags: --json, --include-tests, --emit-tree, --no-tree, --graph, --semantic, --no-diversify, --no-cache, --clear-cache, --graph-advanced, --flow, --all', () => {
    const opts = parseArgs([
      '--json',
      '--include-tests',
      '--no-tree',
      '--graph',
      '--semantic',
      '--no-diversify',
      '--no-cache',
      '--clear-cache',
      '--graph-advanced',
      '--flow',
      '--all',
    ]);
    expect(opts.json).toBe(true);
    expect(opts.includeTests).toBe(true);
    expect(opts.emitTree).toBe(false);
    expect(opts.graph).toBe(true);
    expect(opts.semantic).toBe(true);
    expect(opts.noDiversify).toBe(true);
    expect(opts.noCache).toBe(true);
    expect(opts.clearCache).toBe(true);
    expect(opts.graphAdvanced).toBe(true);
    expect(opts.flow).toBe(true);
  });

  it('parses --all as shorthand for includeTests and semantic', () => {
    const opts = parseArgs(['--all']);
    expect(opts.includeTests).toBe(true);
    expect(opts.semantic).toBe(true);
  });

  it('parses --no-cache and --clear-cache', () => {
    expect(parseArgs(['--no-cache']).noCache).toBe(true);
    expect(parseArgs(['--clear-cache']).clearCache).toBe(true);
  });

  // ─── Int flags with specific values ───────────────────────────────────────
  it('parses --findings-limit 10, --min-function-statements 8, --critical-complexity-threshold 30', () => {
    const opts = parseArgs([
      '--findings-limit', '10',
      '--min-function-statements', '8',
      '--critical-complexity-threshold', '30',
    ]);
    expect(opts.findingsLimit).toBe(10);
    expect(opts.minFunctionStatements).toBe(8);
    expect(opts.criticalComplexityThreshold).toBe(30);
  });

  // ─── Float flags ───────────────────────────────────────────────────────────
  it('parses --secret-entropy-threshold 4.0 and --similarity-threshold 0.9', () => {
    const opts = parseArgs([
      '--secret-entropy-threshold', '4.0',
      '--similarity-threshold', '0.9',
    ]);
    expect(opts.secretEntropyThreshold).toBe(4);
    expect(opts.similarityThreshold).toBe(0.9);
  });

  it('parses float flags with decimal values', () => {
    expect(parseArgs(['--secret-entropy-threshold', '5.5']).secretEntropyThreshold).toBe(5.5);
    expect(parseArgs(['--similarity-threshold', '0.75']).similarityThreshold).toBe(0.75);
  });

  // ─── Special flags (parser, root, out, layer-order) ────────────────────────
  it('parses --parser typescript, --root /some/path, --out result.json, --layer-order ui,service,repo', () => {
    const opts = parseArgs([
      '--parser', 'typescript',
      '--root', '/some/path',
      '--out', 'result.json',
      '--layer-order', 'ui,service,repo',
    ]);
    expect(opts.parser).toBe('typescript');
    expect(opts.root).toBe('/some/path');
    expect(opts.out).toBe('result.json');
    expect(opts.layerOrder).toEqual(['ui', 'service', 'repo']);
  });

  // ─── --out= form ───────────────────────────────────────────────────────────
  it('parses --out=output.json form', () => {
    const opts = parseArgs(['--out=output.json']);
    expect(opts.out).toBe('output.json');
  });

  // ─── --scope: file paths and file:symbol syntax ─────────────────────────────
  it('parses --scope with file paths', () => {
    const opts = parseArgs(['--scope', 'packages/foo,packages/bar']);
    expect(opts.scope).toBeInstanceOf(Array);
    expect(opts.scope!.length).toBe(2);
    expect(opts.scope!.every((p) => p.endsWith('packages/foo') || p.endsWith('packages/bar'))).toBe(true);
  });

  it('parses --scope= with file:symbol syntax', () => {
    const opts = parseArgs(['--scope=packages/foo/session.ts:initSession']);
    expect(opts.scope).toBeInstanceOf(Array);
    expect(opts.scope!.length).toBe(1);
    expect(opts.scopeSymbols).toBeInstanceOf(Map);
    expect(opts.scopeSymbols!.size).toBe(1);
    const symbols = [...opts.scopeSymbols!.values()][0];
    expect(symbols).toContain('initSession');
  });

  it('parses --scope with mixed file paths and file:symbol', () => {
    const opts = parseArgs(['--scope=packages/a,packages/b/utils.ts:helper']);
    expect(opts.scope!.length).toBe(2);
    if (opts.scopeSymbols && opts.scopeSymbols.size > 0) {
      const syms = [...opts.scopeSymbols.values()].flat();
      expect(syms).toContain('helper');
    }
  });

  // ─── --features: pillar and category names ──────────────────────────────────
  it('parses --features with pillar name architecture', () => {
    const opts = parseArgs(['--features=architecture']);
    expect(opts.features).toBeInstanceOf(Set);
    expect(opts.features!.has('dependency-cycle')).toBe(true);
    expect(opts.features!.has('dead-export')).toBe(false);
  });

  it('parses --features with category name dependency-cycle', () => {
    const opts = parseArgs(['--features=dependency-cycle']);
    expect(opts.features!.has('dependency-cycle')).toBe(true);
    expect(opts.features!.size).toBe(1);
  });

  // ─── --exclude: exclude categories ──────────────────────────────────────────
  it('parses --exclude with multiple categories', () => {
    const opts = parseArgs(['--exclude=dead-export,cognitive-complexity']);
    expect(opts.features!.has('dead-export')).toBe(false);
    expect(opts.features!.has('cognitive-complexity')).toBe(false);
    expect(opts.features!.has('dead-re-export')).toBe(true);
  });

  it('parses --exclude with pillar excludes all its categories', () => {
    const opts = parseArgs(['--exclude=architecture']);
    expect(opts.features!.has('dependency-cycle')).toBe(false);
    expect(opts.features!.has('layer-violation')).toBe(false);
  });

  // ─── --features auto-enables includeTests for test-quality categories ───────
  it('--features=excessive-mocking auto-enables includeTests', () => {
    const opts = parseArgs(['--features=excessive-mocking']);
    expect(opts.includeTests).toBe(true);
  });

  it('--features=shared-mutable-state auto-enables includeTests', () => {
    const opts = parseArgs(['--features=shared-mutable-state']);
    expect(opts.includeTests).toBe(true);
  });

  it('throws when --features and --exclude are both provided', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    parseArgs(['--features=architecture', '--exclude=dead-code']);
    expect(consoleSpy).toHaveBeenCalledWith('--features and --exclude are mutually exclusive. Use one or the other.');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('auto-enables includeTests when features include any test-quality category', () => {
    const opts = parseArgs(['--features=missing-mock-restoration']);
    expect(opts.includeTests).toBe(true);
  });
});
