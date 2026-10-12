import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportCrash } from '../../src/cli/crash.js';
import { NativeLaunchError } from '../../src/cli/native-delegate.js';

describe('reportCrash', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints the native error envelope under --json and exits 5, not 1', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = reportCrash(new Error('kaboom'), [
      'localFetch',
      '{"queries":[]}',
      '--json',
    ]);
    expect(code).toBe(5);
    const printed = JSON.parse(String(log.mock.calls[0]![0]));
    expect(printed).toEqual({ error: 'kaboom', errorCode: 'executionFailed' });
    expect(printed).not.toHaveProperty('success');
    expect(err).not.toHaveBeenCalled();
  });

  it('reads the parsed flag, not raw argv text', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    // `--json` appears only inside a JSON query value; `--json=false` is off.
    reportCrash(new Error('x'), ['localFetch', '{"matchString":"--json"}']);
    reportCrash(new Error('x'), ['localFetch', '--json=false']);
    expect(log).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(2);
    log.mockClear();
    reportCrash(new Error('x'), ['localFetch', '--json=true']);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('keeps the stack for an unexpected crash on stderr and exits 5', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('kaboom');
    expect(reportCrash(failure, ['tools'])).toBe(5);
    expect(err).toHaveBeenCalledWith('Error:', failure);
  });

  it('prints only the message for a native launch failure', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new NativeLaunchError('Cannot start /x: EACCES');
    expect(reportCrash(failure, ['tools'])).toBe(5);
    expect(err).toHaveBeenCalledWith('Cannot start /x: EACCES');
  });

  it('stringifies a non-Error rejection', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportCrash('plain', ['tools', '--json']);
    expect(JSON.parse(String(log.mock.calls[0]![0])).error).toBe('plain');
  });
});
