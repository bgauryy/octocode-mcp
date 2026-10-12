// A real stdio server whose older tools/list reply can arrive after the newer reply.
import readline from 'node:readline';

const send = (value) => console.log(JSON.stringify(value));
const changed = () => send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
let lists = 0;
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  if (request.method === 'initialize') {
    send({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: request.params.protocolVersion, capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'relist', version: '1' } } });
  }
  if (request.method === 'tools/list') {
    const count = ++lists;
    const connecting = process.argv[2] === 'connecting';
    const name = count === 1 ? 'initial' : count === 2 && !connecting ? 'old' : 'new';
    setTimeout(() => send({ jsonrpc: '2.0', id: request.id, result: { tools: [{ name, inputSchema: { type: 'object' } }] } }), (connecting ? count === 1 : count === 2) ? 100 : 0);
    if (count === 1) {
      setTimeout(changed, 15);
      if (!connecting) setTimeout(changed, 30);
    }
  }
});
