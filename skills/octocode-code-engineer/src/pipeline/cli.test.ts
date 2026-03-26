import { describe, expect, it, vi } from 'vitest';

import { parseArgs, printHelp } from './cli.js';
import { DEFAULT_OPTS } from '../types/index.js';

describe('parseArgs', () => {
  it('returns defaults when no args given', () => {
    const opts = parseArgs([]);
    expect(opts.json).toBe(false);
    expect(opts.includeTests).toBe(false);
    expect(opts.emitTree).toBe(true);
    expect(opts.graph).toBe(false);
    expect(opts.parser).toBe('auto');
    expect(opts.findingsLimit).toBe(Infinity);
    expect(opts.thresholds.minFunctionStatements).toBe(6);
    expect(opts.thresholds.minFlowStatements).toBe(6);
    expect(opts.thresholds.criticalComplexityThreshold).toBe(30);
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
    expect(parseArgs(['--out', '/tmp/report.json']).out).toBe(
      '/tmp/report.json'
    );
    expect(parseArgs(['--out=/tmp/report.json']).out).toBe('/tmp/report.json');
  });

  it('parses --findings-limit', () => {
    expect(parseArgs(['--findings-limit', '500']).findingsLimit).toBe(500);
  });

  it('parses --min-function-statements', () => {
    expect(
      parseArgs(['--min-function-statements', '12']).thresholds.minFunctionStatements
    ).toBe(12);
  });

  it('parses --min-flow-statements', () => {
    expect(parseArgs(['--min-flow-statements', '8']).thresholds.minFlowStatements).toBe(8);
  });

  it('parses --critical-complexity-threshold', () => {
    expect(
      parseArgs(['--critical-complexity-threshold', '25'])
        .thresholds.criticalComplexityThreshold
    ).toBe(25);
  });

  it('parses --deep-link-topn', () => {
    expect(parseArgs(['--deep-link-topn', '30']).deepLinkTopN).toBe(30);
  });

  it('parses --tree-depth', () => {
    expect(parseArgs(['--tree-depth', '6']).treeDepth).toBe(6);
  });

  it('parses --coupling-threshold', () => {
    expect(parseArgs(['--coupling-threshold', '20']).thresholds.couplingThreshold).toBe(
      20
    );
  });

  it('parses --fan-in-threshold', () => {
    expect(parseArgs(['--fan-in-threshold', '25']).thresholds.fanInThreshold).toBe(25);
  });

  it('parses --fan-out-threshold', () => {
    expect(parseArgs(['--fan-out-threshold', '18']).thresholds.fanOutThreshold).toBe(18);
  });

  it('parses --god-module-statements', () => {
    expect(
      parseArgs(['--god-module-statements', '600']).thresholds.godModuleStatements
    ).toBe(600);
  });

  it('parses --god-module-exports', () => {
    expect(parseArgs(['--god-module-exports', '30']).thresholds.godModuleExports).toBe(30);
  });

  it('parses --god-function-statements', () => {
    expect(
      parseArgs(['--god-function-statements', '150']).thresholds.godFunctionStatements
    ).toBe(150);
  });

  it('parses --cognitive-complexity-threshold', () => {
    expect(
      parseArgs(['--cognitive-complexity-threshold', '20'])
        .thresholds.cognitiveComplexityThreshold
    ).toBe(20);
  });

  it('parses --barrel-symbol-threshold', () => {
    expect(
      parseArgs(['--barrel-symbol-threshold', '50']).thresholds.barrelSymbolThreshold
    ).toBe(50);
  });

  it('parses --layer-order as comma-separated list', () => {
    const opts = parseArgs(['--layer-order', 'ui,service,repository']);
    expect(opts.thresholds.layerOrder).toEqual(['ui', 'service', 'repository']);
  });

  it('trims whitespace in --layer-order values', () => {
    const opts = parseArgs(['--layer-order', ' ui , service , repo ']);
    expect(opts.thresholds.layerOrder).toEqual(['ui', 'service', 'repo']);
  });

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
      '--findings-limit',
      'abc',
      '--coupling-threshold',
      'xyz',
      '--fan-in-threshold',
      '',
      '--fan-out-threshold',
      'NaN',
      '--god-module-statements',
      'bad',
      '--god-module-exports',
      'nope',
      '--god-function-statements',
      'err',
      '--cognitive-complexity-threshold',
      'x',
      '--barrel-symbol-threshold',
      '!!',
      '--min-function-statements',
      'no',
      '--min-flow-statements',
      'no',
      '--critical-complexity-threshold',
      'no',
      '--deep-link-topn',
      'no',
      '--tree-depth',
      'no',
    ]);
    expect(opts.findingsLimit).toBe(DEFAULT_OPTS.findingsLimit);
    expect(opts.thresholds.couplingThreshold).toBe(DEFAULT_OPTS.thresholds.couplingThreshold);
    expect(opts.thresholds.fanInThreshold).toBe(DEFAULT_OPTS.thresholds.fanInThreshold);
    expect(opts.thresholds.fanOutThreshold).toBe(DEFAULT_OPTS.thresholds.fanOutThreshold);
    expect(opts.thresholds.godModuleStatements).toBe(DEFAULT_OPTS.thresholds.godModuleStatements);
    expect(opts.thresholds.godModuleExports).toBe(DEFAULT_OPTS.thresholds.godModuleExports);
    expect(opts.thresholds.godFunctionStatements).toBe(DEFAULT_OPTS.thresholds.godFunctionStatements);
    expect(opts.thresholds.cognitiveComplexityThreshold).toBe(
      DEFAULT_OPTS.thresholds.cognitiveComplexityThreshold
    );
    expect(opts.thresholds.barrelSymbolThreshold).toBe(DEFAULT_OPTS.thresholds.barrelSymbolThreshold);
    expect(opts.thresholds.minFunctionStatements).toBe(DEFAULT_OPTS.thresholds.minFunctionStatements);
    expect(opts.thresholds.minFlowStatements).toBe(DEFAULT_OPTS.thresholds.minFlowStatements);
    expect(opts.thresholds.criticalComplexityThreshold).toBe(
      DEFAULT_OPTS.thresholds.criticalComplexityThreshold
    );
    expect(opts.deepLinkTopN).toBe(DEFAULT_OPTS.deepLinkTopN);
    expect(opts.treeDepth).toBe(DEFAULT_OPTS.treeDepth);
  });

  it('handles multiple flags together', () => {
    const opts = parseArgs([
      '--json',
      '--include-tests',
      '--no-tree',
      '--graph',
      '--parser',
      'typescript',
      '--findings-limit',
      '100',
      '--coupling-threshold',
      '10',
      '--layer-order',
      'a,b,c',
    ]);
    expect(opts.json).toBe(true);
    expect(opts.includeTests).toBe(true);
    expect(opts.emitTree).toBe(false);
    expect(opts.graph).toBe(true);
    expect(opts.parser).toBe('typescript');
    expect(opts.findingsLimit).toBe(100);
    expect(opts.thresholds.couplingThreshold).toBe(10);
    expect(opts.thresholds.layerOrder).toEqual(['a', 'b', 'c']);
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
    expect(opts.thresholds.overrideChainThreshold).toBe(5);
  });

  it('NaN guards for semantic thresholds', () => {
    const opts = parseArgs(['--override-chain-threshold', 'xyz']);
    expect(opts.thresholds.overrideChainThreshold).toBe(3);
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

  it('parses --findings-limit 10, --min-function-statements 8, --critical-complexity-threshold 30', () => {
    const opts = parseArgs([
      '--findings-limit',
      '10',
      '--min-function-statements',
      '8',
      '--critical-complexity-threshold',
      '30',
    ]);
    expect(opts.findingsLimit).toBe(10);
    expect(opts.thresholds.minFunctionStatements).toBe(8);
    expect(opts.thresholds.criticalComplexityThreshold).toBe(30);
  });

  it('parses --secret-entropy-threshold 4.0 and --similarity-threshold 0.9', () => {
    const opts = parseArgs([
      '--secret-entropy-threshold',
      '4.0',
      '--similarity-threshold',
      '0.9',
    ]);
    expect(opts.thresholds.secretEntropyThreshold).toBe(4);
    expect(opts.thresholds.similarityThreshold).toBe(0.9);
  });

  it('parses float flags with decimal values', () => {
    expect(
      parseArgs(['--secret-entropy-threshold', '5.5']).thresholds.secretEntropyThreshold
    ).toBe(5.5);
    expect(
      parseArgs(['--similarity-threshold', '0.75']).thresholds.similarityThreshold
    ).toBe(0.75);
  });

  it('parses --parser typescript, --root /some/path, --out result.json, --layer-order ui,service,repo', () => {
    const opts = parseArgs([
      '--parser',
      'typescript',
      '--root',
      '/some/path',
      '--out',
      'result.json',
      '--layer-order',
      'ui,service,repo',
    ]);
    expect(opts.parser).toBe('typescript');
    expect(opts.root).toBe('/some/path');
    expect(opts.out).toBe('result.json');
    expect(opts.thresholds.layerOrder).toEqual(['ui', 'service', 'repo']);
  });

  it('parses --out=output.json form', () => {
    const opts = parseArgs(['--out=output.json']);
    expect(opts.out).toBe('output.json');
  });

  it('parses --scope with file paths', () => {
    const opts = parseArgs(['--scope', 'packages/foo,packages/bar']);
    expect(opts.scope).toBeInstanceOf(Array);
    expect(opts.scope!.length).toBe(2);
    expect(
      opts.scope!.every(
        p => p.endsWith('packages/foo') || p.endsWith('packages/bar')
      )
    ).toBe(true);
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

  it('--features=excessive-mocking auto-enables includeTests', () => {
    const opts = parseArgs(['--features=excessive-mocking']);
    expect(opts.includeTests).toBe(true);
  });

  it('--features=shared-mutable-state auto-enables includeTests', () => {
    const opts = parseArgs(['--features=shared-mutable-state']);
    expect(opts.includeTests).toBe(true);
  });

  it('throws when --features and --exclude are both provided', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    parseArgs(['--features=architecture', '--exclude=dead-code']);
    expect(consoleSpy).toHaveBeenCalledWith(
      '--features and --exclude are mutually exclusive. Use one or the other.'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('auto-enables includeTests when features include any test-quality category', () => {
    const opts = parseArgs(['--features=missing-mock-restoration']);
    expect(opts.includeTests).toBe(true);
  });

  it('errors on unknown flags instead of silently ignoring', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    parseArgs(['--grph']);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Unknown flag: --grph. Run with --help for usage.'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('errors on unexpected positional arguments', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    parseArgs(['unexpected']);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Unexpected argument: unexpected. Run with --help for usage.'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('errors when --scope is provided without a value', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    parseArgs(['--scope']);
    expect(consoleSpy).toHaveBeenCalledWith('Missing value for --scope');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('shows help when -h is provided where a value is expected', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    parseArgs(['--scope', '-h']);
    expect(logSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('shows help when --help is provided where a value is expected', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    parseArgs(['--scope', '--help']);
    expect(logSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('errors when option-like token is used as non-numeric value', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    parseArgs(['--scope', '-x']);
    expect(consoleSpy).toHaveBeenCalledWith('Missing value for --scope');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('parses Windows-style --scope=file:symbol', () => {
    const opts = parseArgs(['--scope=C:/repo/src/session.ts:initSession']);
    expect(opts.scope).toBeInstanceOf(Array);
    expect(opts.scopeSymbols).toBeInstanceOf(Map);
    expect(opts.scopeSymbols!.size).toBe(1);
    const symbols = [...opts.scopeSymbols!.values()][0];
    expect(symbols).toContain('initSession');
  });

  it('does not parse bare Windows drive paths as file:symbol', () => {
    const opts = parseArgs(['--scope=C:/repo/src/session.ts']);
    expect(opts.scope).toBeInstanceOf(Array);
    expect(opts.scope![0]).toMatch(/C:\/repo\/src\/session\.ts$/);
    expect(opts.scopeSymbols).toBeNull();
  });
});

describe('printHelp', () => {
  it('prints the runtime entrypoint and semantic category count', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printHelp();
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('node scripts/run.js [options]');
    expect(output).toContain('Adds 12 categories');
    logSpy.mockRestore();
  });
});
