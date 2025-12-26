/**
 * Command Execution Mock for Testing
 *
 * Provides a fluent builder API for mocking safeExec command execution.
 *
 * @example
 * ```typescript
 * const execMock = createExecMock()
 *   .onCommand('ls').withArgs(['-la']).returns({ files: ['a', 'b'] })
 *   .onCommand('rg').withPattern('test').returnsJson([{ path: 'test.ts' }])
 *   .onCommand('find').throws('Permission denied')
 *   .build();
 *
 * vi.mocked(safeExec).mockImplementation(execMock.exec);
 * ```
 */

import { vi } from 'vitest';
import type { ExecResult } from '../../src/utils/types.js';

/**
 * Exec mock result configuration
 */
export interface ExecMockResult {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Command matcher function
 */
type CommandMatcher = (cmd: string, args: string[]) => boolean;

/**
 * Command response configuration
 */
interface CommandResponse {
  matcher: CommandMatcher;
  response: ExecMockResult | (() => ExecMockResult) | (() => never);
  isError?: boolean;
}

/**
 * Exec mock interface
 */
export interface ExecMock {
  /** Mock implementation for safeExec */
  exec: (cmd: string, args?: string[]) => Promise<ExecResult>;

  /** Get all registered matchers */
  getMatchers: () => CommandMatcher[];

  /** Clear all matchers */
  clear: () => void;

  /** Set default response for unmatched commands */
  setDefault: (response: ExecMockResult) => void;
}

/**
 * Command response builder for fluent API
 */
class CommandResponseBuilder {
  private parent: ExecMockBuilder;
  private matcher: CommandMatcher;

  constructor(parent: ExecMockBuilder, matcher: CommandMatcher) {
    this.parent = parent;
    this.matcher = matcher;
  }

  /**
   * Add argument matcher
   */
  withArgs(expectedArgs: string[]): this {
    const baseMatcher = this.matcher;
    this.matcher = (cmd, args) =>
      baseMatcher(cmd, args) && expectedArgs.every(arg => args.includes(arg));
    return this;
  }

  /**
   * Add pattern matcher (for ripgrep)
   */
  withPattern(pattern: string): this {
    const baseMatcher = this.matcher;
    this.matcher = (cmd, args) =>
      baseMatcher(cmd, args) && args.includes(pattern);
    return this;
  }

  /**
   * Add path matcher
   */
  withPath(path: string): this {
    const baseMatcher = this.matcher;
    this.matcher = (cmd, args) => baseMatcher(cmd, args) && args.includes(path);
    return this;
  }

  /**
   * Return successful result with stdout
   */
  returns(stdout: string): ExecMockBuilder {
    this.parent.addResponse({
      matcher: this.matcher,
      response: {
        success: true,
        code: 0,
        stdout,
        stderr: '',
      },
    });
    return this.parent;
  }

  /**
   * Return successful result with JSON stdout
   */
  returnsJson<T>(data: T): ExecMockBuilder {
    return this.returns(JSON.stringify(data));
  }

  /**
   * Return successful result with multiple lines
   */
  returnsLines(lines: string[]): ExecMockBuilder {
    return this.returns(lines.join('\n'));
  }

  /**
   * Return empty result (no matches)
   */
  returnsEmpty(): ExecMockBuilder {
    return this.returns('');
  }

  /**
   * Return failed result
   */
  fails(stderr: string = 'Command failed', code: number = 1): ExecMockBuilder {
    this.parent.addResponse({
      matcher: this.matcher,
      response: {
        success: false,
        code,
        stdout: '',
        stderr,
      },
    });
    return this.parent;
  }

  /**
   * Throw an error (command never completes)
   */
  throws(message: string): ExecMockBuilder {
    this.parent.addResponse({
      matcher: this.matcher,
      response: () => {
        throw new Error(message);
      },
      isError: true,
    });
    return this.parent;
  }

  /**
   * Return a dynamic response based on arguments
   */
  dynamic(
    fn: (cmd: string, args: string[]) => ExecMockResult
  ): ExecMockBuilder {
    const matcher = this.matcher;
    this.parent.addResponse({
      matcher,
      response: () => fn('', []), // Placeholder - actual values passed at call time
    });
    return this.parent;
  }
}

/**
 * Builder for creating exec mocks
 */
export class ExecMockBuilder {
  private responses: CommandResponse[] = [];
  private defaultResponse: ExecMockResult = {
    success: true,
    code: 0,
    stdout: '',
    stderr: '',
  };

  /**
   * Add a command response (internal)
   */
  addResponse(response: CommandResponse): void {
    this.responses.push(response);
  }

  /**
   * Match a specific command
   */
  onCommand(command: string): CommandResponseBuilder {
    return new CommandResponseBuilder(this, cmd => cmd === command);
  }

  /**
   * Match any command
   */
  onAnyCommand(): CommandResponseBuilder {
    return new CommandResponseBuilder(this, () => true);
  }

  /**
   * Match ls command
   */
  onLs(path?: string): CommandResponseBuilder {
    if (path) {
      return new CommandResponseBuilder(
        this,
        (cmd, args) => cmd === 'ls' && args.includes(path)
      );
    }
    return new CommandResponseBuilder(this, cmd => cmd === 'ls');
  }

  /**
   * Match ripgrep command
   */
  onRipgrep(pattern?: string): CommandResponseBuilder {
    if (pattern) {
      return new CommandResponseBuilder(
        this,
        (cmd, args) => cmd === 'rg' && args.includes(pattern)
      );
    }
    return new CommandResponseBuilder(this, cmd => cmd === 'rg');
  }

  /**
   * Match find command
   */
  onFind(path?: string): CommandResponseBuilder {
    if (path) {
      return new CommandResponseBuilder(
        this,
        (cmd, args) => cmd === 'find' && args.includes(path)
      );
    }
    return new CommandResponseBuilder(this, cmd => cmd === 'find');
  }

  /**
   * Set default response for unmatched commands
   */
  setDefault(response: Partial<ExecMockResult>): this {
    this.defaultResponse = {
      ...this.defaultResponse,
      ...response,
    };
    return this;
  }

  /**
   * Build the mock
   */
  build(): ExecMock {
    const responses = [...this.responses];
    let defaultResponse = { ...this.defaultResponse };

    const exec = async (
      cmd: string,
      args: string[] = []
    ): Promise<ExecResult> => {
      // Find matching response
      for (const resp of responses) {
        if (resp.matcher(cmd, args)) {
          if (resp.isError && typeof resp.response === 'function') {
            resp.response(); // Will throw
          }
          return typeof resp.response === 'function'
            ? resp.response()
            : resp.response;
        }
      }

      // Return default
      return defaultResponse;
    };

    return {
      exec,
      getMatchers: () => responses.map(r => r.matcher),
      clear: () => {
        responses.length = 0;
      },
      setDefault: (response: ExecMockResult) => {
        defaultResponse = response;
      },
    };
  }
}

/**
 * Create an exec mock with fluent builder API
 */
export function createExecMock(): ExecMockBuilder {
  return new ExecMockBuilder();
}

/**
 * Create a simple exec mock that returns success for all commands
 */
export function createPermissiveExecMock(): ExecMock {
  return createExecMock()
    .setDefault({ success: true, code: 0, stdout: '', stderr: '' })
    .build();
}

/**
 * Apply exec mock to vitest mocked module
 */
export function applyExecMock(
  mockModule: { safeExec: ReturnType<typeof vi.fn> },
  mock: ExecMock
): void {
  mockModule.safeExec.mockImplementation(mock.exec);
}

// =============================================================================
// Pre-built response factories for common scenarios
// =============================================================================

/**
 * Create ls command response for directory listing
 */
export function createLsResponse(files: string[]): ExecMockResult {
  return {
    success: true,
    code: 0,
    stdout: files.join('\n'),
    stderr: '',
  };
}

/**
 * Create ripgrep JSON response for search results
 */
export function createRipgrepResponse(
  matches: Array<{
    path: string;
    line: number;
    text: string;
    column?: number;
  }>
): ExecMockResult {
  const jsonLines = matches.map(m =>
    JSON.stringify({
      type: 'match',
      data: {
        path: { text: m.path },
        lines: { text: m.text },
        line_number: m.line,
        absolute_offset: 0,
        submatches: [
          {
            match: { text: m.text.trim() },
            start: m.column ?? 0,
            end: (m.column ?? 0) + m.text.trim().length,
          },
        ],
      },
    })
  );

  // Add summary
  jsonLines.push(
    JSON.stringify({
      type: 'summary',
      data: {
        elapsed_total: { human: '0.001s' },
        stats: {
          elapsed: { human: '0.001s' },
          searches: 1,
          searches_with_match: matches.length > 0 ? 1 : 0,
          bytes_searched: 1000,
          bytes_printed: 100,
          matched_lines: matches.length,
          matches: matches.length,
        },
      },
    })
  );

  return {
    success: true,
    code: 0,
    stdout: jsonLines.join('\n'),
    stderr: '',
  };
}

/**
 * Create find command response for file listing
 */
export function createFindResponse(paths: string[]): ExecMockResult {
  return {
    success: true,
    code: 0,
    stdout: paths.join('\0') + (paths.length > 0 ? '\0' : ''),
    stderr: '',
  };
}
