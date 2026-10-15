import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { OctocodeServer } from '../src/mcp/client.js';

describe('MCP tool refresh ordering', () => {
  it.each(['overlap', 'connecting'])('keeps the newest tools when notifications arrive during %s', async (mode) => {
    const seen: string[][] = [];
    const failures: string[] = [];
    const server = new OctocodeServer({
      clientInfo: { name: 'test', version: '1' },
      launch: (cwd) => ({ command: process.execPath, args: [fileURLToPath(new URL('./fixtures/relist-mcp.mjs', import.meta.url)), mode], cwd, env: {} }),
      onTools: (tools) => seen.push(tools.map((tool) => tool.name)),
      onFailure: (error) => failures.push(error),
      requestTimeoutMs: 5_000,
    });
    try {
      server.start(process.cwd());
      expect(await server.ready()).toBe(true);
      // Both reversed responses must have reached the client before inspecting its final published list.
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(failures).toEqual([]);
      expect(seen).toEqual([['initial'], ['new']]);
    } finally { await server.close(); }
  });

  it('reports a failed re-list once, and keeps the tools it already has', async () => {
    const seen: string[][] = [];
    const refreshFailures: string[] = [];
    const server = new OctocodeServer({
      clientInfo: { name: 'test', version: '1' },
      launch: (cwd) => ({ command: process.execPath, args: [fileURLToPath(new URL('./fixtures/relist-mcp.mjs', import.meta.url)), 'failing'], cwd, env: {} }),
      onTools: (tools) => seen.push(tools.map((tool) => tool.name)),
      onFailure: () => undefined,
      onRefreshFailure: (message) => refreshFailures.push(message),
      requestTimeoutMs: 5_000,
    });
    try {
      server.start(process.cwd());
      expect(await server.ready()).toBe(true);
      // The fixture announces a change twice; both re-lists fail.
      await vi.waitFor(() => expect(refreshFailures).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(refreshFailures).toEqual([expect.stringContaining('list failed')]);
      expect(seen).toEqual([['initial']]);
      expect(server.status().tools).toBe(1);
    } finally { await server.close(); }
  });
});
