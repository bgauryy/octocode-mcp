#!/usr/bin/env node
// Browser-free CDP listener for cleanup tests. Its command line carries the same
// --remote-debugging-port/--user-data-dir flags as a launched Chrome, and it
// answers /json/version plus SystemInfo.getProcessInfo with its own pid.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const flag = name =>
  process.argv
    .find(arg => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const port = Number(flag('remote-debugging-port'));
const server = createServer((req, res) => {
  if (req.url !== '/json/version') return res.writeHead(404).end();
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      Browser: 'FakeChrome/1.0',
      webSocketDebuggerUrl: `ws://localhost:${port}/devtools/browser/fake`,
    })
  );
});
new WebSocketServer({ server }).on('connection', socket =>
  socket.on('message', data => {
    const { id, method } = JSON.parse(String(data));
    socket.send(
      JSON.stringify(
        method === 'SystemInfo.getProcessInfo'
          ? {
              id,
              result: {
                processInfo: [{ type: 'browser', id: process.pid, cpuTime: 0 }],
              },
            }
          : { id, error: { code: -32601, message: 'not found' } }
      )
    );
  })
);
server.listen(port, () => console.log('ready'));
