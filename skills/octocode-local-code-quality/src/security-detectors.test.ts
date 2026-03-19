import { describe, expect, it } from 'vitest';

import {
  detectCommandInjectionRisk,
  detectEvalUsage,
  detectHardcodedSecrets,
  detectInputPassthroughRisk,
  detectPathTraversalRisk,
  detectPrototypePollutionRisk,
  detectSqlInjectionRisk,
  detectUnsafeHtml,
  detectUnsafeRegex,
  detectUnvalidatedInputSink,
} from './security-detectors.js';

import type { FileEntry, InputSourceInfo } from './types.js';

function makeFileEntry(override: Partial<FileEntry> = {}): FileEntry {
  return {
    file: override.file ?? 'src/app.ts',
    package: override.package ?? 'my-pkg',
    parseEngine: override.parseEngine ?? 'typescript',
    nodeCount: override.nodeCount ?? 100,
    kindCounts: override.kindCounts ?? {},
    functions: override.functions ?? [],
    flows: override.flows ?? [],
    dependencyProfile: override.dependencyProfile ?? {
      internalDependencies: [],
      externalDependencies: [],
      unresolvedDependencies: [],
      declaredExports: [],
      importedSymbols: [],
      reExports: [],
    },
    ...override,
  };
}

function makeInputSource(
  override: Partial<InputSourceInfo> = {}
): InputSourceInfo {
  return {
    functionName: override.functionName ?? 'handleRequest',
    lineStart: override.lineStart ?? 10,
    lineEnd: override.lineEnd ?? 30,
    sourceParams: override.sourceParams ?? ['userInput'],
    hasSinkInBody: override.hasSinkInBody ?? false,
    sinkKinds: override.sinkKinds ?? [],
    hasValidation: override.hasValidation ?? false,
    callsWithInputArgs: override.callsWithInputArgs ?? [],
    paramConfidence: override.paramConfidence ?? 'high',
    ...override,
  };
}

describe('detectHardcodedSecrets', () => {
  it('detects a hardcoded secret with literal context', () => {
    const files = [
      makeFileEntry({
        suspiciousStrings: [
          {
            lineStart: 5,
            lineEnd: 5,
            kind: 'hardcoded-secret',
            context: 'literal',
            snippet: 'AKIAIOSFODNN7EXAMPLE',
          },
        ],
      }),
    ];
    const findings = detectHardcodedSecrets(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('hardcoded-secret');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].title).toContain('Potential hardcoded secret');
  });

  it('detects a secret-assignment context', () => {
    const files = [
      makeFileEntry({
        suspiciousStrings: [
          {
            lineStart: 10,
            lineEnd: 10,
            kind: 'hardcoded-secret',
            context: 'literal',
            snippet: 'password=supersecret123',
          },
        ],
      }),
    ];
    const findings = detectHardcodedSecrets(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('password=supersecret');
  });

  it('skips error-message context', () => {
    const files = [
      makeFileEntry({
        suspiciousStrings: [
          {
            lineStart: 5,
            lineEnd: 5,
            kind: 'hardcoded-secret',
            context: 'error-message',
            snippet: 'invalid token provided for auth',
          },
        ],
      }),
    ];
    const findings = detectHardcodedSecrets(files);
    expect(findings).toHaveLength(0);
  });

  it('skips regex-definition context', () => {
    const files = [
      makeFileEntry({
        suspiciousStrings: [
          {
            lineStart: 5,
            lineEnd: 5,
            kind: 'hardcoded-secret',
            context: 'regex-definition',
            snippet: '/password|secret/i',
          },
        ],
      }),
    ];
    const findings = detectHardcodedSecrets(files);
    expect(findings).toHaveLength(0);
  });

  it('skips test files', () => {
    const files = [
      makeFileEntry({
        file: 'src/utils.test.ts',
        suspiciousStrings: [
          {
            lineStart: 5,
            lineEnd: 5,
            kind: 'hardcoded-secret',
            context: 'literal',
            snippet: 'testSecret123',
          },
        ],
      }),
    ];
    const findings = detectHardcodedSecrets(files);
    expect(findings).toHaveLength(0);
  });

  it('returns 0 findings for empty suspiciousStrings', () => {
    const files = [makeFileEntry({ suspiciousStrings: [] })];
    const findings = detectHardcodedSecrets(files);
    expect(findings).toHaveLength(0);
  });

  it('truncates snippet in title to 20 chars', () => {
    const files = [
      makeFileEntry({
        suspiciousStrings: [
          {
            lineStart: 1,
            lineEnd: 1,
            kind: 'hardcoded-secret',
            context: 'literal',
            snippet: 'abcdefghijklmnopqrstuvwxyz1234567890',
          },
        ],
      }),
    ];
    const findings = detectHardcodedSecrets(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('abcdefghijklmnopqrst');
    expect(findings[0].title).toContain('…');
  });
});

describe('detectEvalUsage', () => {
  it('detects eval usage', () => {
    const files = [
      makeFileEntry({
        evalUsages: [{ file: 'src/app.ts', lineStart: 15, lineEnd: 15 }],
      }),
    ];
    const findings = detectEvalUsage(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('eval-usage');
    expect(findings[0].severity).toBe('critical');
  });

  it('skips test files', () => {
    const files = [
      makeFileEntry({
        file: 'src/__tests__/eval.ts',
        evalUsages: [
          { file: 'src/__tests__/eval.ts', lineStart: 1, lineEnd: 1 },
        ],
      }),
    ];
    const findings = detectEvalUsage(files);
    expect(findings).toHaveLength(0);
  });

  it('returns 0 findings for empty evalUsages', () => {
    const files = [makeFileEntry({ evalUsages: [] })];
    const findings = detectEvalUsage(files);
    expect(findings).toHaveLength(0);
  });
});

describe('detectUnsafeHtml', () => {
  it('detects unsafe HTML assignments', () => {
    const files = [
      makeFileEntry({
        unsafeHtmlAssignments: [
          { file: 'src/app.ts', lineStart: 20, lineEnd: 20 },
        ],
      }),
    ];
    const findings = detectUnsafeHtml(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('unsafe-html');
    expect(findings[0].severity).toBe('high');
  });

  it('skips test files', () => {
    const files = [
      makeFileEntry({
        file: 'tests/render.spec.ts',
        unsafeHtmlAssignments: [
          { file: 'tests/render.spec.ts', lineStart: 5, lineEnd: 5 },
        ],
      }),
    ];
    const findings = detectUnsafeHtml(files);
    expect(findings).toHaveLength(0);
  });

  it('returns 0 findings for empty unsafeHtmlAssignments', () => {
    const files = [makeFileEntry({ unsafeHtmlAssignments: [] })];
    const findings = detectUnsafeHtml(files);
    expect(findings).toHaveLength(0);
  });
});

describe('detectSqlInjectionRisk', () => {
  it('detects sql-injection kind suspicious string', () => {
    const files = [
      makeFileEntry({
        suspiciousStrings: [
          {
            lineStart: 30,
            lineEnd: 30,
            kind: 'sql-injection',
            snippet: 'SELECT * FROM users WHERE id=${userId}',
          },
        ],
      }),
    ];
    const findings = detectSqlInjectionRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('sql-injection-risk');
    expect(findings[0].severity).toBe('high');
  });

  it('skips test files', () => {
    const files = [
      makeFileEntry({
        file: 'src/db.test.ts',
        suspiciousStrings: [
          {
            lineStart: 5,
            lineEnd: 5,
            kind: 'sql-injection',
          },
        ],
      }),
    ];
    const findings = detectSqlInjectionRisk(files);
    expect(findings).toHaveLength(0);
  });

  it('does not pick up hardcoded-secret kind', () => {
    const files = [
      makeFileEntry({
        suspiciousStrings: [
          {
            lineStart: 5,
            lineEnd: 5,
            kind: 'hardcoded-secret',
            context: 'literal',
            snippet: 'not-a-sql-injection',
          },
        ],
      }),
    ];
    const findings = detectSqlInjectionRisk(files);
    expect(findings).toHaveLength(0);
  });
});

describe('detectUnsafeRegex', () => {
  it('detects nested quantifier pattern (a+)+', () => {
    const files = [
      makeFileEntry({
        regexLiterals: [
          {
            lineStart: 10,
            lineEnd: 10,
            pattern: '(a+)+',
          },
        ],
      }),
    ];
    const findings = detectUnsafeRegex(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('unsafe-regex');
    expect(findings[0].severity).toBe('medium');
  });

  it('detects another nested quantifier pattern (a?){', () => {
    const files = [
      makeFileEntry({
        regexLiterals: [
          {
            lineStart: 12,
            lineEnd: 12,
            pattern: '(a?){10}',
          },
        ],
      }),
    ];
    const findings = detectUnsafeRegex(files);
    expect(findings).toHaveLength(1);
  });

  it('does not flag safe regex', () => {
    const files = [
      makeFileEntry({
        regexLiterals: [
          {
            lineStart: 5,
            lineEnd: 5,
            pattern: '^[a-z]+$',
          },
        ],
      }),
    ];
    const findings = detectUnsafeRegex(files);
    expect(findings).toHaveLength(0);
  });

  it('skips test files', () => {
    const files = [
      makeFileEntry({
        file: 'src/regex.test.ts',
        regexLiterals: [
          {
            lineStart: 5,
            lineEnd: 5,
            pattern: '(a+)+',
          },
        ],
      }),
    ];
    const findings = detectUnsafeRegex(files);
    expect(findings).toHaveLength(0);
  });
});

describe('detectPrototypePollutionRisk', () => {
  it('detects unguarded computed-property-write as high severity', () => {
    const files = [
      makeFileEntry({
        prototypePollutionSites: [
          {
            kind: 'computed-property-write',
            detail: 'obj[key] = value',
            lineStart: 20,
            lineEnd: 20,
            guarded: false,
          },
        ],
      }),
    ];
    const findings = detectPrototypePollutionRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].category).toBe('prototype-pollution-risk');
  });

  it('detects object-assign site as medium severity', () => {
    const files = [
      makeFileEntry({
        prototypePollutionSites: [
          {
            kind: 'object-assign',
            detail: 'Object.assign(target, source)',
            lineStart: 25,
            lineEnd: 25,
            guarded: false,
          },
        ],
      }),
    ];
    const findings = detectPrototypePollutionRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('downgrades guarded computed-property-write to low severity', () => {
    const files = [
      makeFileEntry({
        prototypePollutionSites: [
          {
            kind: 'computed-property-write',
            detail: 'obj[key] = value',
            lineStart: 20,
            lineEnd: 20,
            guarded: true,
          },
        ],
      }),
    ];
    const findings = detectPrototypePollutionRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].title).toContain('(guarded)');
  });

  it('skips test files', () => {
    const files = [
      makeFileEntry({
        file: 'tests/merge.test.ts',
        prototypePollutionSites: [
          {
            kind: 'computed-property-write',
            detail: 'obj[key] = value',
            lineStart: 5,
            lineEnd: 5,
            guarded: false,
          },
        ],
      }),
    ];
    const findings = detectPrototypePollutionRisk(files);
    expect(findings).toHaveLength(0);
  });

  it('returns 0 findings for empty prototypePollutionSites', () => {
    const files = [makeFileEntry({ prototypePollutionSites: [] })];
    const findings = detectPrototypePollutionRisk(files);
    expect(findings).toHaveLength(0);
  });
});

describe('detectUnvalidatedInputSink', () => {
  it('detects high severity when hasSinkInBody=true, hasValidation=false, paramConfidence=high', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            hasSinkInBody: true,
            hasValidation: false,
            paramConfidence: 'high',
            sinkKinds: ['eval'],
            callsWithInputArgs: [{ callee: 'eval', lineStart: 15 }],
          }),
        ],
      }),
    ];
    const findings = detectUnvalidatedInputSink(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].category).toBe('unvalidated-input-sink');
  });

  it('detects medium severity when paramConfidence=low', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            hasSinkInBody: true,
            hasValidation: false,
            paramConfidence: 'low',
            sinkKinds: ['eval'],
            callsWithInputArgs: [{ callee: 'eval', lineStart: 15 }],
          }),
        ],
      }),
    ];
    const findings = detectUnvalidatedInputSink(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('skips when hasSinkInBody=false', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            hasSinkInBody: false,
            hasValidation: false,
            paramConfidence: 'high',
          }),
        ],
      }),
    ];
    const findings = detectUnvalidatedInputSink(files);
    expect(findings).toHaveLength(0);
  });

  it('skips when hasValidation=true', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            hasSinkInBody: true,
            hasValidation: true,
            paramConfidence: 'high',
            sinkKinds: ['eval'],
          }),
        ],
      }),
    ];
    const findings = detectUnvalidatedInputSink(files);
    expect(findings).toHaveLength(0);
  });

  it('skips test files', () => {
    const files = [
      makeFileEntry({
        file: 'src/handler.test.ts',
        inputSources: [
          makeInputSource({
            hasSinkInBody: true,
            hasValidation: false,
            paramConfidence: 'high',
            sinkKinds: ['eval'],
          }),
        ],
      }),
    ];
    const findings = detectUnvalidatedInputSink(files);
    expect(findings).toHaveLength(0);
  });

  it('returns 0 findings for empty inputSources', () => {
    const files = [makeFileEntry({ inputSources: [] })];
    const findings = detectUnvalidatedInputSink(files);
    expect(findings).toHaveLength(0);
  });
});

describe('detectInputPassthroughRisk', () => {
  it('detects medium severity when paramConfidence=high, callsWithInputArgs non-empty, no sink, no validation', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            callsWithInputArgs: [{ callee: 'processData', lineStart: 20 }],
            hasValidation: false,
            hasSinkInBody: false,
            paramConfidence: 'high',
          }),
        ],
      }),
    ];
    const findings = detectInputPassthroughRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].category).toBe('input-passthrough-risk');
  });

  it('detects low severity when paramConfidence=medium', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            callsWithInputArgs: [{ callee: 'processData', lineStart: 20 }],
            hasValidation: false,
            hasSinkInBody: false,
            paramConfidence: 'medium',
          }),
        ],
      }),
    ];
    const findings = detectInputPassthroughRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
  });

  it('skips when paramConfidence=low', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            callsWithInputArgs: [{ callee: 'processData', lineStart: 20 }],
            hasValidation: false,
            hasSinkInBody: false,
            paramConfidence: 'low',
          }),
        ],
      }),
    ];
    const findings = detectInputPassthroughRisk(files);
    expect(findings).toHaveLength(0);
  });

  it('skips when hasSinkInBody=true', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            callsWithInputArgs: [{ callee: 'processData', lineStart: 20 }],
            hasValidation: false,
            hasSinkInBody: true,
            paramConfidence: 'high',
          }),
        ],
      }),
    ];
    const findings = detectInputPassthroughRisk(files);
    expect(findings).toHaveLength(0);
  });

  it('skips when hasValidation=true', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            callsWithInputArgs: [{ callee: 'processData', lineStart: 20 }],
            hasValidation: true,
            hasSinkInBody: false,
            paramConfidence: 'high',
          }),
        ],
      }),
    ];
    const findings = detectInputPassthroughRisk(files);
    expect(findings).toHaveLength(0);
  });

  it('skips test files', () => {
    const files = [
      makeFileEntry({
        file: 'src/api.spec.ts',
        inputSources: [
          makeInputSource({
            callsWithInputArgs: [{ callee: 'processData', lineStart: 20 }],
            hasValidation: false,
            hasSinkInBody: false,
            paramConfidence: 'high',
          }),
        ],
      }),
    ];
    const findings = detectInputPassthroughRisk(files);
    expect(findings).toHaveLength(0);
  });
});

describe('detectPathTraversalRisk', () => {
  it('detects high severity when fs-read sink, paramConfidence=high, no validation', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            sinkKinds: ['fs-read'],
            paramConfidence: 'high',
            hasValidation: false,
            hasSinkInBody: true,
            callsWithInputArgs: [{ callee: 'fs.readFile', lineStart: 15 }],
          }),
        ],
      }),
    ];
    const findings = detectPathTraversalRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].category).toBe('path-traversal-risk');
  });

  it('detects medium severity when hasValidation=true', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            sinkKinds: ['fs-read'],
            paramConfidence: 'high',
            hasValidation: true,
            hasSinkInBody: true,
            callsWithInputArgs: [{ callee: 'fs.readFile', lineStart: 15 }],
          }),
        ],
      }),
    ];
    const findings = detectPathTraversalRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('skips when paramConfidence=low', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            sinkKinds: ['fs-read'],
            paramConfidence: 'low',
            hasValidation: false,
            hasSinkInBody: true,
          }),
        ],
      }),
    ];
    const findings = detectPathTraversalRisk(files);
    expect(findings).toHaveLength(0);
  });

  it('skips when no fs-read or path-resolve sinks', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            sinkKinds: ['eval'],
            paramConfidence: 'high',
            hasValidation: false,
            hasSinkInBody: true,
          }),
        ],
      }),
    ];
    const findings = detectPathTraversalRisk(files);
    expect(findings).toHaveLength(0);
  });

  it('skips test files', () => {
    const files = [
      makeFileEntry({
        file: 'src/file.test.ts',
        inputSources: [
          makeInputSource({
            sinkKinds: ['fs-read'],
            paramConfidence: 'high',
            hasValidation: false,
            hasSinkInBody: true,
          }),
        ],
      }),
    ];
    const findings = detectPathTraversalRisk(files);
    expect(findings).toHaveLength(0);
  });
});

describe('detectCommandInjectionRisk', () => {
  it('detects critical severity for exec callees with paramConfidence=high', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            sinkKinds: ['exec'],
            paramConfidence: 'high',
            hasValidation: false,
            hasSinkInBody: true,
            callsWithInputArgs: [
              { callee: 'child_process.exec', lineStart: 15 },
            ],
          }),
        ],
      }),
    ];
    const findings = detectCommandInjectionRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].category).toBe('command-injection-risk');
    expect(findings[0].title).toContain('exec');
  });

  it('detects high severity for spawn callees (no exec)', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            sinkKinds: ['exec'],
            paramConfidence: 'high',
            hasValidation: false,
            hasSinkInBody: true,
            callsWithInputArgs: [
              { callee: 'child_process.spawn', lineStart: 15 },
            ],
          }),
        ],
      }),
    ];
    const findings = detectCommandInjectionRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].title).toContain('spawn');
  });

  it('skips when paramConfidence=low', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            sinkKinds: ['exec'],
            paramConfidence: 'low',
            hasValidation: false,
            hasSinkInBody: true,
            callsWithInputArgs: [
              { callee: 'child_process.exec', lineStart: 15 },
            ],
          }),
        ],
      }),
    ];
    const findings = detectCommandInjectionRisk(files);
    expect(findings).toHaveLength(0);
  });

  it('skips when no exec sinks', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            sinkKinds: ['eval'],
            paramConfidence: 'high',
            hasValidation: false,
            hasSinkInBody: true,
            callsWithInputArgs: [{ callee: 'eval', lineStart: 15 }],
          }),
        ],
      }),
    ];
    const findings = detectCommandInjectionRisk(files);
    expect(findings).toHaveLength(0);
  });

  it('only emits exec finding when both exec and spawn callees exist', () => {
    const files = [
      makeFileEntry({
        inputSources: [
          makeInputSource({
            sinkKinds: ['exec'],
            paramConfidence: 'high',
            hasValidation: false,
            hasSinkInBody: true,
            callsWithInputArgs: [
              { callee: 'child_process.exec', lineStart: 15 },
              { callee: 'child_process.spawn', lineStart: 20 },
            ],
          }),
        ],
      }),
    ];
    const findings = detectCommandInjectionRisk(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('exec');
    expect(findings[0].title).not.toContain('spawn');
  });

  it('skips test files', () => {
    const files = [
      makeFileEntry({
        file: 'src/exec.test.ts',
        inputSources: [
          makeInputSource({
            sinkKinds: ['exec'],
            paramConfidence: 'high',
            hasValidation: false,
            hasSinkInBody: true,
            callsWithInputArgs: [{ callee: 'exec', lineStart: 5 }],
          }),
        ],
      }),
    ];
    const findings = detectCommandInjectionRisk(files);
    expect(findings).toHaveLength(0);
  });
});
