import { describe, expect, it, vi } from 'vitest';

import { parseArgs, HELP_TEXT } from './cli.js';
import { OptionsError } from './create-options.js';
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

  it('parses --scope with Windows absolute paths without splitting drive letters', () => {
    const opts = parseArgs(['--scope=C:\\repo\\pkg\\src\\a.ts']);
    expect(opts.scope).toBeInstanceOf(Array);
    expect(opts.scope).toHaveLength(1);
    expect(opts.scopeSymbols).toBeNull();
    expect(opts.scope![0]).toContain('C:\\repo\\pkg\\src\\a.ts');
  });

  it('parses --scope with Windows absolute path and file:symbol syntax', () => {
    const opts = parseArgs(['--scope=C:\\repo\\pkg\\src\\a.ts:initSession']);
    expect(opts.scope).toBeInstanceOf(Array);
    expect(opts.scope).toHaveLength(1);
    expect(opts.scopeSymbols).toBeInstanceOf(Map);
    const [filePath, symbols] = [...opts.scopeSymbols!.entries()][0];
    expect(filePath).toContain('C:\\repo\\pkg\\src\\a.ts');
    expect(symbols).toEqual(['initSession']);
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

  it('throws OptionsError when --features and --exclude are both provided', () => {
    expect(() =>
      parseArgs(['--features=architecture', '--exclude=dead-code'])
    ).toThrow(OptionsError);
    expect(() =>
      parseArgs(['--features=architecture', '--exclude=dead-code'])
    ).toThrow('mutually exclusive');
  });

  it('exports HELP_TEXT as a constant', () => {
    expect(typeof HELP_TEXT).toBe('string');
    expect(HELP_TEXT).toContain('--root');
    expect(HELP_TEXT).toContain('--scope');
    expect(HELP_TEXT).toContain('--features');
  });

  it('auto-enables includeTests when features include any test-quality category', () => {
    const opts = parseArgs(['--features=missing-mock-restoration']);
    expect(opts.includeTests).toBe(true);
  });

  describe('Tier 1+2 flags', () => {
    it('--affected defaults to HEAD', () => {
      const opts = parseArgs(['--affected']);
      expect(opts.affected).toBe('HEAD');
    });

    it('--affected accepts revision', () => {
      const opts = parseArgs(['--affected', 'main']);
      expect(opts.affected).toBe('main');
    });

    it('--affected=value inline syntax', () => {
      const opts = parseArgs(['--affected=HEAD~3']);
      expect(opts.affected).toBe('HEAD~3');
    });

    it('--save-baseline sets boolean', () => {
      const opts = parseArgs(['--save-baseline']);
      expect(opts.saveBaseline).toBe(true);
    });

    it('--ignore-known defaults to .octocode/baseline.json', () => {
      const opts = parseArgs(['--ignore-known']);
      expect(opts.ignoreKnown).toBe('.octocode/baseline.json');
    });

    it('--ignore-known accepts custom path', () => {
      const opts = parseArgs(['--ignore-known', 'my-baseline.json']);
      expect(opts.ignoreKnown).toBe('my-baseline.json');
    });

    it('--reporter accepts valid formats', () => {
      expect(parseArgs(['--reporter', 'compact']).reporter).toBe('compact');
      expect(parseArgs(['--reporter', 'github-actions']).reporter).toBe('github-actions');
      expect(parseArgs(['--reporter', 'default']).reporter).toBe('default');
    });

    it('--focus sets module path', () => {
      const opts = parseArgs(['--focus', 'src/session.ts']);
      expect(opts.focus).toBe('src/session.ts');
    });

    it('--focus=value inline syntax', () => {
      const opts = parseArgs(['--focus=src/session.ts']);
      expect(opts.focus).toBe('src/session.ts');
    });

    it('--focus-depth sets depth', () => {
      const opts = parseArgs(['--focus-depth', '3']);
      expect(opts.focusDepth).toBe(3);
    });

    it('--collapse sets folder depth', () => {
      const opts = parseArgs(['--collapse', '2']);
      expect(opts.collapse).toBe(2);
    });

    it('--collapse=N inline syntax', () => {
      const opts = parseArgs(['--collapse=3']);
      expect(opts.collapse).toBe(3);
    });

    it('--at-least sets score threshold', () => {
      const opts = parseArgs(['--at-least', '60']);
      expect(opts.atLeast).toBe(60);
    });

    it('--at-least=N inline syntax', () => {
      const opts = parseArgs(['--at-least=75']);
      expect(opts.atLeast).toBe(75);
    });

    it('--config sets config file path', () => {
      const opts = parseArgs(['--config', '.my-config.json']);
      expect(opts.configFile).toBe('.my-config.json');
    });

    it('new flags have correct defaults', () => {
      const opts = parseArgs([]);
      expect(opts.affected).toBeNull();
      expect(opts.saveBaseline).toBe(false);
      expect(opts.ignoreKnown).toBeNull();
      expect(opts.reporter).toBe('default');
      expect(opts.focus).toBeNull();
      expect(opts.focusDepth).toBe(1);
      expect(opts.collapse).toBeNull();
      expect(opts.atLeast).toBeNull();
      expect(opts.configFile).toBeNull();
    });

    it('HELP_TEXT includes new flags', () => {
      expect(HELP_TEXT).toContain('--affected');
      expect(HELP_TEXT).toContain('--save-baseline');
      expect(HELP_TEXT).toContain('--ignore-known');
      expect(HELP_TEXT).toContain('--reporter');
      expect(HELP_TEXT).toContain('--focus');
      expect(HELP_TEXT).toContain('--focus-depth');
      expect(HELP_TEXT).toContain('--collapse');
      expect(HELP_TEXT).toContain('--at-least');
      expect(HELP_TEXT).toContain('--config');
    });

    it('--affected does not consume the next flag as revision', () => {
      const opts = parseArgs(['--affected', '--graph']);
      expect(opts.affected).toBe('HEAD');
      expect(opts.graph).toBe(true);
    });

    it('--ignore-known does not consume the next flag as path', () => {
      const opts = parseArgs(['--ignore-known', '--graph']);
      expect(opts.ignoreKnown).toBe('.octocode/baseline.json');
      expect(opts.graph).toBe(true);
    });
  });

  describe('documented common profiles parse without error', () => {
    it('CI gate profile', () => {
      const opts = parseArgs(['--reporter', 'github-actions', '--at-least', '60']);
      expect(opts.reporter).toBe('github-actions');
      expect(opts.atLeast).toBe(60);
    });

    it('PR diff check profile', () => {
      const opts = parseArgs(['--affected', 'HEAD~1', '--reporter', 'compact']);
      expect(opts.affected).toBe('HEAD~1');
      expect(opts.reporter).toBe('compact');
    });

    it('progressive adoption save profile', () => {
      const opts = parseArgs(['--save-baseline']);
      expect(opts.saveBaseline).toBe(true);
    });

    it('progressive adoption check profile', () => {
      const opts = parseArgs(['--ignore-known', '--at-least', '60']);
      expect(opts.ignoreKnown).toBe('.octocode/baseline.json');
      expect(opts.atLeast).toBe(60);
    });

    it('module zoom profile', () => {
      const opts = parseArgs([
        '--graph',
        '--focus', 'src/session.ts',
        '--focus-depth', '2',
      ]);
      expect(opts.graph).toBe(true);
      expect(opts.focus).toBe('src/session.ts');
      expect(opts.focusDepth).toBe(2);
    });

    it('high-level arch profile', () => {
      const opts = parseArgs(['--graph', '--collapse', '2']);
      expect(opts.graph).toBe(true);
      expect(opts.collapse).toBe(2);
    });

    it('full combination profile', () => {
      const opts = parseArgs([
        '--affected', 'main',
        '--reporter', 'compact',
        '--save-baseline',
        '--at-least', '70',
        '--graph',
        '--focus', 'src/tools',
        '--focus-depth', '3',
        '--config', '.my-scan.json',
      ]);
      expect(opts.affected).toBe('main');
      expect(opts.reporter).toBe('compact');
      expect(opts.saveBaseline).toBe(true);
      expect(opts.atLeast).toBe(70);
      expect(opts.graph).toBe(true);
      expect(opts.focus).toBe('src/tools');
      expect(opts.focusDepth).toBe(3);
      expect(opts.configFile).toBe('.my-scan.json');
    });
  });

  describe('v2 quality threshold flags', () => {
    it('parses --deep-nesting-threshold', () => {
      expect(
        parseArgs(['--deep-nesting-threshold', '8']).thresholds.deepNestingThreshold
      ).toBe(8);
    });

    it('parses --multiple-return-threshold', () => {
      expect(
        parseArgs(['--multiple-return-threshold', '10']).thresholds.multipleReturnThreshold
      ).toBe(10);
    });

    it('parses --magic-string-min-occurrences', () => {
      expect(
        parseArgs(['--magic-string-min-occurrences', '5']).thresholds.magicStringMinOccurrences
      ).toBe(5);
    });

    it('parses --boolean-param-threshold', () => {
      expect(
        parseArgs(['--boolean-param-threshold', '4']).thresholds.booleanParamThreshold
      ).toBe(4);
    });

    it('defaults are correct for new thresholds', () => {
      const opts = parseArgs([]);
      expect(opts.thresholds.deepNestingThreshold).toBe(5);
      expect(opts.thresholds.multipleReturnThreshold).toBe(6);
      expect(opts.thresholds.magicStringMinOccurrences).toBe(3);
      expect(opts.thresholds.booleanParamThreshold).toBe(3);
    });

    it('warns on unknown flags', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      parseArgs(['--sematic']);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknown flag'));
      spy.mockRestore();
    });

    it('new threshold flags appear in HELP_TEXT', () => {
      expect(HELP_TEXT).toContain('--deep-nesting-threshold');
      expect(HELP_TEXT).toContain('--multiple-return-threshold');
      expect(HELP_TEXT).toContain('--magic-string-min-occurrences');
      expect(HELP_TEXT).toContain('--boolean-param-threshold');
    });
  });
});
