import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSharedAgentDb, sharedAgentDb } from '../src/agentdb/db.js';
import octocode from '../src/index.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = { ...process.env };
  const home = tmp();
  process.env['OCTOCODE_HOME'] = home;
  process.env['OCTOCODE_AGENT_DB'] = path.join(home, 'team.sqlite');
  delete process.env['OCTOCODE_SUBAGENT'];
  closeSharedAgentDb();
});
afterEach(() => {
  closeSharedAgentDb();
  process.env = saved;
});

const usable = (handle: ReturnType<typeof sharedAgentDb>): boolean => {
  try {
    handle.db.prepare('select 1').get();
    return true;
  } catch {
    return false;
  }
};

describe('the composed extension on session_shutdown', () => {
  // A new, resumed, forked or reloaded session imports the module again: this process's connection would never be reused.
  it.each(['quit', 'reload', 'new', 'resume', 'fork'])('closes the shared agent database on %s, and the next use reopens it', async (reason) => {
    const fake = fakePi();
    Object.assign(fake.pi, { getSessionName: () => undefined });
    octocode(fake.pi);
    const ctx = fakeCtx({ cwd: tmp(), hasUI: false });
    const before = sharedAgentDb();
    expect(usable(before)).toBe(true);
    await fake.fire('session_shutdown', { type: 'session_shutdown', reason }, ctx);
    expect(usable(before)).toBe(false);
    const after = sharedAgentDb();
    expect(after).not.toBe(before);
    expect(usable(after)).toBe(true);
  });
});
