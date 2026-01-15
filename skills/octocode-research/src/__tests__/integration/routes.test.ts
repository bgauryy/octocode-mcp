/**
 * Integration tests for route validation and response handling.
 *
 * @module tests/integration/routes
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { localRoutes } from '../../routes/local.js';
import { githubRoutes } from '../../routes/github.js';
import { lspRoutes } from '../../routes/lsp.js';
import { packageRoutes } from '../../routes/package.js';

// Mock the MCP tools
vi.mock('../../index.js', () => ({
  localSearchCode: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      files: []\n      totalMatches: 0' }],
  }),
  localGetFileContent: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      path: test.ts\n      content: "test"' }],
  }),
  localFindFiles: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      files: []' }],
  }),
  localViewStructure: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      structuredOutput: ""' }],
  }),
  githubSearchCode: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      files: []' }],
  }),
  githubGetFileContent: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      content: "test"' }],
  }),
  githubSearchRepositories: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      repositories: []' }],
  }),
  githubViewRepoStructure: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      structure: {}' }],
  }),
  githubSearchPullRequests: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      pull_requests: []' }],
  }),
  lspGotoDefinition: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      definition: null' }],
  }),
  lspFindReferences: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      references: []' }],
  }),
  lspCallHierarchy: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      calls: []' }],
  }),
  packageSearch: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'results:\n  - status: hasResults\n    data:\n      packages: []' }],
  }),
}));

// Create app factory with routes
function createApp(): any {
  const app = express();
  app.use(express.json());
  app.use('/local', localRoutes);
  app.use('/github', githubRoutes);
  app.use('/lsp', lspRoutes);
  app.use('/package', packageRoutes);
  return app;
}

describe('Route Validation', () => {
  describe('Local Routes', () => {
    describe('GET /local/search', () => {
      it('validates required pattern parameter', async () => {
        const res = await request(createApp()).get('/local/search');
        expect(res.status).toBe(400);
      });

      it('accepts valid search request', async () => {
        const res = await request(createApp())
          .get('/local/search')
          .query({ pattern: 'test', path: '/test' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('role');
      });

      it('returns proper response structure', async () => {
        const res = await request(createApp())
          .get('/local/search')
          .query({ pattern: 'test', path: '/test' });
        expect(res.body).toHaveProperty('role');
        expect(res.body).toHaveProperty('content');
      });
    });

    describe('GET /local/content', () => {
      it('validates required path parameter', async () => {
        const res = await request(createApp()).get('/local/content');
        expect(res.status).toBe(400);
      });

      it('accepts valid content request', async () => {
        const res = await request(createApp())
          .get('/local/content')
          .query({ path: '/test/file.ts' });
        expect(res.status).toBe(200);
      });
    });

    describe('GET /local/find', () => {
      it('validates required path parameter', async () => {
        const res = await request(createApp()).get('/local/find');
        expect(res.status).toBe(400);
      });

      it('accepts valid find request', async () => {
        const res = await request(createApp())
          .get('/local/find')
          .query({ path: '/test' });
        expect(res.status).toBe(200);
      });
    });

    describe('GET /local/structure', () => {
      it('validates required path parameter', async () => {
        const res = await request(createApp()).get('/local/structure');
        expect(res.status).toBe(400);
      });

      it('accepts valid structure request', async () => {
        const res = await request(createApp())
          .get('/local/structure')
          .query({ path: '/test' });
        expect(res.status).toBe(200);
      });
    });
  });

  describe('GitHub Routes', () => {
    describe('GET /github/search', () => {
      it('validates required parameters', async () => {
        const res = await request(createApp()).get('/github/search');
        expect(res.status).toBe(400);
      });

      it('accepts valid search request', async () => {
        const res = await request(createApp())
          .get('/github/search')
          .query({
            keywordsToSearch: 'test',
            mainResearchGoal: 'test',
            researchGoal: 'test',
            reasoning: 'test',
          });
        expect(res.status).toBe(200);
      });
    });

    describe('GET /github/content', () => {
      it('validates required parameters', async () => {
        const res = await request(createApp()).get('/github/content');
        expect(res.status).toBe(400);
      });

      it('accepts valid content request', async () => {
        const res = await request(createApp())
          .get('/github/content')
          .query({
            owner: 'test',
            repo: 'test',
            path: 'test.ts',
            mainResearchGoal: 'test',
            researchGoal: 'test',
            reasoning: 'test',
          });
        expect(res.status).toBe(200);
      });
    });

    describe('GET /github/repos', () => {
      it('accepts valid repos request', async () => {
        const res = await request(createApp())
          .get('/github/repos')
          .query({
            mainResearchGoal: 'test',
            researchGoal: 'test',
            reasoning: 'test',
          });
        expect(res.status).toBe(200);
      });
    });

    describe('GET /github/structure', () => {
      it('validates required parameters', async () => {
        const res = await request(createApp()).get('/github/structure');
        expect(res.status).toBe(400);
      });

      it('accepts valid structure request', async () => {
        const res = await request(createApp())
          .get('/github/structure')
          .query({
            owner: 'test',
            repo: 'test',
            branch: 'main',
            mainResearchGoal: 'test',
            researchGoal: 'test',
            reasoning: 'test',
          });
        expect(res.status).toBe(200);
      });
    });

    describe('GET /github/prs', () => {
      it('accepts valid PRs request', async () => {
        const res = await request(createApp())
          .get('/github/prs')
          .query({
            mainResearchGoal: 'test',
            researchGoal: 'test',
            reasoning: 'test',
          });
        expect(res.status).toBe(200);
      });
    });
  });

  describe('LSP Routes', () => {
    describe('GET /lsp/definition', () => {
      it('validates required parameters', async () => {
        const res = await request(createApp()).get('/lsp/definition');
        expect(res.status).toBe(400);
      });

      it('accepts valid definition request', async () => {
        const res = await request(createApp())
          .get('/lsp/definition')
          .query({
            uri: 'file:///test.ts',
            symbolName: 'test',
            lineHint: 1,
          });
        expect(res.status).toBe(200);
      });
    });

    describe('GET /lsp/references', () => {
      it('validates required parameters', async () => {
        const res = await request(createApp()).get('/lsp/references');
        expect(res.status).toBe(400);
      });

      it('accepts valid references request', async () => {
        const res = await request(createApp())
          .get('/lsp/references')
          .query({
            uri: 'file:///test.ts',
            symbolName: 'test',
            lineHint: 1,
          });
        expect(res.status).toBe(200);
      });
    });

    describe('GET /lsp/calls', () => {
      it('validates required parameters', async () => {
        const res = await request(createApp()).get('/lsp/calls');
        expect(res.status).toBe(400);
      });

      it('accepts valid calls request', async () => {
        const res = await request(createApp())
          .get('/lsp/calls')
          .query({
            uri: 'file:///test.ts',
            symbolName: 'test',
            lineHint: 1,
            direction: 'incoming',
          });
        expect(res.status).toBe(200);
      });
    });
  });

  describe('Package Routes', () => {
    describe('GET /package/search', () => {
      it('validates required parameters', async () => {
        const res = await request(createApp()).get('/package/search');
        expect(res.status).toBe(400);
      });

      it('accepts valid npm package search', async () => {
        const res = await request(createApp())
          .get('/package/search')
          .query({
            name: 'express',
            ecosystem: 'npm',
            mainResearchGoal: 'test',
            researchGoal: 'test',
            reasoning: 'test',
          });
        expect(res.status).toBe(200);
      });

      it('accepts valid python package search', async () => {
        const res = await request(createApp())
          .get('/package/search')
          .query({
            name: 'requests',
            ecosystem: 'python',
            mainResearchGoal: 'test',
            researchGoal: 'test',
            reasoning: 'test',
          });
        expect(res.status).toBe(200);
      });
    });
  });

  describe('Response Structure', () => {
    it('includes role in all responses', async () => {
      const res = await request(createApp())
        .get('/local/search')
        .query({ pattern: 'test', path: '/test' });
      expect(res.body).toHaveProperty('role');
    });

    it('includes content in all responses', async () => {
      const res = await request(createApp())
        .get('/local/search')
        .query({ pattern: 'test', path: '/test' });
      expect(res.body).toHaveProperty('content');
    });
  });
});
