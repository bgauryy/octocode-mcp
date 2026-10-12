import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EXIT,
  reportExecutionFailure,
  toolErrorJson,
} from '../../src/cli/exit-codes.js';

describe('exit codes', () => {
  it('matches the native exit table for the codes Node emits', () => {
    expect(EXIT).toEqual({ OK: 0, GENERAL: 1, USAGE: 2, TOOL: 5 });
  });
});

describe('error envelope', () => {
  it('is the native `{error, errorCode}` shape, with no success flag', () => {
    expect(JSON.parse(toolErrorJson('boom'))).toEqual({ error: 'boom' });
    expect(JSON.parse(toolErrorJson('boom', 'executionFailed'))).toEqual({
      error: 'boom',
      errorCode: 'executionFailed',
    });
  });
});

describe('reportExecutionFailure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints the typed envelope on stdout under --json and returns exit 5', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(reportExecutionFailure('down', true, 'toolUnavailable')).toBe(5);
    expect(JSON.parse(String(log.mock.calls[0]![0]))).toEqual({
      error: 'down',
      errorCode: 'toolUnavailable',
    });
    expect(err).not.toHaveBeenCalled();
  });

  it('prints the text on stderr otherwise and returns exit 5', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(reportExecutionFailure('down', false, 'toolUnavailable')).toBe(5);
    expect(err).toHaveBeenCalledWith('down');
    expect(log).not.toHaveBeenCalled();
  });
});
