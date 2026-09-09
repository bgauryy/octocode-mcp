import { executeAwarenessCli } from '../src/command-cli.js';

const result = await executeAwarenessCli(process.argv.slice(2), {
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
  },
});
const compact = process.argv.includes('--compact') || process.env.OCTOCODE_AWARENESS_COMPACT === '1';
if (result.text !== undefined) process.stdout.write(result.text.endsWith('\n') ? result.text : `${result.text}\n`);
else if (result.payload !== null) process.stdout.write(`${JSON.stringify(result.payload, null, compact ? 0 : 2)}\n`);
for (const diagnostic of result.diagnostics ?? []) process.stderr.write(`${diagnostic}\n`);
process.exitCode = result.exitCode;
