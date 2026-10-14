import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import octocode from '../src/index.js';
import { fingerprint, projectConfigFiles, saveDecision } from '../src/shared/trust.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = { ...process.env };
  process.env['OCTOCODE_HOME'] = tmp();
  process.env['OCTOCODE_HOOKS'] = '1';
  delete process.env['OCTOCODE_SUBAGENT'];
});
afterEach(() => {
  process.env = saved;
});

describe('the composed extension and a PreToolUse hook that fails', () => {
  it('records the failure in the permission audit through the hook sink, with the hook as its source', async () => {
    const cwd = tmp();
    fs.mkdirSync(path.join(cwd, '.git'));
    fs.mkdirSync(path.join(cwd, '.codex'));
    fs.writeFileSync(path.join(cwd, '.codex', 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'exit 3', failClosed: true }] }] } }));
    saveDecision(cwd, fingerprint(projectConfigFiles(cwd)), true);
    const fake = fakePi();
    Object.assign(fake.pi, { getSessionName: () => undefined });
    octocode(fake.pi);
    const ctx = Object.assign(fakeCtx({ cwd, hasUI: true, mode: 'rpc' }), { isProjectTrusted: () => true });
    await fake.fire('session_start', { type: 'session_start', reason: 'startup' }, ctx);
    await fake.fire('tool_call', { type: 'tool_call', toolCallId: 'b1', toolName: 'bash', input: { command: 'ls' } }, ctx);
    expect(fake.entries.map((entry) => entry.data)).toContainEqual(expect.objectContaining({ via: 'hook', allowed: false, note: expect.stringContaining('failClosed denied') }));
  });
});
