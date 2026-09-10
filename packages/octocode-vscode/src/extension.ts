import * as vscode from 'vscode';

import {
  createMcpClients,
  detectEditorInfo,
  type McpClientDef,
} from './configPaths';
import { readJsonFile } from './jsonUtils';

import {
  configureMcpServer,
  updateMcpConfigToken,
  type ConfigKey,
} from './mcpConfig';
import { McpProcess } from './mcpProcess';

const GITHUB_AUTH_PROVIDER_ID = 'github';
const GITHUB_SCOPES = ['repo', 'read:user'];

let mcpProcess: McpProcess;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let isAuthenticated = false;

const MCP_CLIENTS: Record<string, McpClientDef> = createMcpClients();

function getEditorInfo() {
  return detectEditorInfo(vscode.env.appName);
}

async function getGitHubToken(): Promise<string | undefined> {
  try {
    const session = await vscode.authentication.getSession(
      GITHUB_AUTH_PROVIDER_ID,
      GITHUB_SCOPES,
      { silent: true }
    );
    if (session) {
      return session.accessToken;
    }
  } catch (err) {
    outputChannel.appendLine(`Error checking GitHub session: ${err}`);
  }

  const config = vscode.workspace.getConfiguration('octocode');
  return config.get<string>('githubToken');
}

async function loginToGitHub(): Promise<
  vscode.AuthenticationSession | undefined
> {
  try {
    outputChannel.appendLine('Initiating GitHub OAuth login...');

    const session = await vscode.authentication.getSession(
      GITHUB_AUTH_PROVIDER_ID,
      GITHUB_SCOPES,
      { createIfNone: true }
    );

    if (session) {
      outputChannel.appendLine(
        `Logged in to GitHub as ${session.account.label}`
      );
      isAuthenticated = true;

      await syncTokenToAllConfigs(session.accessToken);

      vscode.window.showInformationMessage(
        `Signed in to GitHub as ${session.account.label}. MCP configs updated!`
      );

      return session;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`GitHub login failed: ${errorMsg}`);
    vscode.window.showErrorMessage(`GitHub login failed: ${errorMsg}`);
  }
  return undefined;
}

async function logoutFromGitHub(): Promise<void> {
  try {
    outputChannel.appendLine('Clearing GitHub token from MCP configs...');
    isAuthenticated = false;

    await syncTokenToAllConfigs(undefined);

    vscode.window.showInformationMessage(
      'GitHub token cleared from MCP configs. To fully sign out, use VS Code Account menu (bottom left).'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`Error during logout: ${errorMsg}`);
    vscode.window.showErrorMessage(`Error clearing GitHub token: ${errorMsg}`);
  }
}

async function syncTokenToAllConfigs(token: string | undefined): Promise<void> {
  const editorInfo = getEditorInfo();
  const configPaths: { name: string; path: string; configKey: ConfigKey }[] =
    [];

  if (editorInfo.mcpConfigPath) {
    configPaths.push({
      name: editorInfo.name,
      path: editorInfo.mcpConfigPath,
      configKey: editorInfo.configKey,
    });
  }

  for (const client of Object.values(MCP_CLIENTS)) {
    try {
      configPaths.push({
        name: client.name,
        path: client.getConfigPath(),
        configKey: client.configKey,
      });
    } catch {
      void 0;
    }
  }

  const failures: string[] = [];
  const seen = new Set<string>();
  for (const { name, path: configPath, configKey } of configPaths) {
    if (seen.has(configPath)) continue;
    seen.add(configPath);
    try {
      await updateMcpConfigToken(configPath, token, configKey);
      outputChannel.appendLine(
        `Updated token in ${name} config: ${configPath}`
      );
    } catch (err) {
      outputChannel.appendLine(`Failed to update ${name} config: ${err}`);
      failures.push(name);
    }
  }
  if (failures.length)
    throw new Error(`Could not update MCP configs for: ${failures.join(', ')}`);
}

async function checkGitHubAuthStatus(): Promise<{
  authenticated: boolean;
  accountName?: string;
  tokenSource: 'oauth' | 'manual' | 'none';
}> {
  try {
    const session = await vscode.authentication.getSession(
      GITHUB_AUTH_PROVIDER_ID,
      GITHUB_SCOPES,
      { silent: true }
    );
    if (session) {
      return {
        authenticated: true,
        accountName: session.account.label,
        tokenSource: 'oauth',
      };
    }
  } catch {
    void 0;
  }

  const config = vscode.workspace.getConfiguration('octocode');
  const manualToken = config.get<string>('githubToken');
  if (manualToken) {
    return {
      authenticated: true,
      tokenSource: 'manual',
    };
  }

  return {
    authenticated: false,
    tokenSource: 'none',
  };
}

async function installMcpServer(
  mcpConfigPath: string,
  showNotification = true,
  clientName = 'editor',
  configKey: ConfigKey = 'mcpServers'
): Promise<'installed' | 'unchanged' | 'failed'> {
  try {
    const result = await configureMcpServer(
      mcpConfigPath,
      await getGitHubToken(),
      configKey
    );
    outputChannel.appendLine(`MCP config ${result}: ${mcpConfigPath}`);
    if (showNotification) {
      vscode.window.showInformationMessage(
        result === 'installed'
          ? `Octocode MCP server configured for ${clientName}! Restart to enable it.`
          : `Octocode MCP server is already configured for ${clientName}.`
      );
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Failed to configure MCP server: ${message}`);
    if (showNotification)
      vscode.window.showErrorMessage(
        `Failed to configure MCP server: ${message}`
      );
    return 'failed';
  }
}

async function installForClient(clientKey: string): Promise<void> {
  try {
    const client = MCP_CLIENTS[clientKey];
    if (!client) {
      vscode.window.showErrorMessage(`Unknown MCP client: ${clientKey}`);
      return;
    }

    const configPath = client.getConfigPath();
    await installMcpServer(configPath, true, client.name, client.configKey);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `Error installing for ${clientKey}: ${errorMsg}`
    );
    outputChannel.appendLine(`Error installing for ${clientKey}: ${errorMsg}`);
  }
}

async function startMcpServer(): Promise<void> {
  try {
    const result = await mcpProcess.start();
    if (result === 'busy')
      vscode.window.showWarningMessage(
        'MCP server is already running or starting.'
      );
    if (result === 'started')
      vscode.window.showInformationMessage(
        'Octocode MCP server process started.'
      );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Failed to start MCP server: ${message}`);
    vscode.window.showErrorMessage(`Failed to start MCP server: ${message}`);
  }
}

function stopMcpServer(): void {
  try {
    if (mcpProcess.stop())
      vscode.window.showInformationMessage('Octocode MCP server stopped.');
    else vscode.window.showWarningMessage('MCP server is not running.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Error stopping server: ${message}`);
    vscode.window.showErrorMessage(`Error stopping server: ${message}`);
  }
}

function updateStatusBar(
  running: boolean,
  authenticated = isAuthenticated
): void {
  try {
    isAuthenticated = authenticated;
    const authTooltip = authenticated
      ? 'GitHub: signed in.'
      : 'GitHub: not signed in. Sign in from the Octocode commands in the Command Palette.';

    if (running) {
      statusBarItem.text = '$(search) Octocode · Running';
      statusBarItem.tooltip = `Octocode MCP server is running.\n${authTooltip}\nClick to stop the server.`;
      statusBarItem.command = 'octocode.stopServer';
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.text = '$(search) Octocode · Stopped';
      statusBarItem.tooltip = `Octocode MCP server is stopped.\n${authTooltip}\nClick to start the server.`;
      statusBarItem.command = 'octocode.startServer';
      statusBarItem.backgroundColor = undefined;
    }
    statusBarItem.name = 'Octocode';
    statusBarItem.accessibilityInformation = {
      label: `Octocode server ${running ? 'running' : 'stopped'}. ${authTooltip}`,
    };
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

    const editorInfo = getEditorInfo();

    outputChannel.appendLine(
      `Octocode MCP extension activated in ${editorInfo.name}`
    );

    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    context.subscriptions.push(statusBarItem, outputChannel);
    mcpProcess = new McpProcess({
      getToken: getGitHubToken,
      output: message => outputChannel.appendLine(message),
      state: running => updateStatusBar(running),
      error: error => {
        outputChannel.appendLine(`MCP server error: ${error.message}`);
        vscode.window.showErrorMessage(`MCP server error: ${error.message}`);
      },
    });
    context.subscriptions.push({ dispose: () => mcpProcess.stop() });

    const initialAuthStatus = await checkGitHubAuthStatus();
    isAuthenticated = initialAuthStatus.authenticated;
    updateStatusBar(false, isAuthenticated);

    if (initialAuthStatus.authenticated) {
      outputChannel.appendLine(
        `GitHub authenticated via ${initialAuthStatus.tokenSource}` +
          (initialAuthStatus.accountName
            ? ` as ${initialAuthStatus.accountName}`
            : '')
      );
    }

    const config = vscode.workspace.getConfiguration('octocode');

    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.startServer', () => {
        return startMcpServer();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.stopServer', () => {
        stopMcpServer();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.showStatus', () => {
        if (mcpProcess.running) {
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
      vscode.commands.registerCommand('octocode.loginGitHub', async () => {
        await loginToGitHub();
        const status = await checkGitHubAuthStatus();
        updateStatusBar(mcpProcess.running, status.authenticated);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.logoutGitHub', async () => {
        await logoutFromGitHub();
        const status = await checkGitHubAuthStatus();
        updateStatusBar(mcpProcess.running, status.authenticated);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.showAuthStatus', async () => {
        const status = await checkGitHubAuthStatus();
        if (status.authenticated) {
          const source =
            status.tokenSource === 'oauth' ? 'GitHub OAuth' : 'manual token';
          const account = status.accountName ? ` as ${status.accountName}` : '';
          vscode.window.showInformationMessage(
            `GitHub: Authenticated${account} (via ${source})`
          );
        } else {
          const action = await vscode.window.showInformationMessage(
            'GitHub: Not authenticated. Sign in to access private repositories.',
            'Sign in to GitHub'
          );
          if (action === 'Sign in to GitHub') {
            await loginToGitHub();
          }
        }
      })
    );

    context.subscriptions.push(
      vscode.authentication.onDidChangeSessions(async e => {
        if (e.provider.id === GITHUB_AUTH_PROVIDER_ID) {
          try {
            outputChannel.appendLine('GitHub auth session changed');

            const session = await vscode.authentication.getSession(
              GITHUB_AUTH_PROVIDER_ID,
              GITHUB_SCOPES,
              { silent: true }
            );

            if (session) {
              outputChannel.appendLine(
                `Session updated for ${session.account.label}`
              );
              isAuthenticated = true;
              await syncTokenToAllConfigs(session.accessToken);
            } else {
              outputChannel.appendLine('Session cleared');
              isAuthenticated = false;
              await syncTokenToAllConfigs(undefined);
            }

            updateStatusBar(mcpProcess.running, isAuthenticated);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`GitHub token sync failed: ${message}`);
            vscode.window.showErrorMessage(
              `GitHub token sync failed: ${message}`
            );
          }
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
              editorInfo.name,
              editorInfo.configKey
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

    context.subscriptions.push(
      vscode.commands.registerCommand('octocode.installForAll', async () => {
        const results: string[] = [];
        for (const client of Object.values(MCP_CLIENTS)) {
          try {
            const configPath = client.getConfigPath();
            const installed = await installMcpServer(
              configPath,
              false,
              client.name,
              client.configKey
            );
            if (installed === 'installed') {
              results.push(`✅ ${client.name}`);
            } else {
              results.push(
                installed === 'unchanged'
                  ? `⏭️ ${client.name} (already configured)`
                  : `❌ ${client.name} (failed)`
              );
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

    try {
      const autoInstall = config.get<boolean>('autoInstallMcp', true);
      if (autoInstall && editorInfo.mcpConfigPath) {
        let needsInstall = true;

        const existingConfig = await readJsonFile<
          Record<string, Record<string, unknown>>
        >(editorInfo.mcpConfigPath);
        if (existingConfig?.[editorInfo.configKey]?.octocode) {
          needsInstall = false;
        }

        if (needsInstall) {
          const wasInstalled = await installMcpServer(
            editorInfo.mcpConfigPath,
            false,
            editorInfo.name,
            editorInfo.configKey
          );
          if (wasInstalled === 'installed') {
            vscode.window.showInformationMessage(
              `Octocode MCP server has been configured. Restart ${editorInfo.name} to enable it.`
            );
          }
        }
      }
    } catch (autoInstallErr) {
      outputChannel.appendLine(`Auto-install failed: ${autoInstallErr}`);
    }

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
  mcpProcess?.stop();
}
