#!/usr/bin/env node
import { parseArgs, pickInstance } from './args.js';
import { ApiClient } from './client.js';
import { EXTERNAL_CALL_MARGIN_MS, EXTERNAL_PROMPT_DEFAULT_MS } from './protocol.js';
import { apiDir, listInstances } from './registry.js';
import { errorMessage } from '../shared/util.js';

const USAGE = `octocode-pi-api — talk to running Octocode Pi sessions (start them with OCTOCODE_API=1)

  octocode-pi-api list
  octocode-pi-api status [--to <id>]
  octocode-pi-api send [--to <id>] [--from <name>] [--wait] [--mode steer|followUp] <text…>
  octocode-pi-api watch [--to <id>] [--types a,b] [--top-level]
  octocode-pi-api abort [--to <id>]
  octocode-pi-api external [--to <id>] '<JSON>'

--to defaults to the only running instance (or the one in the current directory).
--top-level drops tool events of calls other tools made (those with parentId).`;

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const { flags, words } = parseArgs(rest);
  const instances = listInstances(apiDir());
  if (command === 'list') {
    for (const entry of instances) console.log(`${entry.id}\tpid ${entry.pid}\t${entry.cwd}`);
    return;
  }
  if (!command || !['status', 'send', 'watch', 'abort', 'external'].includes(command)) {
    console.log(USAGE);
    process.exitCode = command ? 1 : 0;
    return;
  }
  const client = new ApiClient(pickInstance(instances, flags.get('to') as string | undefined, process.cwd()));
  if (command === 'status') console.log(JSON.stringify(await client.call('status'), null, 2));
  else if (command === 'external') {
    const input: unknown = JSON.parse(words.join(' '));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('external requires one JSON object');
    const timeout = (input as Record<string, unknown>)['timeoutMs'];
    const timeoutMs = typeof timeout === 'number' ? timeout + EXTERNAL_CALL_MARGIN_MS : EXTERNAL_PROMPT_DEFAULT_MS + EXTERNAL_CALL_MARGIN_MS;
    console.log(JSON.stringify(await client.call('external.call', input as Record<string, unknown>, { timeoutMs }), null, 2));
  }
  else if (command === 'abort') console.log(JSON.stringify(await client.call('turn.abort')));
  else if (command === 'send') {
    const result = await client.call<{ text?: string }>('message.send', {
      text: words.join(' '),
      ...(flags.has('from') ? { from: flags.get('from') } : {}),
      ...(flags.has('mode') ? { mode: flags.get('mode') } : {}),
      ...(flags.get('wait') ? { wait: true } : {}),
    });
    console.log(flags.get('wait') ? (result.text ?? '') : JSON.stringify(result));
  } else {
    const types = typeof flags.get('types') === 'string' ? (flags.get('types') as string).split(',') : undefined;
    await client.watch((event) => console.log(JSON.stringify(event)), { ...(types ? { types } : {}), ...(flags.get('top-level') ? { topLevel: true } : {}) });
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
