// astRewrite is parked: the contract disables it on every surface, beta
// included. This suite proves the parked state: MCP does not list
// it, the CLI refuses every call (preview and apply) with the one disabled
// error, and nothing is written. The preview/apply checks return with the tool.
import fs from 'node:fs';
import path from 'node:path';
import { RESULTS, checks, cli, startServer, writeResults } from './mcp-client.mjs';

const { check, summary } = checks('rewrite');
const DISABLED = {
  error: 'Tool astRewrite is not available in this native runtime: it is disabled in this build.',
  errorCode: 'toolUnavailable',
};
const SOURCE = 'fn main() { let value = Some(1).unwrap(); }\n';

const temp = path.join(RESULTS, `rewrite-parked-${process.pid}`);
fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });
const file = path.join(temp, 'main.rs');
fs.writeFileSync(file, SOURCE);
try {
  const rows = [
    ['preview', { path: temp, language: 'rust', pattern: '$X.unwrap()', rewrite: '$X.expect("checked")' }],
    ['rule preview', { path: temp, language: 'rust', rule: { pattern: '$X.unwrap()' }, fix: '$X.expect("checked")' }],
    ['apply', { path: temp, language: 'rust', pattern: '$X.unwrap()', rewrite: '$X.expect("checked")', apply: true }],
  ];
  for (const [label, row] of rows) {
    const run = cli('astRewrite', { queries: [row] }, { env: { OCTOCODE_BETA: 'true' } });
    let body;
    try { body = JSON.parse(run.stdout); } catch { body = run.stdout; }
    check(`CLI ${label} is refused with the disabled error (exit 5)`, run.status === 5 && JSON.stringify(body) === JSON.stringify(DISABLED), `${run.status} ${run.stdout.slice(0, 200)}`);
  }
  check('a refused rewrite writes nothing', fs.readFileSync(file, 'utf8') === SOURCE, fs.readFileSync(file, 'utf8'));

  const client = await startServer({ env: { OCTOCODE_BETA: 'true' } });
  try {
    check('MCP does not list astRewrite, even with beta', !client.tools.some(tool => tool.name === 'astRewrite'), client.tools.map(tool => tool.name).join(','));
  } finally {
    client.close();
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

writeResults('rewrite', summary());
