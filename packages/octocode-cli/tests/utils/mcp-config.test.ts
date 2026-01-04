/**
 * MCP Config Utilities Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';

// Mock modules
vi.mock('node:os', () => ({
  default: {
    platform: vi.fn(() => 'darwin'),
    homedir: vi.fn(() => '/Users/test'),
  },
  platform: vi.fn(() => 'darwin'),
  homedir: vi.fn(() => '/Users/test'),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
}));

describe('MCP Config Utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('getMCPConfigPath', () => {
    it('should return Cursor config path for macOS', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { getMCPConfigPath } =
        await import('../../src/utils/mcp-config.js');

      expect(getMCPConfigPath('cursor')).toBe('/Users/test/.cursor/mcp.json');
    });

    it('should return Claude Desktop config path for macOS', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { getMCPConfigPath } =
        await import('../../src/utils/mcp-config.js');

      expect(getMCPConfigPath('claude-desktop')).toBe(
        '/Users/test/Library/Application Support/Claude/claude_desktop_config.json'
      );
    });

    it('should return Claude Code config path', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { getMCPConfigPath } =
        await import('../../src/utils/mcp-config.js');

      expect(getMCPConfigPath('claude-code')).toBe('/Users/test/.claude.json');
    });

    it('should return Cursor config path for Windows', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');
      process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';

      const { getMCPConfigPath } =
        await import('../../src/utils/mcp-config.js');

      // Use path.join for expected value to handle platform differences in tests
      const result = getMCPConfigPath('cursor');
      expect(result).toContain('Cursor');
      expect(result).toContain('mcp.json');
      expect(result).toContain('AppData');
    });
  });

  describe('getOctocodeServerConfig', () => {
    it('should return npx config', async () => {
      const { getOctocodeServerConfig } =
        await import('../../src/utils/mcp-config.js');

      const config = getOctocodeServerConfig('npx');
      expect(config.command).toBe('npx');
      expect(config.args).toContain('octocode-mcp@latest');
    });

    it('should return direct config', async () => {
      const { getOctocodeServerConfig } =
        await import('../../src/utils/mcp-config.js');

      const config = getOctocodeServerConfig('direct');
      expect(config.command).toBe('bash');
      expect(config.args[0]).toBe('-c');
      expect(config.args[1]).toContain('curl');
    });
  });

  describe('mergeOctocodeConfig', () => {
    it('should add octocode to empty config', async () => {
      const { mergeOctocodeConfig } =
        await import('../../src/utils/mcp-config.js');

      const result = mergeOctocodeConfig({ mcpServers: {} }, 'npx');
      expect(result.mcpServers?.octocode).toBeDefined();
      expect(result.mcpServers?.octocode.command).toBe('npx');
    });

    it('should preserve existing servers', async () => {
      const { mergeOctocodeConfig } =
        await import('../../src/utils/mcp-config.js');

      const existing = {
        mcpServers: {
          other: { command: 'node', args: ['other.js'] },
        },
      };

      const result = mergeOctocodeConfig(existing, 'npx');
      expect(result.mcpServers?.other).toBeDefined();
      expect(result.mcpServers?.octocode).toBeDefined();
    });

    it('should overwrite existing octocode config', async () => {
      const { mergeOctocodeConfig } =
        await import('../../src/utils/mcp-config.js');

      const existing = {
        mcpServers: {
          octocode: { command: 'old', args: [] },
        },
      };

      const result = mergeOctocodeConfig(existing, 'npx');
      expect(result.mcpServers?.octocode.command).toBe('npx');
    });
  });

  describe('isOctocodeConfigured', () => {
    it('should return true if octocode is configured', async () => {
      const { isOctocodeConfigured } =
        await import('../../src/utils/mcp-config.js');

      const config = {
        mcpServers: {
          octocode: { command: 'npx', args: ['octocode-mcp@latest'] },
        },
      };

      expect(isOctocodeConfigured(config)).toBe(true);
    });

    it('should return false if octocode is not configured', async () => {
      const { isOctocodeConfigured } =
        await import('../../src/utils/mcp-config.js');

      const config = { mcpServers: {} };
      expect(isOctocodeConfigured(config)).toBe(false);
    });

    it('should return false if mcpServers is undefined', async () => {
      const { isOctocodeConfigured } =
        await import('../../src/utils/mcp-config.js');

      const config = {};
      expect(isOctocodeConfigured(config)).toBe(false);
    });
  });
});
