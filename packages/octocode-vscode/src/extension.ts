import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

const MCP_SERVER_NAME = 'octocode-mcp';
const MCP_COMMAND = 'npx';
const MCP_ARGS = ['-y', 'octocode-mcp'];

let mcpProcess: ChildProcess | null = null;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

type McpServerConfig = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

// Detect editor type
function getEditorInfo(): {
  name: string;
  scheme: string;
  mcpConfigPath: string | null;
} {
  const appName = vscode.env.appName.toLowerCase();

  if (appName.includes('cursor')) {
    return {
      name: 'Cursor',
      scheme: 'cursor',
      mcpConfigPath: path.join(os.homedir(), '.cursor', 'mcp.json'),
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

  // VS Code - check for Claude Desktop config
  return {
    name: 'VS Code',
    scheme: 'vscode',
    mcpConfigPath: path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    ),
  };
}

// Install MCP server in editor's config
async function installMcpServer(
  mcpConfigPath: string,
  showNotification = true
): Promise<boolean> {
  try {
    const config = vscode.workspace.getConfiguration('octocode');
    const githubToken = config.get<string>('githubToken');

    let mcpConfig: McpConfig = { mcpServers: {} };

    // Read existing config if it exists
    if (fs.existsSync(mcpConfigPath)) {
      try {
        const content = fs.readFileSync(mcpConfigPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && parsed.mcpServers) {
          mcpConfig = parsed as McpConfig;
        }
      } catch {
        // Invalid JSON, will create new config
      }
    }

    // Check if already configured correctly
    const existingServer = mcpConfig.mcpServers[MCP_SERVER_NAME];
    if (
      existingServer &&
      existingServer.command === MCP_COMMAND &&
      JSON.stringify(existingServer.args) === JSON.stringify(MCP_ARGS)
    ) {
      if (showNotification) {
        vscode.window.showInformationMessage(
          'Octocode MCP server is already configured.'
        );
      }
      return false;
    }

    // Configure server
    const serverConfig: McpServerConfig = {
      command: MCP_COMMAND,
      args: MCP_ARGS,
    };

    // Add GitHub token if configured
    if (githubToken) {
      serverConfig.env = {
        GITHUB_TOKEN: githubToken,
      };
    }

    mcpConfig.mcpServers[MCP_SERVER_NAME] = serverConfig;

    // Ensure directory exists and write config
    fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
    fs.writeFileSync(
      mcpConfigPath,
      JSON.stringify(mcpConfig, null, 2),
      'utf-8'
    );

    outputChannel.appendLine(`MCP server configured at: ${mcpConfigPath}`);

    if (showNotification) {
      const editorInfo = getEditorInfo();
      vscode.window.showInformationMessage(
        `Octocode MCP server configured! Restart ${editorInfo.name} to enable it.`
      );
    }

    return true;
  } catch (err) {
    outputChannel.appendLine(`Failed to configure MCP server: ${err}`);
    if (showNotification) {
      vscode.window.showErrorMessage(`Failed to configure MCP server: ${err}`);
    }
    return false;
  }
}

// Start MCP server process
function startMcpServer(): void {
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

  mcpProcess = spawn('npx', ['-y', 'octocode-mcp'], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  mcpProcess.stdout?.on('data', (data: Buffer) => {
    outputChannel.appendLine(`[stdout] ${data.toString()}`);
  });

  mcpProcess.stderr?.on('data', (data: Buffer) => {
    outputChannel.appendLine(`[stderr] ${data.toString()}`);
  });

  mcpProcess.on('close', (code: number | null) => {
    outputChannel.appendLine(`MCP server exited with code ${code}`);
    mcpProcess = null;
    updateStatusBar(false);
  });

  mcpProcess.on('error', (err: Error) => {
    outputChannel.appendLine(`Failed to start MCP server: ${err.message}`);
    mcpProcess = null;
    updateStatusBar(false);
  });

  updateStatusBar(true);
  vscode.window.showInformationMessage('Octocode MCP server started.');
}

// Stop MCP server process
function stopMcpServer(): void {
  if (!mcpProcess) {
    vscode.window.showWarningMessage('MCP server is not running.');
    return;
  }

  outputChannel.appendLine('Stopping Octocode MCP server...');
  mcpProcess.kill();
  mcpProcess = null;
  updateStatusBar(false);
  vscode.window.showInformationMessage('Octocode MCP server stopped.');
}

// Update status bar
function updateStatusBar(running: boolean): void {
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
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('Octocode MCP');
  const editorInfo = getEditorInfo();
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
      if (editorInfo.mcpConfigPath) {
        await installMcpServer(editorInfo.mcpConfigPath, true);
      } else {
        vscode.window.showErrorMessage(
          'MCP configuration not supported for this editor.'
        );
      }
    })
  );

  // Auto-install MCP server if configured
  const autoInstall = config.get<boolean>('autoInstallMcp', true);
  if (autoInstall && editorInfo.mcpConfigPath) {
    // Check if config file exists and has our server
    let needsInstall = true;
    if (fs.existsSync(editorInfo.mcpConfigPath)) {
      try {
        const content = fs.readFileSync(editorInfo.mcpConfigPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed?.mcpServers?.[MCP_SERVER_NAME]) {
          needsInstall = false;
        }
      } catch {
        // Will install
      }
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

  // Cleanup on deactivation
  context.subscriptions.push({
    dispose: () => {
      if (mcpProcess) {
        mcpProcess.kill();
        mcpProcess = null;
      }
      outputChannel.dispose();
    },
  });

  outputChannel.appendLine('Octocode MCP extension ready.');
}

export function deactivate(): void {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
  }
}
