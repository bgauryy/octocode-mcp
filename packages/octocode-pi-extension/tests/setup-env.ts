import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

// A suite started from inside Pi (or one of its subagents) inherits that session's OCTOCODE_* identity and settings: start from none, so results never depend on who ran the tests.
for (const name of Object.keys(process.env)) if (name.startsWith('OCTOCODE_')) delete process.env[name];

// Tests must never touch the user's real ~/.octocode (its agent database is shared with every running Pi): tests that
// "restore" OCTOCODE_HOME/OCTOCODE_AGENT_DB restore these per-worker temporary paths, so late async work stays sandboxed.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-test-home-'));
process.env['OCTOCODE_HOME'] = home;
delete process.env['OCTOCODE_AGENT_DB'];
// Nor the user's real ~/.pi/agent: Pi's `/trust` store lives there. Like a developer who trusted their code folder, the
// suite saves one decision trusting the temp folder every test project is created in; untrusted cases use their own dir.
const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-test-pi-agent-'));
fs.writeFileSync(path.join(agentDir, 'trust.json'), JSON.stringify({ [fs.realpathSync(os.tmpdir())]: true }));
process.env['PI_CODING_AGENT_DIR'] = agentDir;
// A fake Pi never runs the Octocode server: no server process or first-prompt wait unless a test opts in (e2e runs the
// real server; mcp.test.ts passes its own env).
process.env['OCTOCODE_MCP'] = '0';
// No models.dev requests from tests; the catalog is tested with an injected fetch.
process.env['OCTOCODE_MODELS_DEV'] = '0';

// `vi.waitFor` gives up after 1 s unless told otherwise. The suite polls for work done by child processes, sockets and
// git (journal lines, a started peer, a released lease), which takes longer than that when the machine is far more
// loaded than it has cores. The limit only decides when a condition that never comes is reported: a condition that
// holds returns at the next 50 ms check, so a call that passes its own `timeout` keeps it.
const WAIT_FOR_TIMEOUT_MS = 20_000;
const waitFor = vi.waitFor.bind(vi);
vi.waitFor = ((callback, options) => waitFor(callback, typeof options === 'number' ? options : { timeout: WAIT_FOR_TIMEOUT_MS, ...options })) as typeof vi.waitFor;
