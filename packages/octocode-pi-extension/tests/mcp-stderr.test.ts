import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OctocodeServer } from '../src/mcp/client.js';
import { shortPath } from '../src/shared/format.js';
import { sessionOutputDir } from '../src/shared/home.js';
import { tmp } from './helpers.js';

/** A server that writes `stderr` and dies before it speaks MCP: the connect fails, and the failure carries its stderr. */
async function failure(stderr: string): Promise<string> {
  const server = new OctocodeServer({
    launch: (cwd) => ({ command: process.execPath, args: ['-e', `require('node:fs').writeSync(2, ${JSON.stringify(stderr)}); process.exit(3)`], cwd, env: {} }),
    clientInfo: { name: 'test', version: '0' },
    onTools: () => undefined,
    onFailure: () => undefined,
  });
  server.start(tmp());
  expect(await server.ready()).toBe(false);
  const { error } = server.status();
  await server.close();
  return error!;
}

describe('an MCP server\'s stderr in its failure', () => {
  it('is shown whole when it fits, with no note and no file', async () => {
    const before = fs.readdirSync(sessionOutputDir('output')).filter((name) => name.startsWith('mcp-stderr'));
    const error = await failure('kaboom: the config is broken');
    expect(error).toMatch(/\nkaboom: the config is broken$/);
    expect(error).not.toContain('[server stderr');
    expect(fs.readdirSync(sessionOutputDir('output')).filter((name) => name.startsWith('mcp-stderr'))).toEqual(before);
  });

  it('is saved whole when only its tail fits, and the error says how much it shows and where the rest is', async () => {
    const whole = Array.from({ length: 400 }, (_, n) => `server diagnostic ${n + 1}`).join('\n');
    const error = await failure(whole);
    const [, file] = /\[server stderr: last 2000 of (?:\d+) characters; whole: (.+)\]/.exec(error) ?? [];
    expect(file).toBeDefined();
    const saved = sessionOutputDir('output');
    const match = fs.readdirSync(saved).find((name) => name.startsWith('mcp-stderr') && shortPath(path.join(saved, name)) === file);
    expect(match).toBeDefined();
    expect(fs.readFileSync(path.join(saved, match!), 'utf8')).toBe(whole);
    expect(error).toContain(`of ${whole.length} characters`);
    expect(error).toMatch(/server diagnostic 400$/);
    expect(error).not.toContain('server diagnostic 1\n');
  });
});
