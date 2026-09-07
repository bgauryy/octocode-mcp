import { describe, expect, it } from 'vitest';
import { specsFor } from '../src/hooks-install-health.js';

describe('hook profile tool matchers', () => {
  const params = { globalMode: false, projectDir: '/work/repo', hookDir: '/work/hooks' };

  it('registers generic tool events for coordination while guard stays mutation-selective', () => {
    const coordination = specsFor('codex', { ...params, profile: 'coordination' });
    expect(coordination.find(({ event }) => event === 'PreToolUse')).not.toHaveProperty('matcher');
    expect(coordination.find(({ event }) => event === 'PostToolUse')).not.toHaveProperty('matcher');

    const guard = specsFor('codex', { ...params, profile: 'guard' });
    expect(guard.find(({ event }) => event === 'PreToolUse')?.matcher).toContain('apply_patch');
    expect(guard.find(({ event }) => event === 'PostToolUse')?.matcher).toContain('Write');
  });
});
