import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

const MCP_SERVER_NAME = 'octocode';
const MCP_COMMAND = 'npx';
const MCP_ARGS = ['octocode-mcp@latest'];

let mcpProcess: ChildProcess | null = null;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

type McpServerConfig = {
  command: string;
  type: 'stdio';
  args: string[];
  env?: Record<string, string>;
};

type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

// MCP Client definitions with platform-aware paths
type McpClientDef = {
  name: string;
  getConfigPath: () => string;
  configKey: 'mcpServers' | 'servers';
};

function getPlatformConfigBase(): string {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support');
  } else if (platform === 'win32') {
    return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  } else {
    return path.join(home, '.config');
  }
}

const MCP_CLIENTS: Record<string, McpClientDef> = {
  cline: {
    name: 'Cline',
    getConfigPath: () =>
      path.join(
        getPlatformConfigBase(),
        'Code',
        'User',
        'globalStorage',
        'saoudrizwan.claude-dev',
        'settings',
        'cline_mcp_settings.json'
      ),
    configKey: 'mcpServers',
  },
  rooCode: {
    name: 'Roo Code',
    getConfigPath: () =>
      path.join(
        getPlatformConfigBase(),
        'Code',
        'User',
        'globalStorage',
        'rooveterinaryinc.roo-cline',
        'settings',
        'mcp_settings.json'
      ),
    configKey: 'mcpServers',
  },
  trae: {
    name: 'Trae',
    getConfigPath: () => path.join(getPlatformConfigBase(), 'Trae', 'mcp.json'),
    configKey: 'mcpServers',
  },
};

// Helper: Safe JSON Read
async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    // Check access first to avoid throwing on non-existent files
    try {
      await fsPromises.access(filePath, fs.constants.R_OK);
    } catch {
      return null;
    }

    const content = await fsPromises.readFile(filePath, 'utf-8');
    if (!content.trim()) {
      return null;
    }
    return JSON.parse(content) as T;
  } catch (error) {
    if (outputChannel) {
      outputChannel.appendLine(
        `Failed to read/parse JSON at ${filePath}: ${error}`
      );
    }
    return null;
  }
}

// Detect editor type
function getEditorInfo(): {
  name: string;
  scheme: string;
  mcpConfigPath: string | null;
} {
  try {
    const appName = vscode.env.appName.toLowerCase();

    if (appName.includes('cursor')) {
      // Windows uses %APPDATA%\Cursor, macOS/Linux use ~/.cursor
      const cursorConfigPath =
        process.platform === 'win32'
          ? path.join(getPlatformConfigBase(), 'Cursor', 'mcp.json')
          : path.join(os.homedir(), '.cursor', 'mcp.json');
      return {
        name: 'Cursor',
        scheme: 'cursor',
        mcpConfigPath: cursorConfigPath,
      };
    }

    if (appName.includes('windsurf')) {
      return {
        name: 'Windsurf',
        scheme: 'windsurf',
        mcpConfigPath: path.join(
          os.homedir(),
          '.codeium',
          'windsurf',
          'mcp_config.json'
        ),
      };
    }

    if (appName.includes('antigravity')) {
      return {
        name: 'Antigravity',
        scheme: 'antigravity',
        mcpConfigPath: path.join(
          os.homedir(),
          '.gemini',
          'antigravity',
          'mcp_config.json'
        ),
      };
    }

    if (appName.includes('trae')) {
      return {
        name: 'Trae',
        scheme: 'trae',
        mcpConfigPath: path.join(getPlatformConfigBase(), 'Trae', 'mcp.json'),
      };
    }

    // VS Code fallback - use Claude Desktop config (platform-aware)
    return {
      name: 'VS Code',
      scheme: 'vscode',
      mcpConfigPath: path.join(
        getPlatformConfigBase(),
        'Claude',
        'claude_desktop_config.json'
      ),
    };
  } catch (err) {
    // Fallback if something fails in detection
    return {
      name: 'VS Code',
      scheme: 'vscode',
      mcpConfigPath: null,
    };
  }
}

// Install MCP server in editor's config
async function installMcpServer(
  mcpConfigPath: string,
  showNotification = true,
  clientName = 'editor'
): Promise<boolean> {
  try {
    if (!mcpConfigPath) {
      throw new Error('Invalid configuration path provided');
    }

    const config = vscode.workspace.getConfiguration('octocode');
    const githubToken = config.get<string>('githubToken');

    let mcpConfig: McpConfig = { mcpServers: {} };

    // Read existing config safely
    const existingConfig = await safeReadJson<McpConfig>(mcpConfigPath);
    if (existingConfig && typeof existingConfig === 'object') {
      // Preserve existing config structure
      mcpConfig = {
        ...existingConfig,
        mcpServers: existingConfig.mcpServers || {},
      };
    }

    // Check if already configured correctly
    const existingServer = mcpConfig.mcpServers[MCP_SERVER_NAME];
    if (
      existingServer &&
      existingServer.command === MCP_COMMAND &&
      JSON.stringify(existingServer.args) === JSON.stringify(MCP_ARGS)
    ) {
      // Check if env var needs update (e.g. token changed)
      const currentToken = existingServer.env?.GITHUB_TOKEN;
      if (currentToken === githubToken) {
        if (showNotification) {
          vscode.window.showInformationMessage(
            `Octocode MCP server is already configured for ${clientName}.`
          );
        }
        return false;
      }
    }

    // Configure server
    const serverConfig: McpServerConfig = {
      command: MCP_COMMAND,
      type: 'stdio',
      args: MCP_ARGS,
    };

    // Add GitHub token if configured
    if (githubToken) {
      serverConfig.env = {
        GITHUB_TOKEN: githubToken,
      };
    }

    mcpConfig.mcpServers[MCP_SERVER_NAME] = serverConfig;

    // Ensure directory exists
    try {
      const dirPath = path.dirname(mcpConfigPath);
      await fsPromises.mkdir(dirPath, { recursive: true });
    } catch (err) {
      throw new Error(
        `Failed to create directory ${path.dirname(mcpConfigPath)}: ${err}`
      );
    }

    // Write config
    try {
      await fsPromises.writeFile(
        mcpConfigPath,
        JSON.stringify(mcpConfig, null, 2),
        'utf-8'
      );
    } catch (err) {
      throw new Error(`Failed to write config file ${mcpConfigPath}: ${err}`);
    }

    outputChannel.appendLine(`MCP server configured at: ${mcpConfigPath}`);

    if (showNotification) {
      vscode.window.showInformationMessage(
        `Octocode MCP server configured for ${clientName}! Restart to enable it.`
      );
    }

    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Failed to configure MCP server: ${errorMsg}`);
    if (showNotification) {
      vscode.window.showErrorMessage(
        `Failed to configure MCP server: ${errorMsg}`
      );
    }
    return false;
  }
}

// Install MCP server for a specific client
async function installForClient(clientKey: string): Promise<void> {
  try {
    const client = MCP_CLIENTS[clientKey];
    if (!client) {
      vscode.window.showErrorMessage(`Unknown MCP client: ${clientKey}`);
      return;
    }

    const configPath = client.getConfigPath();
    await installMcpServer(configPath, true, client.name);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `Error installing for ${clientKey}: ${errorMsg}`
    );
    outputChannel.appendLine(`Error installing for ${clientKey}: ${errorMsg}`);
  }
}

// Start MCP server process
function startMcpServer(): void {
  try {
    if (mcpProcess) {
      vscode.window.showWarningMessage('MCP server is already running.');
      return;
    }

    const config = vscode.workspace.getConfiguration('octocode');
    const githubToken = config.get<string>('githubToken');

    const env: Record<string, string | undefined> = { ...process.env };
    if (githubToken) {
      env.GITHUB_TOKEN = githubToken;
    }

    outputChannel.appendLine('Starting Octocode MCP server...');

    try {
      mcpProcess = spawn('npx', ['octocode-mcp@latest'], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
    } catch (spawnError) {
      outputChannel.appendLine(`Failed to spawn process: ${spawnError}`);
      vscode.window.showErrorMessage(
        `Failed to start MCP server process: ${spawnError}`
      );
      return;
    }

    if (mcpProcess.stdout) {
      mcpProcess.stdout.on('data', (data: Buffer) => {
        outputChannel.appendLine(`[stdout] ${data.toString()}`);
      });
    }

    if (mcpProcess.stderr) {
      mcpProcess.stderr.on('data', (data: Buffer) => {
        outputChannel.appendLine(`[stderr] ${data.toString()}`);
      });
    }

    mcpProcess.on('close', (code: number | null) => {
      outputChannel.appendLine(`MCP server exited with code ${code}`);
      mcpProcess = null;
      updateStatusBar(false);
    });

    mcpProcess.on('error', (err: Error) => {
      outputChannel.appendLine(`Failed to start MCP server: ${err.message}`);
      mcpProcess = null;
      updateStatusBar(false);
      vscode.window.showErrorMessage(`MCP Server error: ${err.message}`);
    });

    updateStatusBar(true);
    vscode.window.showInformationMessage('Octocode MCP server started.');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Unexpected error starting server: ${errorMsg}`);
    vscode.window.showErrorMessage(
      `Unexpected error starting server: ${errorMsg}`
    );
    if (mcpProcess) {
      try {
        (mcpProcess as ChildProcess).kill();
      } catch {
        // ignore kill error
      }
      mcpProcess = null;
    }
  }
}

// Stop MCP server process
function stopMcpServer(): void {
  try {
    if (!mcpProcess) {
      vscode.window.showWarningMessage('MCP server is not running.');
      return;
    }

    outputChannel.appendLine('Stopping Octocode MCP server...');
    mcpProcess.kill();
    mcpProcess = null;
    updateStatusBar(false);
    vscode.window.showInformationMessage('Octocode MCP server stopped.');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Error stopping server: ${errorMsg}`);
  }
}

// Update status bar
function updateStatusBar(running: boolean): void {
  try {
    if (running) {
      statusBarItem.text = '$(zap) Octocode MCP: Running';
      statusBarItem.tooltip = 'Octocode MCP server is running. Click to stop.';
      statusBarItem.command = 'octocode.stopServer';
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.text = '$(circle-slash) Octocode MCP: Off';
      statusBarItem.tooltip = 'Octocode MCP server is stopped. Click to start.';
      statusBarItem.command = 'octocode.startServer';
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    }
    statusBarItem.show();
  } catch (err) {
    outputChannel.appendLine(`Error updating status bar: ${err}`);
  }
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    outputChannel = vscode.window.createOutputChannel('Octocode MCP');

    // Wrap editor info detection
    let editorInfo;
    try {
      editorInfo = getEditorInfo();
    } catch (e) {
      outputChannel.appendLine(`Error detecting editor: ${e}`);
      editorInfo = { name: 'VS Code', scheme: 'vscode', mcpConfigPath: null };
    }

    outputChannel.appendLine(
      `Octocode MCP extension activated in ${editorInfo.name}`
    );

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    context.subscriptions.push(statusBarItem);
    updateStatusBar(false);

    const config = vscode.workspace.getConfiguration('octocode');

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.startServer', () => {
        startMcpServer();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.stopServer', () => {
        stopMcpServer();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.showStatus', () => {
        if (mcpProcess) {
          vscode.window.showInformationMessage(
            "Octocode MCP server is running.\n\nTo use with AI assistants, the server should be configured in your editor's MCP settings."
          );
        } else {
          vscode.window.showInformationMessage(
            "Octocode MCP server is not running.\n\nUse 'Octocode MCP: Start Server' to start it, or install it in your editor's MCP config for automatic startup."
          );
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.installMcp', async () => {
        try {
          if (editorInfo.mcpConfigPath) {
            await installMcpServer(
              editorInfo.mcpConfigPath,
              true,
              editorInfo.name
            );
          } else {
            vscode.window.showErrorMessage(
              'MCP configuration not supported for this editor.'
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to install MCP: ${msg}`);
        }
      })
    );

    // Register commands for specific MCP clients
    const registerInstallCommand = (command: string, clientKey: string) => {
      context.subscriptions.push(
        vscode.commands.registerCommand(command, async () => {
          await installForClient(clientKey);
        })
      );
    };

    registerInstallCommand('octocode.installForCline', 'cline');
    registerInstallCommand('octocode.installForRooCode', 'rooCode');
    registerInstallCommand('octocode.installForTrae', 'trae');

    // Install for all known MCP clients
    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.installForAll', async () => {
        const results: string[] = [];
        for (const client of Object.values(MCP_CLIENTS)) {
          try {
            const configPath = client.getConfigPath();
            const installed = await installMcpServer(
              configPath,
              false,
              client.name
            );
            if (installed) {
              results.push(`✅ ${client.name}`);
            } else {
              results.push(`⏭️ ${client.name} (already configured)`);
            }
          } catch {
            results.push(`❌ ${client.name} (failed)`);
          }
        }
        vscode.window.showInformationMessage(
          `Octocode MCP installation complete:\n${results.join('\n')}`
        );
      })
    );

    // Auto-install MCP server if configured
    try {
      const autoInstall = config.get<boolean>('autoInstallMcp', true);
      if (autoInstall && editorInfo.mcpConfigPath) {
        // Check if config file exists and has our server
        let needsInstall = true;

        const existingConfig = await safeReadJson<McpConfig>(
          editorInfo.mcpConfigPath
        );
        if (existingConfig?.mcpServers?.[MCP_SERVER_NAME]) {
          needsInstall = false;
        }

        if (needsInstall) {
          const wasInstalled = await installMcpServer(
            editorInfo.mcpConfigPath,
            false
          );
          if (wasInstalled) {
            vscode.window.showInformationMessage(
              `Octocode MCP server has been configured. Restart ${editorInfo.name} to enable it.`
            );
          }
        }
      }
    } catch (autoInstallErr) {
      outputChannel.appendLine(`Auto-install failed: ${autoInstallErr}`);
      // Don't show error message to user to avoid annoyance on startup
    }

    // Cleanup on deactivation
    context.subscriptions.push({
      dispose: () => {
        try {
          if (mcpProcess) {
            mcpProcess.kill();
            mcpProcess = null;
          }
          outputChannel.dispose();
        } catch {
          // ignore dispose error
        }
      },
    });

    outputChannel.appendLine('Octocode MCP extension ready.');
  } catch (activationError) {
    console.error('Failed to activate Octocode MCP:', activationError);
    if (activationError instanceof Error) {
      vscode.window.showErrorMessage(
        `Octocode MCP failed to activate: ${activationError.message}`
      );
    }
  }
}

export function deactivate(): void {
  try {
    if (mcpProcess) {
      mcpProcess.kill();
      mcpProcess = null;
    }
  } catch {
    // ignore kill error
  }
}
