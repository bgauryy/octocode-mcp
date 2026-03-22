import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../mcpCache.js', () => ({
  isMcpInitialized: vi.fn().mockReturnValue(true),
}));

import { checkReadiness } from '../../middleware/readiness.js';
import { isMcpInitialized } from '../../mcpCache.js';

function createApp() {
  const app = express();
  app.use(checkReadiness);
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('checkReadiness middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() when MCP is initialized', async () => {
    vi.mocked(isMcpInitialized).mockReturnValue(true);
    const res = await request(createApp()).get('/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 503 when MCP is not initialized', async () => {
    vi.mocked(isMcpInitialized).mockReturnValue(false);
    const res = await request(createApp()).get('/test');
    expect(res.status).toBe(503);
  });

  it('returns SERVER_INITIALIZING error code', async () => {
    vi.mocked(isMcpInitialized).mockReturnValue(false);
    const res = await request(createApp()).get('/test');
    expect(res.body.error.code).toBe('SERVER_INITIALIZING');
  });

  it('returns success: false', async () => {
    vi.mocked(isMcpInitialized).mockReturnValue(false);
    const res = await request(createApp()).get('/test');
    expect(res.body.success).toBe(false);
  });

  it('includes retry hint', async () => {
    vi.mocked(isMcpInitialized).mockReturnValue(false);
    const res = await request(createApp()).get('/test');
    expect(res.body.error.hint).toContain('retry');
  });

  it('does not call next() when returning 503', async () => {
    vi.mocked(isMcpInitialized).mockReturnValue(false);
    const res = await request(createApp()).get('/test');
    expect(res.status).toBe(503);
    expect(res.body).not.toHaveProperty('ok');
  });
});
