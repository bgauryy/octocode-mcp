import * as ts from 'typescript';

import { canAddFinding } from './shared.js';
import { isTestFile } from '../common/utils.js';

import type { FindingDraft } from './shared.js';
import type {
  DuplicateGroup,
  FileEntry,
  Finding,
  RedundantFlowGroup,
} from '../types/index.js';

export function detectDuplicateFunctionBodies(
  duplicates: DuplicateGroup[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const group of duplicates) {
    const sample = group.locations[0];
    const reason =
      `Same ${group.kind} body shape appears in ${group.occurrences} places (` +
      `${group.filesCount} file${group.filesCount > 1 ? 's' : ''}).`;
    const severity: Finding['severity'] =
      group.occurrences >= 6
        ? 'high'
        : group.occurrences >= 3
          ? 'medium'
          : 'low';
    if (!canAddFinding(findings)) break;
    findings.push({
      ...sample,
      severity,
      category: 'duplicate-function-body',
      title: `Deduplicate function body: ${group.signature}`,
      reason,
      files: group.locations.map(
        loc => `${loc.file}:${loc.lineStart}-${loc.lineEnd}`
      ),
      suggestedFix: {
        strategy:
          'Create a shared helper function once and replace duplicate call sites.',
        steps: [
          'Extract one function to a dedicated utility module.',
          'Keep behavior unchanged by passing function-specific differences as params.',
          'Replace duplicated blocks with calls to the shared helper.',
          'Add/extend tests around each entry point that previously used duplicates.',
        ],
      },
      impact: `Lower maintenance cost and reduce regression risk when behavior changes.`,
      tags: ['duplication', 'maintainability', 'dryness'],
      lspHints: [
        {
          tool: 'lspGotoDefinition',
          symbolName: group.signature,
          lineHint: sample.lineStart,
          file: sample.file,
          expectedResult: `navigate to one instance to compare implementations side-by-side`,
        },
      ],
    });
  }
  return findings;
}

export function detectDuplicateFlowStructures(
  controlDuplicates: RedundantFlowGroup[],
  flowDupThreshold: number
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const group of controlDuplicates) {
    if (group.occurrences < flowDupThreshold) continue;
    const sample = group.locations[0];
    const reason = `${group.kind} structure appears ${group.occurrences} times across ${group.filesCount} file(s).`;
    const severity: Finding['severity'] =
      group.occurrences >= 10 ? 'high' : 'medium';
    if (!canAddFinding(findings)) break;
    findings.push({
      ...sample,
      severity,
      category: 'duplicate-flow-structure',
      title: `Extract repeated flow structure: ${group.kind}`,
      reason,
      files: group.locations.map(
        loc => `${loc.file}:${loc.lineStart}-${loc.lineEnd}`
      ),
      suggestedFix: {
        strategy:
          'Extract a reusable flow helper around the repeated structure.',
        steps: [
          'Create one clear helper that accepts varying inputs as parameters.',
          'Call helper from each repeated site.',
          'Keep variable names aligned and add local adapter logic where needed.',
          'Document expected invariants for the shared flow.',
        ],
      },
      impact: `Reduces duplicate control branches and normalizes edge-case handling.`,
      tags: ['duplication', 'control-flow', 'dryness'],
    });
  }
  return findings;
}

export function detectFunctionOptimization(
  fileSummaries: FileEntry[],
  criticalComplexityThreshold: number
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const fileEntry of fileSummaries) {
    for (const fn of fileEntry.functions) {
      const alerts: string[] = [];
      if (fn.complexity >= criticalComplexityThreshold)
        alerts.push(
          `Cyclomatic-like complexity is high (>=${criticalComplexityThreshold}).`
        );
      if (fn.maxBranchDepth >= 7)
        alerts.push('Branch depth is very deep and hard to reason about.');
      if (fn.maxLoopDepth >= 4)
        alerts.push('Nested loops are high and likely expensive.');
      if (fn.statementCount >= 24)
        alerts.push(
          'Function body is large and may be doing multiple responsibilities.'
        );

      if (alerts.length === 0) continue;

      const isHigh =
        fn.complexity >= criticalComplexityThreshold ||
        fn.maxBranchDepth >= 7 ||
        fn.maxLoopDepth >= 4;
      findings.push({
        ...fn,
        severity: isHigh ? 'high' : 'medium',
        category: 'function-optimization',
        title: `Potential function refactor: ${fn.name}`,
        reason: alerts.join(' '),
        files: [`${fn.file}:${fn.lineStart}-${fn.lineEnd}`],
        suggestedFix: {
          strategy: 'Refactor for readability and testability.',
          steps: [
            'Split into smaller subroutines with single responsibilities.',
            'Convert deeply nested branches into guard clauses when safe.',
            'Replace loops with intent-specific helpers if one loop owns most lines.',
            'Add unit coverage for each extracted piece before deleting old logic.',
          ],
        },
        impact: 'Cleaner flow, easier review and safer refactors.',
        tags: ['complexity', 'readability', 'refactor'],
        lspHints: [
          {
            tool: 'lspCallHierarchy',
            symbolName: fn.name,
            lineHint: fn.lineStart,
            file: fn.file,
            expectedResult: `inspect callers and callees to plan safe decomposition of ${fn.name}`,
          },
        ],
      });
    }
  }
  return findings;
}

export function computeCognitiveComplexity(node: ts.Node): number {
  let total = 0;

  const visit = (current: ts.Node, nesting: number): void => {
    let increment = 0;
    let nestable = false;

    switch (current.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.SwitchStatement:
        increment = 1;
        nestable = true;
        break;
      default:
        break;
    }

    if (
      current.kind === ts.SyntaxKind.BinaryExpression &&
      ((current as ts.BinaryExpression).operatorToken.kind ===
        ts.SyntaxKind.AmpersandAmpersandToken ||
        (current as ts.BinaryExpression).operatorToken.kind ===
          ts.SyntaxKind.BarBarToken ||
        (current as ts.BinaryExpression).operatorToken.kind ===
          ts.SyntaxKind.QuestionQuestionToken)
    ) {
      increment = 1;
    }

    if (
      current.kind === ts.SyntaxKind.IfStatement &&
      current.parent &&
      ts.isIfStatement(current.parent) &&
      current.parent.elseStatement === current
    ) {
      increment = 1;
      nestable = false;
    }

    if (nestable) {
      total += increment + nesting;
      ts.forEachChild(current, child => visit(child, nesting + 1));
      return;
    }

    total += increment;
    ts.forEachChild(current, child => visit(child, nesting));
  };

  visit(node, 0);
  return total;
}

export function detectCognitiveComplexity(
  fileSummaries: FileEntry[],
  threshold: number = 15
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.cognitiveComplexity > threshold) {
        findings.push({
          severity: fn.cognitiveComplexity > 25 ? 'high' : 'medium',
          category: 'cognitive-complexity',
          file: entry.file,
          lineStart: fn.lineStart,
          lineEnd: fn.lineEnd,
          title: `High cognitive complexity: ${fn.name} (${fn.cognitiveComplexity})`,
          reason: `Function cognitive complexity is ${fn.cognitiveComplexity} (threshold: ${threshold}). Nested branches compound reading difficulty.`,
          files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
          suggestedFix: {
            strategy: 'Reduce nesting and simplify control flow.',
            steps: [
              'Convert nested branches into early returns / guard clauses.',
              'Extract deeply nested blocks into named helper functions.',
              'Replace complex boolean chains with named predicates.',
            ],
          },
          impact:
            'Lower cognitive complexity directly correlates with fewer bugs and faster code reviews.',
          tags: ['complexity', 'readability', 'nesting'],
          lspHints: [
            {
              tool: 'lspCallHierarchy',
              symbolName: fn.name,
              lineHint: fn.lineStart,
              file: entry.file,
              expectedResult: `understand call graph before simplifying ${fn.name}`,
            },
          ],
        });
      }
    }
  }

  return findings;
}

export function detectExcessiveParameters(
  fileSummaries: FileEntry[],
  threshold: number = 5
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.params == null || fn.params <= threshold) continue;
      findings.push({
        severity: fn.params > 7 ? 'high' : 'medium',
        category: 'excessive-parameters',
        file: entry.file,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        title: `Excessive parameters: ${fn.name} (${fn.params} params)`,
        reason: `Function has ${fn.params} parameters (threshold: ${threshold}). High parameter counts make call sites hard to read and signal the function may be doing too much.`,
        files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
        suggestedFix: {
          strategy: 'Introduce a parameter object or split the function.',
          steps: [
            'Group related parameters into an options/config object.',
            'Use destructuring at the function signature for clarity.',
            'Consider splitting into smaller, focused functions if params serve different concerns.',
          ],
        },
        impact:
          'Improves call-site readability and makes the API easier to evolve.',
        tags: ['api-design', 'readability', 'refactor'],
      });
    }
  }
  return findings;
}

export function detectEmptyCatchBlocks(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (!entry.emptyCatches || entry.emptyCatches.length === 0) continue;
    for (const loc of entry.emptyCatches) {
      findings.push({
        severity: 'medium',
        category: 'empty-catch',
        file: entry.file,
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
        title: `Empty catch block silently swallows errors`,
        reason: `Catch block at line ${loc.lineStart} has no statements — errors are silently ignored.`,
        files: [`${entry.file}:${loc.lineStart}-${loc.lineEnd}`],
        suggestedFix: {
          strategy: 'Log, re-throw, or handle the error explicitly.',
          steps: [
            'Add error logging (console.error or a logger) at minimum.',
            'Re-throw if the caller should handle the error.',
            'Add a comment explaining why swallowing is intentional, if it truly is.',
          ],
        },
        impact:
          'Prevents silent failures that are extremely hard to debug in production.',
        tags: ['error-handling', 'reliability', 'silent-failure'],
      });
    }
  }
  return findings;
}

export function detectSwitchNoDefault(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (
      !entry.switchesWithoutDefault ||
      entry.switchesWithoutDefault.length === 0
    )
      continue;
    for (const loc of entry.switchesWithoutDefault) {
      findings.push({
        severity: 'low',
        category: 'switch-no-default',
        file: entry.file,
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
        title: `Switch statement missing default case`,
        reason: `Switch at line ${loc.lineStart} has no default clause — unexpected values fall through silently.`,
        files: [`${entry.file}:${loc.lineStart}-${loc.lineEnd}`],
        suggestedFix: {
          strategy:
            'Add a default case with error handling or exhaustive check.',
          steps: [
            'Add a default clause that throws an unreachable error for exhaustiveness.',
            'Or log a warning for unexpected values.',
            'In TypeScript, use `never` type assertion for compile-time exhaustive checks.',
          ],
        },
        impact:
          'Catches unexpected values early and prevents silent logic bugs.',
        tags: ['control-flow', 'exhaustiveness', 'safety'],
      });
    }
  }
  return findings;
}

export function detectUnsafeAny(
  fileSummaries: FileEntry[],
  threshold: number = 5
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (entry.anyCount == null || entry.anyCount <= threshold) continue;
    if (!canAddFinding(findings)) break;
    findings.push({
      severity: entry.anyCount > 10 ? 'high' : 'medium',
      category: 'unsafe-any',
      file: entry.file,
      lineStart: 1,
      lineEnd: 1,
      title: `Excessive \`any\` usage: ${entry.file} (${entry.anyCount} occurrences)`,
      reason: `File uses \`any\` type ${entry.anyCount} times (threshold: ${threshold}). Each \`any\` disables type checking and allows silent runtime errors.`,
      files: [entry.file],
      suggestedFix: {
        strategy: 'Replace `any` with specific types, `unknown`, or generics.',
        steps: [
          'Replace `any` with `unknown` and add type guards where needed.',
          'Use generics for functions that operate on multiple types.',
          'Define proper interfaces for complex data shapes.',
          'Use `as const` assertions instead of `as any` where possible.',
        ],
      },
      impact:
        'Restores TypeScript safety and catches bugs at compile time instead of runtime.',
      tags: ['type-safety', 'reliability', 'typescript'],
    });
  }
  return findings;
}

export function detectHighHalsteadEffort(
  fileSummaries: FileEntry[],
  effortThreshold: number = 500_000,
  bugThreshold: number = 2.0
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (!fn.halstead) continue;
      const { effort, estimatedBugs, volume } = fn.halstead;
      if (effort <= effortThreshold && estimatedBugs <= bugThreshold) continue;
      const reasons: string[] = [];
      if (effort > effortThreshold)
        reasons.push(
          `effort=${Math.round(effort)} (threshold: ${effortThreshold})`
        );
      if (estimatedBugs > bugThreshold)
        reasons.push(
          `estimatedBugs=${estimatedBugs.toFixed(2)} (threshold: ${bugThreshold})`
        );
      findings.push({
        severity:
          effort > effortThreshold * 2 || estimatedBugs > 5 ? 'high' : 'medium',
        category: 'halstead-effort',
        file: entry.file,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        title: `High Halstead complexity: ${fn.name}`,
        reason: `Function has high implementation complexity: ${reasons.join('; ')}. Volume=${Math.round(volume)}.`,
        files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
        suggestedFix: {
          strategy:
            'Reduce operator/operand count by extracting helpers and simplifying expressions.',
          steps: [
            'Extract complex sub-expressions into named intermediate variables.',
            'Split into smaller functions with fewer unique operators/operands.',
            'Replace imperative loops with declarative array methods where clearer.',
          ],
        },
        impact:
          'Lower Halstead effort correlates with fewer bugs and faster comprehension.',
        tags: ['complexity', 'maintainability', 'effort'],
      });
    }
  }
  return findings;
}

export function detectLowMaintainability(
  fileSummaries: FileEntry[],
  threshold: number = 20
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (
        fn.maintainabilityIndex == null ||
        fn.maintainabilityIndex >= threshold
      )
        continue;
      findings.push({
        severity: fn.maintainabilityIndex < 10 ? 'critical' : 'high',
        category: 'low-maintainability',
        file: entry.file,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        title: `Low maintainability: ${fn.name} (MI=${fn.maintainabilityIndex.toFixed(1)})`,
        reason: `Maintainability Index is ${fn.maintainabilityIndex.toFixed(1)} (threshold: ${threshold}, scale 0-100). Combines Halstead volume, cyclomatic complexity, and lines of code.`,
        files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
        suggestedFix: {
          strategy:
            'Reduce complexity, shorten the function, and simplify expressions.',
          steps: [
            'Split into smaller functions to reduce LOC and cyclomatic complexity.',
            'Extract complex expressions to reduce Halstead volume.',
            'Convert nested logic to early returns and guard clauses.',
            'Consider if parts of the function belong in separate modules.',
          ],
        },
        impact:
          'Higher MI directly predicts lower maintenance cost and defect rate.',
        tags: ['maintainability', 'complexity', 'technical-debt'],
      });
    }
  }
  return findings;
}

export function detectTypeAssertionEscape(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    const esc = entry.typeAssertionEscapes;
    if (!esc) continue;

    const total =
      esc.asAny.length + esc.doubleAssertion.length + esc.nonNull.length;
    if (total === 0) continue;

    const parts: string[] = [];
    if (esc.asAny.length > 0) parts.push(`${esc.asAny.length} \`as any\``);
    if (esc.doubleAssertion.length > 0)
      parts.push(`${esc.doubleAssertion.length} double-assertion`);
    if (esc.nonNull.length > 0)
      parts.push(`${esc.nonNull.length} non-null \`!\``);
    const allLines = [...esc.asAny, ...esc.doubleAssertion, ...esc.nonNull].map(
      l => l.lineStart
    );
    const firstLine = Math.min(...allLines);

    if (!canAddFinding(findings)) break;
    findings.push({
      severity:
        esc.asAny.length + esc.doubleAssertion.length > 3 ? 'high' : 'medium',
      category: 'type-assertion-escape',
      file: entry.file,
      lineStart: firstLine,
      lineEnd: firstLine,
      title: `Type-safety escapes in ${entry.file} (${total})`,
      reason: `Found ${parts.join(', ')}. Each assertion bypasses TypeScript's type checker.`,
      files: [entry.file],
      suggestedFix: {
        strategy:
          'Replace type assertions with proper type guards or narrow types.',
        steps: [
          'Replace `as any` with `unknown` and add runtime type checks.',
          'Replace `as unknown as T` with proper generic constraints.',
          'Replace `!` assertions with explicit null checks.',
        ],
      },
      impact:
        'Type assertions silence the compiler — runtime errors go undetected.',
      tags: ['type-safety', 'assertions', 'code-quality'],
    });
  }

  return findings;
}

export function detectMissingErrorBoundary(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (!entry.unprotectedAsync) continue;

    for (const fn of entry.unprotectedAsync) {
      const severity =
        fn.awaitCount >= 4 ? 'high' : fn.awaitCount >= 2 ? 'medium' : 'low';
      findings.push({
        severity,
        category: 'missing-error-boundary',
        file: entry.file,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        title: `Missing error boundary: ${fn.name} (${fn.awaitCount} awaits, no try-catch)`,
        reason: `Async function "${fn.name}" has ${fn.awaitCount} await(s) but no try-catch. Rejected promises propagate as unhandled rejections.`,
        files: [entry.file],
        suggestedFix: {
          strategy: 'Wrap await calls in try-catch or add a .catch() handler.',
          steps: [
            'Add a try-catch block around the await expressions.',
            'Handle errors appropriately (log, return default, re-throw with context).',
            'If the caller handles errors, document it with a comment.',
          ],
        },
        impact:
          'Unhandled promise rejections crash Node.js processes and cause silent failures in browsers.',
        tags: ['error-handling', 'async', 'reliability'],
        lspHints: [
          {
            tool: 'lspCallHierarchy',
            symbolName: fn.name,
            lineHint: fn.lineStart,
            file: entry.file,
            expectedResult: `check if callers wrap this in try-catch or .catch() — if so, the boundary may exist upstream`,
          },
        ],
      });
    }
  }

  return findings;
}

export function detectPromiseMisuse(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (!entry.asyncWithoutAwait) continue;

    for (const fn of entry.asyncWithoutAwait) {
      findings.push({
        severity: 'medium',
        category: 'promise-misuse',
        file: entry.file,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        title: `Unnecessary async: ${fn.name} has no await`,
        reason: `Function "${fn.name}" is declared \`async\` but never uses \`await\`. The \`async\` keyword adds unnecessary Promise wrapping.`,
        files: [entry.file],
        suggestedFix: {
          strategy: 'Remove the async keyword or add the missing await.',
          steps: [
            'If the function does not need to be async, remove the `async` keyword.',
            'If an `await` was forgotten, add it to the appropriate call.',
            'Verify callers handle the return value correctly after the change.',
          ],
        },
        impact:
          'Unnecessary async wrapping adds microtask overhead and misleads readers.',
        tags: ['async', 'performance', 'clarity'],
      });
    }
  }

  return findings;
}

export function detectAwaitInLoop(fileSummaries: FileEntry[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const loc of entry.awaitInLoopLocations || []) {
      findings.push({
        severity: 'high',
        category: 'await-in-loop',
        file: entry.file,
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
        title: 'await inside loop — sequential async execution',
        reason:
          'Each await runs serially. For N iterations this takes N * latency instead of max(latency). Use Promise.all() or Promise.allSettled() for parallel execution.',
        files: [entry.file],
        suggestedFix: {
          strategy:
            'Collect promises and await them in parallel with Promise.all().',
          steps: [
            'Collect all async operations into an array of promises.',
            'Use await Promise.all(promises) or Promise.allSettled(promises).',
            'If order matters or rate limiting is needed, use a batching utility.',
          ],
        },
        impact:
          'Sequential awaits multiply latency by N iterations — parallelizing can reduce total time to max(single-latency).',
        tags: ['performance', 'async', 'n-plus-one'],
        lspHints: [
          {
            tool: 'lspGotoDefinition',
            symbolName: 'await',
            lineHint: loc.lineStart,
            file: entry.file,
            expectedResult: `navigate to the awaited call to check if parallelization is safe`,
          },
        ],
      });
    }
  }
  return findings;
}

export function detectSyncIo(fileSummaries: FileEntry[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const call of entry.syncIoCalls || []) {
      findings.push({
        severity: 'medium',
        category: 'sync-io',
        file: entry.file,
        lineStart: call.lineStart,
        lineEnd: call.lineEnd,
        title: `Synchronous I/O: ${call.name}`,
        reason: `${call.name} blocks the event loop. In server or UI code this degrades responsiveness for all concurrent operations.`,
        files: [entry.file],
        suggestedFix: {
          strategy: 'Replace with async equivalent.',
          steps: [
            `Replace ${call.name} with its async counterpart (e.g. fs.promises.readFile).`,
            'Sync I/O is acceptable in CLI scripts, build tools, or one-time init code.',
          ],
        },
        impact:
          'Synchronous I/O blocks the event loop, stalling all concurrent requests until the operation completes.',
        tags: ['performance', 'blocking', 'io'],
        lspHints: [
          {
            tool: 'lspCallHierarchy',
            symbolName: call.name,
            lineHint: call.lineStart,
            file: entry.file,
            expectedResult: `find callers to assess if this sync I/O is in a hot path`,
          },
        ],
      });
    }
  }
  return findings;
}

export function detectUnclearedTimers(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const timer of entry.timerCalls || []) {
      if (timer.kind === 'setInterval' && !timer.hasCleanup) {
        findings.push({
          severity: 'medium',
          category: 'uncleared-timer',
          file: entry.file,
          lineStart: timer.lineStart,
          lineEnd: timer.lineEnd,
          title: 'setInterval without clearInterval in scope',
          reason:
            'setInterval without cleanup runs indefinitely, causing memory leaks and unexpected behavior after component unmount or scope exit.',
          files: [entry.file],
          suggestedFix: {
            strategy: 'Store the timer ID and call clearInterval in cleanup.',
            steps: [
              'Assign the return value: const id = setInterval(...).',
              'Call clearInterval(id) in cleanup (useEffect return, componentWillUnmount, or scope exit).',
            ],
          },
          impact:
            'Uncleared intervals run indefinitely, leaking memory and CPU cycles after their scope is no longer relevant.',
          tags: ['performance', 'memory-leak', 'timer'],
        });
      }
    }
  }
  return findings;
}

export function detectListenerLeakRisk(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    const regs = entry.listenerRegistrations || [];
    const removals = entry.listenerRemovals || [];
    if (regs.length > 0 && removals.length === 0) {
      findings.push({
        severity: 'medium',
        category: 'listener-leak-risk',
        file: entry.file,
        lineStart: regs[0].lineStart,
        lineEnd: regs[regs.length - 1].lineEnd,
        title: `${regs.length} event listener(s) added without any removal`,
        reason:
          'addEventListener/on without corresponding removeEventListener/off risks memory leaks if the target outlives the subscriber.',
        files: [entry.file],
        suggestedFix: {
          strategy: 'Add corresponding listener removal in cleanup.',
          steps: [
            'Store the handler reference in a variable.',
            'Call removeEventListener/off in cleanup (unmount, dispose, close).',
            'Or use AbortController signal for automatic cleanup.',
          ],
        },
        impact:
          'Listener references prevent garbage collection of the subscriber, causing memory growth proportional to event-target lifetime.',
        tags: ['performance', 'memory-leak', 'events'],
      });
    }
  }
  return findings;
}

export function detectUnboundedCollection(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.loops >= 2 && fn.calls >= 5 && fn.maxLoopDepth >= 2) {
        findings.push({
          severity: 'low',
          category: 'unbounded-collection',
          file: entry.file,
          lineStart: fn.lineStart,
          lineEnd: fn.lineEnd,
          title: `Potential unbounded collection growth in ${fn.name}`,
          reason: `Function "${fn.name}" has ${fn.loops} loops nested ${fn.maxLoopDepth} levels with ${fn.calls} calls. Collections growing inside nested loops without bounds can cause OOM.`,
          files: [entry.file],
          suggestedFix: {
            strategy: 'Add size limits, pagination, or streaming.',
            steps: [
              'Add a maximum size check before adding to collections.',
              'Use pagination or streaming for large datasets.',
              'Consider using generators for lazy evaluation.',
            ],
          },
          impact:
            'Unbounded collection growth inside nested loops can cause out-of-memory crashes under large input.',
          tags: ['performance', 'memory', 'collection'],
        });
      }
    }
  }
  return findings;
}

export function detectSimilarFunctionBodies(
  flowMap: Map<string, import('../types/index.js').FlowMapEntry[]>,
  similarityThreshold: number = 0.85
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  const allEntries: import('../types/index.js').FlowMapEntry[] = [];
  for (const entries of flowMap.values()) {
    for (const e of entries) {
      if (!isTestFile(e.file)) allEntries.push(e);
    }
  }

  const buckets = new Map<string, import('../types/index.js').FlowMapEntry[]>();
  for (const entry of allEntries) {
    const key = `${entry.kind}|${Math.round(entry.statementCount / 3)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(entry);
  }

  for (const [, bucket] of buckets) {
    if (bucket.length < 2 || bucket.length > 50) continue;

    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        if (a.hash === b.hash) continue;
        if (a.file === b.file && a.lineStart === b.lineStart) continue;

        const stmtRatio =
          Math.min(a.statementCount, b.statementCount) /
          Math.max(a.statementCount, b.statementCount);
        if (stmtRatio < 0.8) continue;

        const similarity = computeMetricSimilarity(a, b);
        if (similarity >= similarityThreshold) {
          findings.push({
            severity: similarity >= 0.95 ? 'high' : 'medium',
            category: 'similar-function-body',
            file: a.file,
            lineStart: a.lineStart,
            lineEnd: a.lineEnd,
            title: `Similar function: ${a.name} (${(similarity * 100).toFixed(0)}% similar to ${b.name} in ${b.file})`,
            reason: `"${a.name}" and "${b.name}" have ${(similarity * 100).toFixed(0)}% structural similarity. Near-duplicates diverge over time and should be consolidated.`,
            files: [a.file, b.file],
            suggestedFix: {
              strategy: 'Extract shared logic into a parameterized helper.',
              steps: [
                `Compare ${a.file}:${a.lineStart} with ${b.file}:${b.lineStart}.`,
                'Identify the varying parts and extract them as parameters.',
                'Create a shared function and call it from both locations.',
              ],
            },
            impact:
              'Near-clone functions diverge over time, causing inconsistent behavior and multiplied maintenance cost.',
            tags: ['duplication', 'maintainability', 'near-clone'],
          });
        }
      }
    }
  }

  return findings;
}

function computeMetricSimilarity(
  a: import('../types/index.js').FlowMapEntry,
  b: import('../types/index.js').FlowMapEntry
): number {
  const features = [
    [a.metrics.complexity, b.metrics.complexity],
    [a.metrics.maxBranchDepth, b.metrics.maxBranchDepth],
    [a.metrics.maxLoopDepth, b.metrics.maxLoopDepth],
    [a.metrics.returns, b.metrics.returns],
    [a.metrics.awaits, b.metrics.awaits],
    [a.metrics.calls, b.metrics.calls],
    [a.metrics.loops, b.metrics.loops],
    [a.statementCount, b.statementCount],
  ];

  let totalSimilarity = 0;
  for (const [va, vb] of features) {
    const max = Math.max(va, vb, 1);
    totalSimilarity += 1 - Math.abs(va - vb) / max;
  }
  return totalSimilarity / features.length;
}

export function detectMessageChains(fileSummaries: FileEntry[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (!entry.messageChains || entry.messageChains.length === 0) continue;
    // Group by line start — take the deepest chain at each location
    const byLine = new Map<number, typeof entry.messageChains[0]>();
    for (const chain of entry.messageChains) {
      const existing = byLine.get(chain.lineStart);
      if (!existing || chain.depth > existing.depth) {
        byLine.set(chain.lineStart, chain);
      }
    }
    for (const chain of byLine.values()) {
      const severity = chain.depth >= 6 ? 'high' : 'medium';
      findings.push({
        severity,
        category: 'message-chain',
        file: entry.file,
        lineStart: chain.lineStart,
        lineEnd: chain.lineEnd,
        title: `Message chain of depth ${chain.depth}: ${chain.chain.slice(0, 50)}`,
        reason: `A property-access chain of ${chain.depth} steps violates the Law of Demeter — the caller navigates through ${chain.depth - 1} intermediate objects to reach its target. Deep chains tightly couple the caller to internal object structure, making refactoring brittle.`,
        files: [entry.file],
        suggestedFix: {
          strategy: 'Apply the Law of Demeter — talk only to immediate friends.',
          steps: [
            'Identify the root object and the final method/property being used.',
            'Add a delegating method to the root object (Tell, Don\'t Ask).',
            'Replace the chain with a single call on the immediate object.',
            'If the chain crosses module boundaries, consider whether the intermediate objects should be passed directly.',
          ],
        },
        impact:
          'Deep property chains tightly couple code to internal object structure. When intermediate objects change, every chain accessing them must be updated.',
        tags: ['coupling', 'law-of-demeter', 'maintainability'],
        lspHints: [
          {
            tool: 'lspGotoDefinition',
            symbolName: chain.chain.split('.')[0],
            lineHint: chain.lineStart,
            file: entry.file,
            expectedResult: `find the type of the root object to understand what intermediate types the chain traverses`,
          },
        ],
      });
    }
  }
  return findings;
}
