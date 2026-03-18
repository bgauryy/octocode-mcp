import { describe, expect, it } from 'vitest';
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

  it('--type-hierarchy-threshold sets threshold', () => {
    const opts = parseArgs(['--type-hierarchy-threshold', '6']);
    expect(opts.typeHierarchyThreshold).toBe(6);
  });

  it('--override-chain-threshold sets threshold', () => {
    const opts = parseArgs(['--override-chain-threshold', '5']);
    expect(opts.overrideChainThreshold).toBe(5);
  });

  it('NaN guards for semantic thresholds', () => {
    const opts = parseArgs(['--type-hierarchy-threshold', 'abc', '--override-chain-threshold', 'xyz']);
    expect(opts.typeHierarchyThreshold).toBe(4);
    expect(opts.overrideChainThreshold).toBe(3);
  });
});
