/**
 * MCP Paths Utilities Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock platform module
vi.mock('../../src/utils/platform.js', () => ({
  isWindows: false,
  isMac: true,
  isLinux: false,
  HOME: '/Users/test',
  getAppDataPath: vi.fn(() => 'C:\\Users\\test\\AppData\\Roaming'),
}));

// Mock fs module
vi.mock('../../src/utils/fs.js', () => ({
  dirExists: vi.fn(),
  fileExists: vi.fn(),
}));

describe('MCP Paths Utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('MCP_CLIENTS', () => {
    it('should export all client metadata', async () => {
      const { MCP_CLIENTS } = await import('../../src/utils/mcp-paths.js');

      expect(MCP_CLIENTS.cursor).toBeDefined();
      expect(MCP_CLIENTS.cursor.name).toBe('Cursor');
      expect(MCP_CLIENTS.cursor.category).toBe('ide');

      expect(MCP_CLIENTS['claude-desktop']).toBeDefined();
      expect(MCP_CLIENTS['claude-code']).toBeDefined();
      expect(MCP_CLIENTS['vscode-cline']).toBeDefined();
      expect(MCP_CLIENTS.windsurf).toBeDefined();
      expect(MCP_CLIENTS.zed).toBeDefined();
      expect(MCP_CLIENTS.custom).toBeDefined();
    });

    it('should have correct categories', async () => {
      const { MCP_CLIENTS } = await import('../../src/utils/mcp-paths.js');

      expect(MCP_CLIENTS.cursor.category).toBe('ide');
      expect(MCP_CLIENTS['claude-desktop'].category).toBe('desktop');
      expect(MCP_CLIENTS['claude-code'].category).toBe('cli');
      expect(MCP_CLIENTS['vscode-cline'].category).toBe('extension');
    });
  });

  describe('getMCPConfigPath', () => {
    it('should return custom path when client is custom', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('custom', '/custom/path.json');
      expect(result).toBe('/custom/path.json');
    });

    it('should return cursor config path on macOS', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('cursor');
      expect(result).toBe('/Users/test/.cursor/mcp.json');
    });

    it('should return claude-desktop config path on macOS', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('claude-desktop');
      expect(result).toContain('Claude');
      expect(result).toContain('claude_desktop_config.json');
    });

    it('should return claude-code config path', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('claude-code');
      expect(result).toBe('/Users/test/.claude.json');
    });

    it('should return vscode-cline config path', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('vscode-cline');
      expect(result).toContain('saoudrizwan.claude-dev');
      expect(result).toContain('cline_mcp_settings.json');
    });

    it('should return vscode-roo config path', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('vscode-roo');
      expect(result).toContain('rooveterinaryinc.roo-cline');
    });

    it('should return windsurf config path', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('windsurf');
      expect(result).toBe('/Users/test/.codeium/windsurf/mcp_config.json');
    });

    it('should return zed config path', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('zed');
      expect(result).toContain('zed');
      expect(result).toContain('settings.json');
    });

    it('should return vscode-continue config path', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('vscode-continue');
      expect(result).toBe('/Users/test/.continue/config.json');
    });

    it('should return trae config path', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('trae');
      expect(result).toContain('Trae');
      expect(result).toContain('mcp.json');
    });

    it('should return antigravity config path', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      const result = getMCPConfigPath('antigravity');
      expect(result).toBe('/Users/test/.gemini/antigravity/mcp_config.json');
    });

    it('should throw error for custom without path', async () => {
      const { getMCPConfigPath } = await import('../../src/utils/mcp-paths.js');

      expect(() => getMCPConfigPath('custom')).toThrow(
        'Custom path requires customPath parameter'
      );
    });
  });

  describe('clientConfigExists', () => {
    it('should return true when config directory exists', async () => {
      const { dirExists } = await import('../../src/utils/fs.js');
      vi.mocked(dirExists).mockReturnValue(true);

      const { clientConfigExists } =
        await import('../../src/utils/mcp-paths.js');
      const result = clientConfigExists('cursor');

      expect(result).toBe(true);
    });

    it('should return false when config directory does not exist', async () => {
      const { dirExists } = await import('../../src/utils/fs.js');
      vi.mocked(dirExists).mockReturnValue(false);

      const { clientConfigExists } =
        await import('../../src/utils/mcp-paths.js');
      const result = clientConfigExists('cursor');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const { dirExists } = await import('../../src/utils/fs.js');
      vi.mocked(dirExists).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { clientConfigExists } =
        await import('../../src/utils/mcp-paths.js');
      const result = clientConfigExists('cursor');

      expect(result).toBe(false);
    });
  });

  describe('configFileExists', () => {
    it('should return true when config file exists', async () => {
      const { fileExists } = await import('../../src/utils/fs.js');
      vi.mocked(fileExists).mockReturnValue(true);

      const { configFileExists } = await import('../../src/utils/mcp-paths.js');
      const result = configFileExists('cursor');

      expect(result).toBe(true);
    });

    it('should return false when config file does not exist', async () => {
      const { fileExists } = await import('../../src/utils/fs.js');
      vi.mocked(fileExists).mockReturnValue(false);

      const { configFileExists } = await import('../../src/utils/mcp-paths.js');
      const result = configFileExists('cursor');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const { fileExists } = await import('../../src/utils/fs.js');
      vi.mocked(fileExists).mockImplementation(() => {
        throw new Error('error');
      });

      const { configFileExists } = await import('../../src/utils/mcp-paths.js');
      const result = configFileExists('custom', undefined);

      expect(result).toBe(false);
    });
  });

  describe('detectCurrentClient', () => {
    it('should detect Cursor from environment', async () => {
      const originalEnv = { ...process.env };
      process.env.CURSOR_AGENT = 'true';

      const { detectCurrentClient } =
        await import('../../src/utils/mcp-paths.js');
      const result = detectCurrentClient();

      expect(result).toBe('cursor');
      process.env = originalEnv;
    });

    it('should detect Windsurf from environment', async () => {
      const originalEnv = { ...process.env };
      process.env = {};
      process.env.WINDSURF_SESSION = 'session123';

      const { detectCurrentClient } =
        await import('../../src/utils/mcp-paths.js');
      const result = detectCurrentClient();

      expect(result).toBe('windsurf');
      process.env = originalEnv;
    });

    it('should detect Claude Code from environment', async () => {
      const originalEnv = { ...process.env };
      process.env = {};
      process.env.CLAUDE_CODE = 'true';

      const { detectCurrentClient } =
        await import('../../src/utils/mcp-paths.js');
      const result = detectCurrentClient();

      expect(result).toBe('claude-code');
      process.env = originalEnv;
    });

    it('should detect Zed from environment', async () => {
      const originalEnv = { ...process.env };
      process.env = {};
      process.env.ZED_TERM = 'true';

      const { detectCurrentClient } =
        await import('../../src/utils/mcp-paths.js');
      const result = detectCurrentClient();

      expect(result).toBe('zed');
      process.env = originalEnv;
    });

    it('should detect VS Code from environment', async () => {
      const originalEnv = { ...process.env };
      process.env = {};
      process.env.VSCODE_PID = '12345';

      const { detectCurrentClient } =
        await import('../../src/utils/mcp-paths.js');
      const result = detectCurrentClient();

      expect(result).toBe('vscode-cline');
      process.env = originalEnv;
    });

    it('should return null when no client detected', async () => {
      const originalEnv = { ...process.env };
      process.env = {};

      const { detectCurrentClient } =
        await import('../../src/utils/mcp-paths.js');
      const result = detectCurrentClient();

      expect(result).toBeNull();
      process.env = originalEnv;
    });
  });

  describe('detectAvailableClients', () => {
    it('should return empty array when no clients available', async () => {
      const { dirExists } = await import('../../src/utils/fs.js');
      vi.mocked(dirExists).mockReturnValue(false);

      const { detectAvailableClients } =
        await import('../../src/utils/mcp-paths.js');
      const result = detectAvailableClients();

      expect(result).toEqual([]);
    });

    it('should return available clients', async () => {
      const { dirExists } = await import('../../src/utils/fs.js');
      vi.mocked(dirExists).mockImplementation(path => {
        return path?.includes('.cursor') || path?.includes('Claude');
      });

      const { detectAvailableClients } =
        await import('../../src/utils/mcp-paths.js');
      const result = detectAvailableClients();

      expect(result).toContain('cursor');
      expect(result).toContain('claude-desktop');
    });
  });

  describe('getClientsByCategory', () => {
    it('should group clients by category', async () => {
      const { getClientsByCategory } =
        await import('../../src/utils/mcp-paths.js');
      const result = getClientsByCategory();

      expect(result.ide.length).toBeGreaterThan(0);
      expect(result.desktop.length).toBeGreaterThan(0);
      expect(result.extension.length).toBeGreaterThan(0);
      expect(result.cli.length).toBeGreaterThan(0);

      // Verify cursor is in IDE category
      expect(result.ide.some(c => c.id === 'cursor')).toBe(true);
      // Verify claude-desktop is in desktop category
      expect(result.desktop.some(c => c.id === 'claude-desktop')).toBe(true);
    });

    it('should not include custom in any category', async () => {
      const { getClientsByCategory } =
        await import('../../src/utils/mcp-paths.js');
      const result = getClientsByCategory();

      const allClients = [
        ...result.ide,
        ...result.desktop,
        ...result.extension,
        ...result.cli,
      ];
      expect(allClients.some(c => c.id === 'custom')).toBe(false);
    });
  });
});
