/**
 * Schema Bridge Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod/v4';
import {
  zodToCliOptions,
  cliArgsToQuery,
} from '../../src/cli/schema-bridge.js';

describe('schema-bridge', () => {
  describe('zodToCliOptions', () => {
    it('should convert camelCase keys to kebab-case', () => {
      const schema = z.object({
        keywordsToSearch: z.string(),
        maxResults: z.number(),
      });
      const options = zodToCliOptions(schema);
      expect(options.map(o => o.name)).toEqual([
        'keywords-to-search',
        'max-results',
      ]);
    });

    it('should skip MCP context fields', () => {
      const schema = z.object({
        id: z.string(),
        mainResearchGoal: z.string(),
        researchGoal: z.string(),
        reasoning: z.string(),
        pattern: z.string(),
      });
      const options = zodToCliOptions(schema);
      expect(options).toHaveLength(1);
      expect(options[0].name).toBe('pattern');
    });

    it('should set hasValue=false for boolean fields', () => {
      const schema = z.object({
        verbose: z.boolean(),
        name: z.string(),
      });
      const options = zodToCliOptions(schema);
      const verbose = options.find(o => o.name === 'verbose')!;
      const name = options.find(o => o.name === 'name')!;
      expect(verbose.hasValue).toBe(false);
      expect(name.hasValue).toBe(true);
    });

    it('should extract default values', () => {
      const schema = z.object({
        limit: z.number().default(10),
        path: z.string().default('.'),
      });
      const options = zodToCliOptions(schema);
      const limit = options.find(o => o.name === 'limit')!;
      const path = options.find(o => o.name === 'path')!;
      expect(limit.default).toBe('10');
      expect(path.default).toBe('.');
    });

    it('should handle optional fields', () => {
      const schema = z.object({
        owner: z.string().optional(),
        repo: z.string(),
      });
      const options = zodToCliOptions(schema);
      expect(options).toHaveLength(2);
      expect(options.map(o => o.name)).toEqual(['owner', 'repo']);
    });

    it('should append extra options', () => {
      const schema = z.object({
        pattern: z.string(),
      });
      const extra = [{ name: 'pretty', description: 'Human-readable output' }];
      const options = zodToCliOptions(schema, extra);
      expect(options).toHaveLength(2);
      expect(options[1].name).toBe('pretty');
    });

    it('should use humanized name as fallback description', () => {
      const schema = z.object({
        matchStringContextLines: z.number(),
      });
      const options = zodToCliOptions(schema);
      expect(options[0].description).toBe('Match string context lines');
    });

    it('should use schema description when available', () => {
      const schema = z.object({
        limit: z.number().describe('Maximum results to return'),
      });
      const options = zodToCliOptions(schema);
      expect(options[0].description).toBe('Maximum results to return');
    });

    it('should handle optional with default', () => {
      const schema = z.object({
        depth: z.number().optional().default(1),
      });
      const options = zodToCliOptions(schema);
      expect(options[0].name).toBe('depth');
      expect(options[0].default).toBe('1');
    });

    it('should handle array fields', () => {
      const schema = z.object({
        tags: z.array(z.string()),
      });
      const options = zodToCliOptions(schema);
      expect(options[0].hasValue).toBe(true);
    });
  });

  describe('cliArgsToQuery', () => {
    it('should convert kebab-case back to camelCase keys', () => {
      const schema = z.object({
        keywordsToSearch: z.string(),
      });
      const args = {
        command: 'test',
        args: [],
        options: { 'keywords-to-search': 'react,hooks' },
      };
      const query = cliArgsToQuery(args, schema);
      expect(query).toEqual({ keywordsToSearch: 'react,hooks' });
    });

    it('should skip context fields', () => {
      const schema = z.object({
        id: z.string(),
        mainResearchGoal: z.string(),
        researchGoal: z.string(),
        reasoning: z.string(),
        pattern: z.string(),
      });
      const args = {
        command: 'test',
        args: [],
        options: { pattern: 'test' },
      };
      const query = cliArgsToQuery(args, schema);
      expect(query).toEqual({ pattern: 'test' });
      expect(query).not.toHaveProperty('id');
    });

    it('should coerce number types', () => {
      const schema = z.object({
        limit: z.number(),
      });
      const args = {
        command: 'test',
        args: [],
        options: { limit: '10' },
      };
      const query = cliArgsToQuery(args, schema);
      expect(query.limit).toBe(10);
      expect(typeof query.limit).toBe('number');
    });

    it('should coerce int types', () => {
      const schema = z.object({
        page: z.number().int(),
      });
      const args = {
        command: 'test',
        args: [],
        options: { page: '3' },
      };
      const query = cliArgsToQuery(args, schema);
      expect(query.page).toBe(3);
    });

    it('should coerce boolean types', () => {
      const schema = z.object({
        verbose: z.boolean(),
      });
      const args = {
        command: 'test',
        args: [],
        options: { verbose: true },
      };
      const query = cliArgsToQuery(args, schema);
      expect(query.verbose).toBe(true);
    });

    it('should split comma-separated arrays', () => {
      const schema = z.object({
        tags: z.array(z.string()),
      });
      const args = {
        command: 'test',
        args: [],
        options: { tags: 'a, b, c' },
      };
      const query = cliArgsToQuery(args, schema);
      expect(query.tags).toEqual(['a', 'b', 'c']);
    });

    it('should skip undefined options', () => {
      const schema = z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
      });
      const args = {
        command: 'test',
        args: [],
        options: { owner: 'facebook' },
      };
      const query = cliArgsToQuery(args, schema);
      expect(query).toEqual({ owner: 'facebook' });
      expect(query).not.toHaveProperty('repo');
    });

    it('should passthrough string/enum types', () => {
      const schema = z.object({
        sort: z.enum(['stars', 'forks', 'updated']),
      });
      const args = {
        command: 'test',
        args: [],
        options: { sort: 'stars' },
      };
      const query = cliArgsToQuery(args, schema);
      expect(query.sort).toBe('stars');
    });

    it('should handle optional with default unwrapping', () => {
      const schema = z.object({
        limit: z.number().optional().default(10),
      });
      const args = {
        command: 'test',
        args: [],
        options: { limit: '5' },
      };
      const query = cliArgsToQuery(args, schema);
      expect(query.limit).toBe(5);
    });
  });
});
