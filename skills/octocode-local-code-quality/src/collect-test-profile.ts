import * as ts from 'typescript';

import { getLineAndCharacter } from './utils.js';

import type {
  CodeLocation,
  FileEntry,
  MockControlCall,
  TestBlock,
  TestProfile,
} from './types.js';

const ASSERTION_PATTERNS = new Set(['expect', 'assert', 'should']);
const MOCK_PATTERNS = [
  'jest.mock',
  'vi.mock',
  'sinon.stub',
  'jest.spyOn',
  'vi.spyOn',
  'sinon.mock',
];
const RESTORE_PATTERNS = new Set([
  'jest.restoreAllMocks',
  'vi.restoreAllMocks',
]);
const SETUP_PATTERNS = new Set([
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
]);
const FOCUSED_PATTERNS = new Set([
  'it.only',
  'test.only',
  'describe.only',
  'it.skip',
  'test.skip',
  'describe.skip',
  'it.todo',
  'test.todo',
]);
const USE_FAKE_TIMER_PATTERNS = new Set([
  'jest.useFakeTimers',
  'vi.useFakeTimers',
]);
const USE_REAL_TIMER_PATTERNS = new Set([
  'jest.useRealTimers',
  'vi.useRealTimers',
]);

function getSpyOrStubKind(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): MockControlCall['kind'] | undefined {
  if (!ts.isPropertyAccessExpression(call.expression)) return undefined;
  const methodName = call.expression.name.getText(sourceFile);
  const receiver = call.expression.expression.getText(sourceFile);

  if ((receiver === 'jest' || receiver === 'vi') && methodName === 'spyOn')
    return 'spy';
  if (receiver === 'sinon' && (methodName === 'stub' || methodName === 'mock'))
    return 'stub';
  return undefined;
}

function getMockControlTarget(
  node: ts.Node,
  sourceFile: ts.SourceFile
): string | undefined {
  let current = node;
  while (current.parent) {
    const parent = current.parent;

    if (
      ts.isVariableDeclaration(parent) &&
      parent.initializer === current &&
      ts.isIdentifier(parent.name)
    ) {
      return parent.name.getText(sourceFile);
    }

    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      parent.right === current
    ) {
      return parent.left.getText(sourceFile).trim();
    }

    current = parent;
  }

  return undefined;
}

function getMockRestoreTarget(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile
): string | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  return node.expression.expression.getText(sourceFile).trim();
}

export function collectTestProfile(
  sourceFile: ts.SourceFile,
  fileRelative: string,
  fileEntry: FileEntry
): void {
  const testBlocks: TestBlock[] = [];
  const mockCalls: CodeLocation[] = [];
  const setupCalls: TestProfile['setupCalls'] = [];
  const mutableStateDecls: CodeLocation[] = [];
  const focusedCalls: TestProfile['focusedCalls'] = [];
  const timerControls: TestProfile['timerControls'] = [];
  const mockRestores: TestProfile['mockRestores'] = [];
  const spyOrStubCalls: TestProfile['spyOrStubCalls'] = [];

  const visit = (
    node: ts.Node,
    insideDescribe: boolean,
    insideTest: boolean
  ): void => {
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);

      if (FOCUSED_PATTERNS.has(callText)) {
        const loc = getLineAndCharacter(sourceFile, node);
        focusedCalls.push({
          kind: callText as TestProfile['focusedCalls'][0]['kind'],
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }

      if (
        (callText === 'it' ||
          callText === 'test' ||
          callText === 'it.only' ||
          callText === 'test.only') &&
        node.arguments.length >= 2
      ) {
        const nameArg = node.arguments[0];
        const name = ts.isStringLiteral(nameArg) ? nameArg.text : callText;
        const body = node.arguments[1];
        const loc = getLineAndCharacter(sourceFile, node);
        let assertionCount = 0;
        const countAssertions = (n: ts.Node): void => {
          if (ts.isCallExpression(n)) {
            const t = n.expression.getText(sourceFile);
            if (
              ASSERTION_PATTERNS.has(t.split('.')[0]) ||
              t.includes('.to.') ||
              t.includes('.should')
            )
              assertionCount++;
          }
          ts.forEachChild(n, countAssertions);
        };
        ts.forEachChild(body, countAssertions);
        testBlocks.push({
          name,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
          assertionCount,
        });
        ts.forEachChild(node, child => visit(child, insideDescribe, true));
        return;
      }

      if (
        MOCK_PATTERNS.some(p => callText === p || callText.startsWith(p + '('))
      ) {
        const loc = getLineAndCharacter(sourceFile, node);
        mockCalls.push({
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
        const spyOrStubKind = getSpyOrStubKind(node, sourceFile);
        if (spyOrStubKind) {
          spyOrStubCalls.push({
            kind: spyOrStubKind,
            file: fileRelative,
            lineStart: loc.lineStart,
            lineEnd: loc.lineEnd,
            target: getMockControlTarget(node, sourceFile),
          });
        }
      }

      if (USE_FAKE_TIMER_PATTERNS.has(callText)) {
        const loc = getLineAndCharacter(sourceFile, node);
        timerControls.push({
          kind: callText as TestProfile['timerControls'][0]['kind'],
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }

      if (USE_REAL_TIMER_PATTERNS.has(callText)) {
        const loc = getLineAndCharacter(sourceFile, node);
        timerControls.push({
          kind: callText as TestProfile['timerControls'][0]['kind'],
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }

      if (RESTORE_PATTERNS.has(callText)) {
        const loc = getLineAndCharacter(sourceFile, node);
        mockRestores.push({
          kind: 'restoreAll',
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      } else if (callText.endsWith('.mockRestore')) {
        const loc = getLineAndCharacter(sourceFile, node);
        mockRestores.push({
          kind: 'restore',
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
          target: getMockRestoreTarget(node, sourceFile),
        });
      }

      if (SETUP_PATTERNS.has(callText)) {
        const loc = getLineAndCharacter(sourceFile, node);
        setupCalls.push({
          kind: callText as TestProfile['setupCalls'][0]['kind'],
          lineStart: loc.lineStart,
        });
      }

      if (callText === 'describe' || callText === 'describe.only') {
        ts.forEachChild(node, child => visit(child, true, insideTest));
        return;
      }
    }

    if (insideDescribe && !insideTest && ts.isVariableStatement(node)) {
      const decl = node.declarationList;
      if (decl.flags & ts.NodeFlags.Let || !(decl.flags & ts.NodeFlags.Const)) {
        const loc = getLineAndCharacter(sourceFile, node);
        mutableStateDecls.push({
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }
    }

    ts.forEachChild(node, child => visit(child, insideDescribe, insideTest));
  };

  ts.forEachChild(sourceFile, child => visit(child, false, false));

  fileEntry.testProfile = {
    testBlocks,
    mockCalls,
    setupCalls,
    mutableStateDecls,
    focusedCalls,
    timerControls,
    mockRestores,
    spyOrStubCalls,
  };
}
