import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import octocode from '../src/index.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

/**
 * Pi validates tool arguments against the schema and refuses a call that breaks a bound, echoing every argument back:
 * the model pays for its input twice and retries. So the extension's schemas describe shape (types, enums, required
 * fields) and never size or range; the tools normalize at runtime (clamp numbers, clip display labels, spill long text).
 */
const BOUNDS = ['maxLength', 'minLength', 'maxItems', 'minItems', 'maximum', 'minimum', 'exclusiveMaximum', 'exclusiveMinimum', 'pattern', 'maxProperties', 'minProperties'];

function boundsIn(schema: unknown, at: string, found: string[]): string[] {
  if (Array.isArray(schema)) schema.forEach((item, index) => boundsIn(item, `${at}[${index}]`, found));
  else if (schema && typeof schema === 'object') {
    for (const [key, value] of Object.entries(schema)) {
      if (BOUNDS.includes(key)) found.push(`${at}.${key}`);
      boundsIn(value, `${at}.${key}`, found);
    }
  }
  return found;
}

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = { ...process.env };
  process.env['OCTOCODE_HOME'] = tmp();
});
afterEach(() => {
  process.env = saved;
});

describe('tool schemas', () => {
  for (const subagent of [false, true]) {
    it(`carry no size or range bounds (${subagent ? 'subagent' : 'main session'})`, async () => {
      if (subagent) process.env['OCTOCODE_SUBAGENT'] = '1';
      const fake = fakePi();
      Object.assign(fake.pi, { getSessionName: () => undefined });
      await octocode(fake.pi);
      const ctx = fakeCtx({ cwd: tmp(), hasUI: !subagent });
      Object.assign(ctx.ui, { onTerminalInput: () => () => undefined });
      await fake.fire('session_start', { type: 'session_start', reason: 'startup' }, ctx);
      const tools = fake.pi.getAllTools();
      expect(tools.length).toBeGreaterThan(5);
      const found = tools.flatMap((tool: { name: string; parameters: unknown }) => boundsIn(tool.parameters, tool.name, []));
      expect(found).toEqual([]);
    });
  }
});
