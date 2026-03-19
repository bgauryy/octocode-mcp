import { isTestFile } from '../common/utils.js';

import type { FileEntry, Finding } from '../types/index.js';

type FindingDraft = Omit<Finding, 'id'>;

export function detectLowAssertionDensity(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (!isTestFile(entry.file) || !entry.testProfile) continue;
    const { testBlocks } = entry.testProfile;
    if (testBlocks.length === 0) continue;
    const totalAssertions = testBlocks.reduce(
      (sum, t) => sum + t.assertionCount,
      0
    );
    const ratio = totalAssertions / testBlocks.length;
    if (ratio < 1) {
      findings.push({
        severity: 'medium',
        category: 'low-assertion-density',
        file: entry.file,
        lineStart: testBlocks[0].lineStart,
        lineEnd: testBlocks[testBlocks.length - 1].lineEnd,
        title: `Low assertion density: ${totalAssertions} assertions across ${testBlocks.length} tests`,
        reason: `Average ${ratio.toFixed(1)} assertions per test. Tests with few assertions may pass without verifying actual behavior.`,
        files: [entry.file],
        suggestedFix: {
          strategy: 'Add meaningful assertions to each test case.',
          steps: [
            'Review each test block and add expect() calls that verify outcomes.',
            'Test both success and failure paths.',
            'Assert return values, state changes, and side effects.',
          ],
        },
        impact:
          'Low assertion density means tests pass without verifying behavior — bugs slip through with false confidence.',
        tags: ['test-quality', 'assertions'],
      });
    }
  }
  return findings;
}

export function detectTestNoAssertion(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (!isTestFile(entry.file) || !entry.testProfile) continue;
    for (const block of entry.testProfile.testBlocks) {
      if (block.assertionCount === 0) {
        findings.push({
          severity: 'high',
          category: 'test-no-assertion',
          file: entry.file,
          lineStart: block.lineStart,
          lineEnd: block.lineEnd,
          title: `Test "${block.name}" has no assertions`,
          reason:
            'A test without assertions always passes. It provides no verification of behavior.',
          files: [entry.file],
          suggestedFix: {
            strategy: 'Add at least one expect() or assert() call.',
            steps: [
              'Identify what behavior this test should verify.',
              'Add expect(result).toBe(expected) or similar assertion.',
              'If the test only checks that code does not throw, use expect(() => fn()).not.toThrow().',
            ],
          },
          impact:
            'Zero-assertion tests always pass — they provide no safety net and create a false sense of coverage.',
          tags: ['test-quality', 'assertions', 'false-pass'],
        });
      }
    }
  }
  return findings;
}

export function detectExcessiveMocking(
  fileSummaries: FileEntry[],
  mockThreshold: number = 10
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (!isTestFile(entry.file) || !entry.testProfile) continue;
    const { mockCalls } = entry.testProfile;
    if (mockCalls.length > mockThreshold) {
      findings.push({
        severity: 'medium',
        category: 'excessive-mocking',
        file: entry.file,
        lineStart: mockCalls[0].lineStart,
        lineEnd: mockCalls[mockCalls.length - 1].lineEnd,
        title: `${mockCalls.length} mock/spy calls in test file (threshold: ${mockThreshold})`,
        reason:
          'Excessive mocking couples tests to implementation details, making them brittle and hard to maintain.',
        files: [entry.file],
        suggestedFix: {
          strategy: 'Reduce mocks by testing through public interfaces.',
          steps: [
            'Identify mocks that can be replaced with real implementations.',
            'Use dependency injection to simplify test setup.',
            'Consider integration tests for complex interaction chains.',
          ],
        },
        impact:
          'Heavy mocking couples tests to implementation details — any refactor breaks them even if behavior is unchanged.',
        tags: ['test-quality', 'mocking', 'brittleness'],
      });
    }
  }
  return findings;
}

export function detectSharedMutableState(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (!isTestFile(entry.file) || !entry.testProfile) continue;
    for (const decl of entry.testProfile.mutableStateDecls) {
      findings.push({
        severity: 'medium',
        category: 'shared-mutable-state',
        file: entry.file,
        lineStart: decl.lineStart,
        lineEnd: decl.lineEnd,
        title: 'Mutable variable at describe scope',
        reason:
          'let/var at describe scope creates shared mutable state between tests. Tests may pass or fail depending on execution order.',
        files: [entry.file],
        suggestedFix: {
          strategy:
            'Move variable declaration inside each test or use beforeEach.',
          steps: [
            'Move the variable into each it()/test() block that uses it.',
            'Or initialize it in beforeEach() so each test gets a fresh copy.',
            'Use const where possible.',
          ],
        },
        impact:
          'Shared mutable state causes order-dependent test results — tests pass in isolation but fail or flake in suite runs.',
        tags: ['test-quality', 'isolation', 'flaky'],
      });
    }
  }
  return findings;
}

export function detectMissingTestCleanup(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (!isTestFile(entry.file) || !entry.testProfile) continue;
    const { setupCalls } = entry.testProfile;
    const hasBeforeAll = setupCalls.some(c => c.kind === 'beforeAll');
    const hasAfterAll = setupCalls.some(c => c.kind === 'afterAll');
    const hasBeforeEach = setupCalls.some(c => c.kind === 'beforeEach');
    const hasAfterEach = setupCalls.some(c => c.kind === 'afterEach');

    if (hasBeforeAll && !hasAfterAll) {
      const setup = setupCalls.find(c => c.kind === 'beforeAll')!;
      findings.push({
        severity: 'medium',
        category: 'missing-test-cleanup',
        file: entry.file,
        lineStart: setup.lineStart,
        lineEnd: setup.lineStart,
        title: 'beforeAll without afterAll',
        reason:
          'Setup in beforeAll without teardown in afterAll can leak state (open connections, modified globals, temp files) across test suites.',
        files: [entry.file],
        suggestedFix: {
          strategy:
            'Add afterAll() to clean up resources allocated in beforeAll().',
          steps: [
            'Identify what beforeAll() sets up (connections, mocks, temp state).',
            'Add afterAll() to tear it down.',
          ],
        },
        impact:
          'Missing teardown leaks resources (connections, file handles, globals) that poison subsequent test suites.',
        tags: ['test-quality', 'cleanup', 'leak'],
      });
    }

    if (hasBeforeEach && !hasAfterEach) {
      const setup = setupCalls.find(c => c.kind === 'beforeEach')!;
      findings.push({
        severity: 'medium',
        category: 'missing-test-cleanup',
        file: entry.file,
        lineStart: setup.lineStart,
        lineEnd: setup.lineStart,
        title: 'beforeEach without afterEach',
        reason:
          'Setup in beforeEach without teardown in afterEach can accumulate side effects across tests.',
        files: [entry.file],
        suggestedFix: {
          strategy:
            'Add afterEach() to clean up resources allocated in beforeEach().',
          steps: [
            'Identify what beforeEach() sets up.',
            'Add afterEach() to tear it down or restore state.',
          ],
        },
        impact:
          'Per-test setup without teardown accumulates side effects, causing cascading failures in later tests.',
        tags: ['test-quality', 'cleanup'],
      });
    }
  }
  return findings;
}

export function detectFocusedTests(fileSummaries: FileEntry[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (!isTestFile(entry.file) || !entry.testProfile) continue;
    for (const focused of entry.testProfile.focusedCalls) {
      findings.push({
        severity: 'medium',
        category: 'focused-test',
        file: entry.file,
        lineStart: focused.lineStart,
        lineEnd: focused.lineEnd,
        title: `Focused test marker: ${focused.kind}`,
        reason: `${focused.kind} limits scan or production of focused tests; it can hide unrelated failures and reduce suite coverage when committed.`,
        files: [entry.file],
        suggestedFix: {
          strategy: 'Avoid focused/skip patterns in committed tests.',
          steps: [
            'Remove `.only`/`.skip`/`.todo` markers before merging.',
            'Use local test filtering only for interactive local debugging.',
            'If temporarily needed, add a TODO and a tracked follow-up task.',
          ],
        },
        impact:
          'Focused tests can create a false green signal by skipping broader test coverage.',
        tags: ['test-quality', 'selection', 'flaky', 'coverage'],
        ruleId: 'test-quality.focused-test',
        confidence: 'high',
        evidence: {
          marker: focused.kind,
          lineStart: focused.lineStart,
          lineEnd: focused.lineEnd,
          category: 'focused-test',
        },
      });
    }
  }
  return findings;
}

export function detectFakeTimersWithoutRestore(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (!isTestFile(entry.file) || !entry.testProfile) continue;
    const fakeTimerCalls = entry.testProfile.timerControls.filter(
      call =>
        call.kind === 'jest.useFakeTimers' || call.kind === 'vi.useFakeTimers'
    );
    if (fakeTimerCalls.length === 0) continue;

    const hasRestore = entry.testProfile.timerControls.some(
      call =>
        call.kind === 'jest.useRealTimers' || call.kind === 'vi.useRealTimers'
    );
    if (hasRestore) continue;

    const first = fakeTimerCalls[0];
    findings.push({
      severity: 'medium',
      category: 'fake-timer-no-restore',
      file: entry.file,
      lineStart: first.lineStart,
      lineEnd: first.lineEnd,
      title: 'Fake timers activated without restore',
      reason:
        'Tests that switch to fake timers without restoring real timers can leak timing behavior into subsequent tests.',
      files: [entry.file],
      suggestedFix: {
        strategy:
          'Pair fake timer activation with a restore in the same test scope.',
        steps: [
          'Call `jest.useRealTimers()` or `vi.useRealTimers()` in afterEach() or afterAll().',
          'Prefer per-test setup/teardown with explicit timer cleanup.',
        ],
      },
      impact:
        'Leaked fake-timer configuration can cause subtle, order-dependent failures across unrelated suites.',
      tags: ['test-quality', 'timers', 'isolation'],
      ruleId: 'test-quality.fake-timer-no-restore',
      confidence: 'medium',
      evidence: {
        fakeTimerActivationLines: fakeTimerCalls.map(
          call => `${call.kind}:${call.lineStart}`
        ),
      },
    });
  }
  return findings;
}

export function detectMissingMockRestoration(
  fileSummaries: FileEntry[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (!isTestFile(entry.file) || !entry.testProfile) continue;
    if (entry.testProfile.spyOrStubCalls.length === 0) continue;

    const hasRestoreAll = entry.testProfile.mockRestores.some(
      call => call.kind === 'restoreAll'
    );
    if (hasRestoreAll) continue;

    const explicitRestores = new Set(
      entry.testProfile.mockRestores
        .filter(call => call.kind === 'restore' && !!call.target)
        .map(call => call.target as string)
    );
    const firstUnrestored = entry.testProfile.spyOrStubCalls.find(
      call => !call.target || !explicitRestores.has(call.target)
    );
    if (!firstUnrestored) continue;

    const first = firstUnrestored;
    findings.push({
      severity: 'medium',
      category: 'missing-mock-restoration',
      file: entry.file,
      lineStart: first.lineStart,
      lineEnd: first.lineEnd,
      title: 'Spy/stub not restored',
      reason:
        'Spies/stubs modify implementation behavior and must be restored to avoid cross-test leakage.',
      files: [entry.file],
      suggestedFix: {
        strategy:
          'Restore every spy/stub after each test or in a file-level teardown.',
        steps: [
          'Call `mockRestore()` on each spy/stub returned handle.',
          'Or use `jest.restoreAllMocks()`/`vi.restoreAllMocks()` in afterEach/afterAll.',
        ],
      },
      impact:
        'Unrestored spies/stubs make tests order-dependent and can mask regressions.',
      tags: ['test-quality', 'cleanup', 'mocks', 'isolation'],
      ruleId: 'test-quality.missing-mock-restoration',
      confidence: 'high',
      evidence: {
        spyOrStubCalls: entry.testProfile.spyOrStubCalls.map(
          call => `${call.lineStart}`
        ),
      },
    });
  }
  return findings;
}
