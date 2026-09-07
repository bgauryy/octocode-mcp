import { afterEach, describe, expect, it, vi } from 'vitest';
import { printWelcome } from '../../src/ui/header.js';

vi.mock('../../src/utils/context.js', () => ({
  getAppContext: () => ({ cwd: '/project', ide: 'Terminal', git: null }),
}));

const columns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
afterEach(() => {
  vi.restoreAllMocks();
  if (columns) Object.defineProperty(process.stdout, 'columns', columns);
  else Reflect.deleteProperty(process.stdout, 'columns');
});

describe('welcome layout', () => {
  it('keeps the brand readable without wrapping art in a narrow terminal', () => {
    Object.defineProperty(process.stdout, 'columns', {
      value: 36,
      configurable: true,
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    printWelcome();
    const lines = log.mock.calls.map(args => args.join(' '));
    expect(lines.join('\n')).toContain('octocode code');
    expect(lines.every(line => line.length <= 36)).toBe(true);
    expect(lines.length).toBeLessThan(14);
  });
});
