import { describe, it, expect, beforeEach } from 'vitest';
import {
  BaseCommandBuilder,
  BaseCommandParams,
} from '../../../src/npm/BaseCommandBuilder.js';

// Concrete implementation for testing
class TestCommandBuilder extends BaseCommandBuilder<BaseCommandParams> {
  constructor() {
    super('github');
  }

  protected initializeCommand(): this {
    this.args = ['test'];
    return this;
  }

  build(params: BaseCommandParams): string[] {
    return this.reset()
      .initializeCommand()
      .addQuery({
        queryTerms: params.queryTerms as string[],
        orTerms: params.orTerms as string[],
      })
      .addOwnerRepo({
        owner: params.owner as string | string[],
        repo: params.repo as string | string[],
      })
      .addFlag('language', params.language as string)
      .addLimit(params.limit as number, 30)
      .addJsonOutput()
      .getArgs();
  }
}

describe('BaseCommandBuilder', () => {
  let builder: TestCommandBuilder;

  beforeEach(() => {
    builder = new TestCommandBuilder();
  });

  describe('Query Building', () => {
    it('should handle query terms with spaces', () => {
      const result = builder.build({ queryTerms: ['test query'] });
      expect(result).toContain('test query');
    });

    it('should handle query terms (AND logic)', () => {
      const result = builder.build({ queryTerms: ['term1', 'term2', 'term3'] });
      expect(result).toContain('term1 term2 term3');
    });

    it('should handle query terms with special characters', () => {
      const result = builder.build({
        queryTerms: ['term()', 'term[]', 'normal'],
      });
      expect(result).toContain('"term()" "term[]" normal');
    });

    it('should handle OR terms', () => {
      const result = builder.build({ orTerms: ['option1', 'option2'] });
      expect(result).toContain('(option1 OR option2)');
    });

    it('should handle single OR term', () => {
      const result = builder.build({ orTerms: ['single'] });
      expect(result).toContain('single');
    });

    it('should handle OR terms with special characters', () => {
      const result = builder.build({ orTerms: ['term()', 'normal'] });
      expect(result).toContain('("term()" OR normal)');
    });

    it('should handle both AND and OR terms', () => {
      const result = builder.build({
        queryTerms: ['and1', 'and2'],
        orTerms: ['or1', 'or2'],
      });
      expect(result).toContain('and1 and2 (or1 OR or2)');
    });
  });

  describe('Flag Handling', () => {
    it('should add string flags with equals format', () => {
      const builder = new TestCommandBuilder();
      builder['addFlag']('language', 'javascript');
      expect(builder.getArgs()).toContain('--language=javascript');
    });

    it('should add number flags with equals format', () => {
      const builder = new TestCommandBuilder();
      builder['addFlag']('limit', 50);
      expect(builder.getArgs()).toContain('--limit=50');
    });

    it('should add boolean flags (true)', () => {
      const builder = new TestCommandBuilder();
      builder['addFlag']('archived', true);
      expect(builder.getArgs()).toContain('--archived=true');
    });

    it('should add boolean flags (false)', () => {
      const builder = new TestCommandBuilder();
      builder['addFlag']('archived', false);
      expect(builder.getArgs()).toContain('--archived=false');
    });

    it('should add flag with separate value', () => {
      const builder = new TestCommandBuilder();
      builder['addFlagWithSeparateValue']('author', 'john');
      const args = builder.getArgs();
      expect(args).toContain('--author');
      expect(args).toContain('john');
    });
  });

  describe('Owner/Repo Handling', () => {
    it('should handle single owner and repo', () => {
      const result = builder.build({ owner: 'facebook', repo: 'react' });
      expect(result).toContain('--repo=facebook/react');
    });

    it('should handle multiple owners with single repo', () => {
      const result = builder.build({
        owner: ['facebook', 'microsoft'],
        repo: 'react',
      });
      expect(result).toContain('--repo=facebook/react');
      expect(result).toContain('--repo=microsoft/react');
    });

    it('should handle single owner with multiple repos', () => {
      const result = builder.build({
        owner: 'facebook',
        repo: ['react', 'jest'],
      });
      expect(result).toContain('--repo=facebook/react');
      expect(result).toContain('--repo=facebook/jest');
    });

    it('should handle repo with owner already included', () => {
      const result = builder.build({
        owner: 'facebook',
        repo: 'microsoft/vscode',
      });
      expect(result).toContain('--repo=microsoft/vscode');
    });

    it('should handle owner without repo', () => {
      const result = builder.build({ owner: 'facebook' });
      expect(result).toContain('--owner=facebook');
    });

    it('should handle repo without owner', () => {
      const result = builder.build({ repo: 'react' });
      expect(result).toContain('--repo=react');
    });
  });

  describe('Array Parameter Normalization', () => {
    it('should handle string arrays', () => {
      const builder = new TestCommandBuilder();
      const result = builder['normalizeArrayParam'](['item1', 'item2']);
      expect(result).toEqual(['item1', 'item2']);
    });

    it('should handle single string', () => {
      const builder = new TestCommandBuilder();
      const result = builder['normalizeArrayParam']('single');
      expect(result).toEqual(['single']);
    });

    it('should handle quoted comma-separated string', () => {
      const builder = new TestCommandBuilder();
      const result = builder['normalizeArrayParam']('"item1", "item2"');
      expect(result).toEqual(['item1', 'item2']);
    });

    it('should handle comma-space separated string', () => {
      const builder = new TestCommandBuilder();
      const result = builder['normalizeArrayParam']('item1, item2');
      expect(result).toEqual(['item1', 'item2']);
    });

    it('should handle comma separated string', () => {
      const builder = new TestCommandBuilder();
      const result = builder['normalizeArrayParam']('item1,item2');
      expect(result).toEqual(['item1', 'item2']);
    });

    it('should reject command injection attempts', () => {
      const builder = new TestCommandBuilder();

      // Test various injection patterns
      const maliciousInputs = [
        'item1"; rm -rf / #',
        'item1; evil-command',
        'item1 | cat /etc/passwd',
        'item1 & background-command',
        'item1`whoami`',
        'item1$HOME',
        'item1\\n\\r',
        '--malicious-flag',
        '-rf',
      ];

      maliciousInputs.forEach(input => {
        const result = builder['normalizeArrayParam'](input);
        expect(result).toEqual([]); // Should filter out malicious content
      });
    });

    it('should handle mixed safe and unsafe array items', () => {
      const builder = new TestCommandBuilder();
      const result = builder['normalizeArrayParam'](
        'safe1,--malicious,safe2,evil;command,safe3'
      );
      expect(result).toEqual(['safe1', 'safe2', 'safe3']); // Only safe items should remain
    });

    it('should handle JSON array input securely', () => {
      const builder = new TestCommandBuilder();

      // Test valid JSON array
      const validJson = '["item1", "item2", "item3"]';
      const result1 = builder['normalizeArrayParam'](validJson);
      expect(result1).toEqual(['item1', 'item2', 'item3']);

      // Test JSON array with malicious content
      const maliciousJson = '["safe", "--malicious", "safe2"]';
      const result2 = builder['normalizeArrayParam'](maliciousJson);
      expect(result2).toEqual(['safe', 'safe2']); // Malicious items filtered out
    });
  });

  describe('Multiple Flags', () => {
    it('should add multiple flags from mapping', () => {
      const builder = new TestCommandBuilder();
      builder['addFlags'](
        { sort: 'stars', archived: true, language: 'javascript' },
        { sort: 'sort', archived: 'archived', language: 'language' }
      );
      const args = builder.getArgs();
      expect(args).toContain('--sort=stars');
      expect(args).toContain('--archived=true');
      expect(args).toContain('--language=javascript');
    });

    it('should skip undefined values in flag mapping', () => {
      const builder = new TestCommandBuilder();
      builder['addFlags'](
        { sort: 'stars', archived: undefined, language: null },
        { sort: 'sort', archived: 'archived', language: 'language' }
      );
      const args = builder.getArgs();
      expect(args).toContain('--sort=stars');
      expect(args).not.toContain('--archived');
      expect(args).not.toContain('--language');
    });
  });

  describe('Conditional Flags', () => {
    it('should add conditional flags when present', () => {
      const builder = new TestCommandBuilder();
      builder['addConditionalFlags'](
        { locked: true, archived: false, draft: true },
        ['locked', 'archived', 'draft']
      );
      const args = builder.getArgs();
      expect(args).toContain('--locked');
      expect(args).toContain('--draft');
      expect(args).not.toContain('--archived');
    });
  });

  describe('JSON Output', () => {
    it('should add JSON flag without fields', () => {
      const builder = new TestCommandBuilder();
      builder['addJsonOutput']();
      expect(builder.getArgs()).toContain('--json');
    });

    it('should add JSON flag with fields', () => {
      const builder = new TestCommandBuilder();
      builder['addJsonOutput']('name,url,description');
      expect(builder.getArgs()).toContain('--json=name,url,description');
    });
  });

  describe('Limit Handling', () => {
    it('should add limit when provided', () => {
      const builder = new TestCommandBuilder();
      builder['addLimit'](50);
      expect(builder.getArgs()).toContain('--limit=50');
    });

    it('should add default limit when no limit provided', () => {
      const builder = new TestCommandBuilder();
      builder['addLimit'](undefined, 30);
      expect(builder.getArgs()).toContain('--limit=30');
    });

    it('should prefer provided limit over default', () => {
      const builder = new TestCommandBuilder();
      builder['addLimit'](100, 30);
      expect(builder.getArgs()).toContain('--limit=100');
      expect(builder.getArgs()).not.toContain('--limit=30');
    });
  });

  describe('Builder Reset', () => {
    it('should reset args when reset is called', () => {
      const builder = new TestCommandBuilder();
      builder['addFlag']('test', 'value');
      expect(builder.getArgs()).toContain('--test=value');

      builder['reset']();
      expect(builder.getArgs()).toEqual([]);
    });

    it('should allow reuse after reset', () => {
      const result1 = builder.build({ queryTerms: ['first'] });
      const result2 = builder.build({ queryTerms: ['second'] });

      expect(result1).toContain('first');
      expect(result2).toContain('second');
      expect(result2).not.toContain('first');
    });
  });

  describe('Full Build Integration', () => {
    it('should build complete command with all features', () => {
      const params = {
        queryTerms: ['react', 'hooks'],
        owner: 'facebook',
        repo: 'react',
        language: 'javascript',
        limit: 50,
      };

      const result = builder.build(params);

      expect(result).toContain('test'); // base command
      expect(result).toContain('react hooks'); // query terms
      expect(result).toContain('--repo=facebook/react'); // owner/repo
      expect(result).toContain('--language=javascript'); // language flag
      expect(result).toContain('--limit=50'); // limit
      expect(result).toContain('--json'); // json output
    });
  });
});
