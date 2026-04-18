import { describe, expect, it } from 'vitest';
import {
  AGENT_COMMAND_SPECS,
  AGENT_SUBCOMMAND_NAMES,
  findAgentCommandSpec,
  toAgentHelpCommand,
} from '../../src/cli/agent-command-specs.js';

describe('AGENT_COMMAND_SPECS', () => {
  it('contains exactly 6 agent subcommands', () => {
    expect(AGENT_COMMAND_SPECS).toHaveLength(6);
  });

  it('has the expected subcommand names', () => {
    const names = AGENT_COMMAND_SPECS.map(s => s.name);
    expect(names).toEqual([
      'search-code',
      'get-file',
      'view-structure',
      'search-repos',
      'search-prs',
      'package-search',
    ]);
  });

  it('every spec maps to a distinct tool', () => {
    const tools = AGENT_COMMAND_SPECS.map(s => s.tool);
    expect(new Set(tools).size).toBe(tools.length);
  });

  it('every spec has at least one flag', () => {
    for (const spec of AGENT_COMMAND_SPECS) {
      expect(spec.flags.length).toBeGreaterThan(0);
    }
  });

  it('search-code requires --query', () => {
    const spec = findAgentCommandSpec('search-code')!;
    const queryFlag = spec.flags.find(f => f.name === 'query');
    expect(queryFlag?.required).toBe(true);
    expect(queryFlag?.type).toBe('array');
    expect(queryFlag?.field).toBe('keywordsToSearch');
  });

  it('get-file requires --owner, --repo, --path', () => {
    const spec = findAgentCommandSpec('get-file')!;
    const required = spec.flags.filter(f => f.required).map(f => f.name);
    expect(required).toEqual(['owner', 'repo', 'path']);
  });

  it('view-structure requires --owner, --repo', () => {
    const spec = findAgentCommandSpec('view-structure')!;
    const required = spec.flags.filter(f => f.required).map(f => f.name);
    expect(required).toEqual(['owner', 'repo']);
  });

  it('package-search requires --name, --ecosystem', () => {
    const spec = findAgentCommandSpec('package-search')!;
    const required = spec.flags.filter(f => f.required).map(f => f.name);
    expect(required).toEqual(['name', 'ecosystem']);
  });

  it('search-repos has no required flags (query and topics are alternatives)', () => {
    const spec = findAgentCommandSpec('search-repos')!;
    const required = spec.flags.filter(f => f.required);
    expect(required).toHaveLength(0);
  });

  it('search-prs has no required flags', () => {
    const spec = findAgentCommandSpec('search-prs')!;
    const required = spec.flags.filter(f => f.required);
    expect(required).toHaveLength(0);
  });
});

describe('AGENT_SUBCOMMAND_NAMES', () => {
  it('is a Set matching all spec names', () => {
    expect(AGENT_SUBCOMMAND_NAMES.size).toBe(AGENT_COMMAND_SPECS.length);
    for (const spec of AGENT_COMMAND_SPECS) {
      expect(AGENT_SUBCOMMAND_NAMES.has(spec.name)).toBe(true);
    }
  });
});

describe('findAgentCommandSpec', () => {
  it('returns spec for known name', () => {
    const spec = findAgentCommandSpec('search-code');
    expect(spec).toBeDefined();
    expect(spec!.tool).toBe('githubSearchCode');
  });

  it('returns undefined for unknown name', () => {
    expect(findAgentCommandSpec('nonexistent')).toBeUndefined();
  });
});

describe('toAgentHelpCommand', () => {
  it('converts spec to CLICommand with options including --json', () => {
    const spec = findAgentCommandSpec('search-code')!;
    const cmd = toAgentHelpCommand(spec);

    expect(cmd.name).toBe('search-code');
    expect(cmd.description).toBe('Search code in GitHub repositories');
    expect(cmd.usage).toContain('search-code');
    expect(cmd.options).toBeDefined();
    expect(cmd.options!.length).toBeGreaterThan(0);

    const jsonOpt = cmd.options!.find(o => o.name === 'json');
    expect(jsonOpt).toBeDefined();
    expect(jsonOpt!.description).toContain('JSON');
  });

  it('marks required flags in option descriptions', () => {
    const spec = findAgentCommandSpec('get-file')!;
    const cmd = toAgentHelpCommand(spec);

    const ownerOpt = cmd.options!.find(o => o.name === 'owner');
    expect(ownerOpt!.description).toContain('[required]');

    const branchOpt = cmd.options!.find(o => o.name === 'branch');
    expect(branchOpt!.description).not.toContain('[required]');
  });

  it('sets hasValue based on flag type', () => {
    const spec = findAgentCommandSpec('get-file')!;
    const cmd = toAgentHelpCommand(spec);

    const fullContent = cmd.options!.find(o => o.name === 'full-content');
    expect(fullContent!.hasValue).toBe(false);

    const owner = cmd.options!.find(o => o.name === 'owner');
    expect(owner!.hasValue).toBe(true);
  });
});
