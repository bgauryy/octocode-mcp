/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler.js';

vi.mock('../../mcpCache.js', () => ({
  getMcpContent: vi.fn().mockReturnValue({
    tools: {},
    prompts: {
      research: {
        name: 'Research',
        description: 'Start a code research session',
        args: [
          { name: 'goal', description: 'The research goal', required: true },
          { name: 'context', description: 'Additional context', required: false },
        ],
        content: 'You are a code research agent...',
      },
      research_local: {
        name: 'Research Local',
        description: 'Research local codebase',
        args: [{ name: 'goal', description: 'What to investigate', required: true }],
        content: 'Investigate the local codebase...',
      },
      plan: {
        name: 'Plan',
        description: 'Plan an implementation',
        args: [],
        content: 'Plan the implementation steps...',
      },
    },
    instructions: 'Test',
    baseHints: [],
    genericErrorHints: [],
  }),
  initializeMcpContent: vi.fn().mockResolvedValue({}),
  isMcpInitialized: vi.fn().mockReturnValue(true),
}));

vi.mock('../../index.js', () => ({
  logPromptCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/asyncTimeout.js', () => ({
  fireAndForgetWithTimeout: vi.fn(),
}));

import { promptsRoutes } from '../../routes/prompts.js';

function createApp(): any {
  const app = express();
  app.use(express.json());
  app.use('/prompts', promptsRoutes);
  app.use(errorHandler);
  return app;
}

describe('Prompts Routes', () => {
  let app: any;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  describe('GET /prompts/list', () => {
    it('returns 200 with all prompts', async () => {
      const res = await request(app).get('/prompts/list');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns correct number of prompts', async () => {
      const res = await request(app).get('/prompts/list');
      expect(res.body.data.prompts).toHaveLength(3);
      expect(res.body.data.totalCount).toBe(3);
    });

    it('includes version', async () => {
      const res = await request(app).get('/prompts/list');
      expect(res.body.data).toHaveProperty('version');
    });

    it('each prompt has name and description', async () => {
      const res = await request(app).get('/prompts/list');
      for (const prompt of res.body.data.prompts) {
        expect(prompt).toHaveProperty('name');
        expect(prompt).toHaveProperty('description');
      }
    });

    it('uses key name not display name', async () => {
      const res = await request(app).get('/prompts/list');
      const names = res.body.data.prompts.map((p: any) => p.name);
      expect(names).toContain('research');
      expect(names).toContain('research_local');
      expect(names).toContain('plan');
    });

    it('includes arguments when present', async () => {
      const res = await request(app).get('/prompts/list');
      const research = res.body.data.prompts.find((p: any) => p.name === 'research');
      expect(research.arguments).toHaveLength(2);
      expect(research.arguments[0]).toEqual({
        name: 'goal',
        description: 'The research goal',
        required: true,
      });
    });

    it('includes hints', async () => {
      const res = await request(app).get('/prompts/list');
      expect(res.body.hints).toBeDefined();
      expect(res.body.hints[0]).toContain('/prompts/info/');
    });
  });

  describe('GET /prompts/info/:promptName', () => {
    it('returns prompt details for valid prompt', async () => {
      const res = await request(app).get('/prompts/info/research');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Research');
      expect(res.body.data.description).toBe('Start a code research session');
    });

    it('includes prompt content', async () => {
      const res = await request(app).get('/prompts/info/research');
      expect(res.body.data.content).toBe('You are a code research agent...');
    });

    it('includes arguments with required field', async () => {
      const res = await request(app).get('/prompts/info/research');
      expect(res.body.data.arguments).toHaveLength(2);
      expect(res.body.data.arguments[0].required).toBe(true);
      expect(res.body.data.arguments[1].required).toBe(false);
    });

    it('returns prompt with no arguments', async () => {
      const res = await request(app).get('/prompts/info/plan');
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Plan');
    });

    it('returns 404 for unknown prompt', async () => {
      const res = await request(app).get('/prompts/info/nonExistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('provides helpful hints for unknown prompt', async () => {
      const res = await request(app).get('/prompts/info/badPrompt');
      expect(res.body.hints).toBeDefined();
      expect(res.body.hints.some((h: string) => h.includes('badPrompt'))).toBe(true);
      expect(res.body.hints.some((h: string) => h.includes('Available prompts'))).toBe(true);
      expect(res.body.hints.some((h: string) => h.includes('/prompts/list'))).toBe(true);
    });

    it('logs prompt call for telemetry', async () => {
      await request(app).get('/prompts/info/research');
      const { fireAndForgetWithTimeout } = await import('../../utils/asyncTimeout.js');
      expect(fireAndForgetWithTimeout).toHaveBeenCalled();
    });
  });

  describe('Readiness gate', () => {
    it('returns 503 when not initialized', async () => {
      const { isMcpInitialized } = await import('../../mcpCache.js');
      vi.mocked(isMcpInitialized).mockReturnValue(false);

      const res = await request(app).get('/prompts/list');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SERVER_INITIALIZING');

      vi.mocked(isMcpInitialized).mockReturnValue(true);
    });
  });
});
