import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  blockContainsCall,
  collectTopLevelEffects,
  findParentBlock,
} from './collect-effects.js';

function parse(code: string, fileName = '/repo/src/test.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true);
}

// ─── collectTopLevelEffects ──────────────────────────────────────────────────

describe('collectTopLevelEffects', () => {
  describe('effect kinds', () => {
    it('detects side-effect-import (bare import)', () => {
      const src = parse("import './polyfill';");
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'side-effect-import',
        detail: "import './polyfill'",
        weight: 3,
        confidence: 'medium',
      });
    });

    it('detects top-level-await', () => {
      const src = parse('await fetch("/api");');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'top-level-await',
        detail: 'top-level await',
        weight: 4,
        confidence: 'high',
      });
    });

    it('detects top-level-await inside control flow (scanNodeForEffects path)', () => {
      const src = parse('if (true) { await Promise.resolve(); }');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'top-level-await',
        detail: 'top-level await',
        weight: 4,
        confidence: 'high',
      });
    });

    it('detects eval()', () => {
      const src = parse('eval("1+1");');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'eval',
        detail: 'eval()',
        weight: 8,
        confidence: 'high',
      });
    });

    it('detects Function() call', () => {
      const src = parse('Function("return 1");');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'eval',
        detail: 'Function()',
        weight: 8,
        confidence: 'high',
      });
    });

    it('detects new Function()', () => {
      const src = parse('new Function("return 1");');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'eval',
        detail: 'new Function()',
        weight: 8,
        confidence: 'high',
      });
    });

    it('detects setTimeout (timer)', () => {
      const src = parse('setTimeout(() => {}, 0);');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'timer',
        detail: 'setTimeout()',
        weight: 4,
        confidence: 'high',
      });
    });

    it('detects setInterval (timer)', () => {
      const src = parse('setInterval(() => {}, 1000);');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'timer',
        detail: 'setInterval()',
        weight: 4,
        confidence: 'high',
      });
    });

    it('detects execSync (exec-sync)', () => {
      const src = parse('const out = require("child_process").execSync("ls");');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'exec-sync',
        weight: 8,
        confidence: 'high',
      });
    });

    it('detects execFileSync (exec-sync)', () => {
      const src = parse('const cp = require("child_process"); const x = cp.execFileSync("ls");');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'exec-sync',
        weight: 8,
        confidence: 'high',
      });
    });

    it('detects readFileSync (sync-io)', () => {
      const src = parse('const fs = require("fs"); const data = fs.readFileSync("/path", "utf8");');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'sync-io',
        weight: 5,
        confidence: 'high',
      });
    });

    it('detects writeFileSync (sync-io)', () => {
      const src = parse('const fs = require("fs"); fs.writeFileSync("/tmp/x", "data");');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'sync-io',
        weight: 5,
        confidence: 'high',
      });
    });

    it('detects process.on (process-handler)', () => {
      const src = parse('process.on("uncaughtException", () => {});');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'process-handler',
        detail: 'process.on()',
        weight: 4,
        confidence: 'high',
      });
    });

    it('detects process.once (process-handler)', () => {
      const src = parse('process.once("SIGINT", () => {});');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'process-handler',
        detail: 'process.once()',
        weight: 4,
        confidence: 'high',
      });
    });

    it('detects process.addListener (process-handler)', () => {
      const src = parse('process.addListener("exit", () => {});');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'process-handler',
        detail: 'process.addListener()',
        weight: 4,
        confidence: 'high',
      });
    });

    it('detects addEventListener (listener)', () => {
      const src = parse('window.addEventListener("load", () => {});');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'listener',
        detail: 'window.addEventListener()',
        weight: 4,
        confidence: 'medium',
      });
    });

    it('detects .on (listener, non-process)', () => {
      const src = parse('emitter.on("event", () => {});');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'listener',
        weight: 4,
        confidence: 'medium',
      });
    });

    it('detects dynamic import()', () => {
      const src = parse("import('./lazy');");
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        kind: 'dynamic-import',
        detail: 'dynamic import()',
        weight: 3,
        confidence: 'medium',
      });
    });
  });

  describe('edge cases - no effects', () => {
    it('empty file produces no effects', () => {
      const src = parse('');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });

    it('regular import (with binding) does NOT produce side-effect-import', () => {
      const src = parse("import path from 'node:path';");
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });

    it('import { x } does NOT produce side-effect-import', () => {
      const src = parse("import { foo } from './bar';");
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });

    it('function declaration does NOT produce effects', () => {
      const src = parse('function f() { fs.readFileSync("/path"); }');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });

    it('class declaration does NOT produce effects', () => {
      const src = parse('class C { m() { setTimeout(() => {}, 0); } }');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });

    it('arrow function in variable does NOT produce effects', () => {
      const src = parse('const f = () => { eval("1"); };');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });
  });

  describe('variable initializers', () => {
    it('variable initializer with call expression', () => {
      const src = parse('const fs = require("fs"); const data = fs.readFileSync("/path", "utf8");');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0].kind).toBe('sync-io');
    });

    it('binary expression with call on right side (assignment)', () => {
      const src = parse('x = setTimeout(() => {}, 0);');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ kind: 'timer', detail: 'setTimeout()' });
    });

    it('variable initializer as binary with call on right', () => {
      const src = parse('let y; const x = y = eval("1");');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0].kind).toBe('eval');
    });
  });

  describe('top-level control flow (scanNodeForEffects)', () => {
    it('if statement with call inside', () => {
      const src = parse('if (true) { setTimeout(() => {}, 0); }');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ kind: 'timer' });
    });

    it('for statement with call inside', () => {
      const src = parse('for (let i = 0; i < 1; i++) { eval("1"); }');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ kind: 'eval' });
    });

    it('while statement with call inside', () => {
      const src = parse('while (false) { new Function("1"); }');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ kind: 'eval', detail: 'new Function()' });
    });

    it('switch statement with call inside', () => {
      const src = parse('switch (1) { case 1: setInterval(() => {}, 100); break; }');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ kind: 'timer' });
    });

    it('try statement with call inside', () => {
      const src = parse('try { process.on("exit", () => {}); } catch {}');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ kind: 'process-handler' });
    });

    it('do-while with call inside', () => {
      const src = parse('const cp = require("child_process"); do { cp.execSync("ls"); } while (false);');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ kind: 'exec-sync' });
    });

    it('for-of with call inside', () => {
      const src = parse('const fs = require("fs"); for (const x of []) { fs.readFileSync("/x"); }');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ kind: 'sync-io' });
    });

    it('for-in with call inside', () => {
      const src = parse('for (const k in {}) { document.addEventListener("click", () => {}); }');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ kind: 'listener' });
    });
  });

  describe('skipped statement types', () => {
    it('skips export declaration', () => {
      const src = parse("export { x } from './a';");
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });

    it('skips type alias', () => {
      const src = parse('type T = string;');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });

    it('skips interface declaration', () => {
      const src = parse('interface I {}');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });

    it('skips enum declaration', () => {
      const src = parse('enum E { A }');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });

    it('skips module declaration', () => {
      const src = parse('declare module "x" {}');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects).toHaveLength(0);
    });
  });

  describe('process.on with different event names', () => {
    it('detects process.on("uncaughtException")', () => {
      const src = parse('process.on("uncaughtException", () => {});');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects[0]).toMatchObject({ kind: 'process-handler' });
    });

    it('detects process.on("SIGTERM")', () => {
      const src = parse('process.on("SIGTERM", () => {});');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects[0]).toMatchObject({ kind: 'process-handler' });
    });

    it('detects process.on("exit")', () => {
      const src = parse('process.on("exit", () => {});');
      const effects = collectTopLevelEffects(src, 'src/test.ts');
      expect(effects[0]).toMatchObject({ kind: 'process-handler' });
    });
  });
});

// ─── findParentBlock ─────────────────────────────────────────────────────────

describe('findParentBlock', () => {
  it('returns Block when node is inside a block', () => {
    const src = parse('function f() { const x = 1; }');
    const fn = src.statements[0] as ts.FunctionDeclaration;
    const block = fn.body!;
    const stmt = block.statements[0];
    expect(findParentBlock(stmt)).toBe(block);
  });

  it('returns SourceFile when node is top-level statement', () => {
    const src = parse('const x = 1;');
    const stmt = src.statements[0];
    expect(findParentBlock(stmt)).toBe(src);
  });

  it('returns null when node has no parent (e.g. SourceFile)', () => {
    const src = parse('const x = 1;');
    // SourceFile has no parent; passing it yields null
    expect(findParentBlock(src)).toBe(null);
  });

  it('returns Block for node nested inside block', () => {
    const src = parse('if (true) { if (false) { setTimeout(() => {}); } }');
    const outerIf = src.statements[0] as ts.IfStatement;
    const outerBlock = outerIf.thenStatement as ts.Block;
    const innerIf = outerBlock.statements[0] as ts.IfStatement;
    const innerBlock = innerIf.thenStatement as ts.Block;
    const callStmt = innerBlock.statements[0] as ts.ExpressionStatement;
    expect(findParentBlock(callStmt)).toBe(innerBlock);
  });
});

// ─── blockContainsCall ───────────────────────────────────────────────────────

describe('blockContainsCall', () => {
  it('returns true when block contains call with given name', () => {
    const src = parse('function f() { setTimeout(() => {}, 0); }');
    const fn = src.statements[0] as ts.FunctionDeclaration;
    const block = fn.body!;
    expect(blockContainsCall(block, src, 'setTimeout')).toBe(true);
  });

  it('returns false when block does not contain call with given name', () => {
    const src = parse('function f() { setInterval(() => {}, 0); }');
    const fn = src.statements[0] as ts.FunctionDeclaration;
    const block = fn.body!;
    expect(blockContainsCall(block, src, 'setTimeout')).toBe(false);
  });

  it('returns true for nested call', () => {
    const src = parse('function f() { if (true) { eval("1"); } }');
    const fn = src.statements[0] as ts.FunctionDeclaration;
    const block = fn.body!;
    expect(blockContainsCall(block, src, 'eval')).toBe(true);
  });

  it('returns false for empty block', () => {
    const src = parse('function f() {}');
    const fn = src.statements[0] as ts.FunctionDeclaration;
    const block = fn.body!;
    expect(blockContainsCall(block, src, 'setTimeout')).toBe(false);
  });

    it('returns true when call is in variable initializer', () => {
    const src = parse('const fs = require("fs"); function f() { const x = fs.readFileSync("/x"); }');
    const fn = src.statements[1] as ts.FunctionDeclaration;
    const block = fn.body!;
    expect(blockContainsCall(block, src, 'fs.readFileSync')).toBe(true);
  });
});
