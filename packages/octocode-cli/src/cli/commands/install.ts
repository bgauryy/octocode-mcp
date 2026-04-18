import type { CLICommand, ParsedArgs } from '../types.js';
import type { IDE, InstallMethod } from '../../types/index.js';
import { c, bold, dim } from '../../utils/colors.js';
import { installOctocode, getInstallPreview } from '../../features/install.js';
import { checkNodeInPath, checkNpmInPath } from '../../features/node-check.js';
import { INSTALL_METHOD_INFO } from '../../ui/constants.js';
import { Spinner } from '../../utils/spinner.js';
import { runInteractiveMode } from '../../interactive.js';
import { getIDEDisplayName, printNodeDoctorHintCLI } from './shared.js';

export const installCommand: CLICommand = {
  name: 'install',
  aliases: ['i', 'setup'],
  description: 'Install octocode-mcp for an IDE',
  usage: 'octocode install --ide <ide> [--method <npx|direct>] [--force]',
  options: [
    {
      name: 'ide',
      description:
        'IDE to configure: cursor, claude-desktop, claude-code, windsurf, zed, vscode-cline, vscode-roo, vscode-continue, opencode, trae, antigravity, codex, gemini-cli, goose, kiro',
      hasValue: true,
    },
    {
      name: 'method',
      short: 'm',
      description: 'Installation method (npx or direct)',
      hasValue: true,
      default: 'npx',
    },
    {
      name: 'force',
      short: 'f',
      description: 'Overwrite existing configuration',
    },
  ],
  handler: async (args: ParsedArgs) => {
    const ide = args.options['ide'] as IDE | undefined;
    const method = (args.options['method'] || 'npx') as InstallMethod;
    const force = Boolean(args.options['force'] || args.options['f']);

    if (!ide) {
      await runInteractiveMode();
      return;
    }

    if (method === 'npx') {
      const nodeCheck = checkNodeInPath();
      const npmCheck = checkNpmInPath();

      if (!nodeCheck.installed) {
        console.log();
        console.log(
          `  ${c('red', '✗')} Node.js is ${c('red', 'not found in PATH')}`
        );
        console.log(
          `  ${dim('Node.js is required for npx installation method.')}`
        );
        console.log();
        printNodeDoctorHintCLI();
        process.exitCode = 1;
        return;
      }

      if (!npmCheck.installed) {
        console.log();
        console.log(
          `  ${c('yellow', '⚠')} npm is ${c('yellow', 'not found in PATH')}`
        );
        console.log(`  ${dim('npm is required for npx installation method.')}`);
        console.log();
        printNodeDoctorHintCLI();
        process.exitCode = 1;
        return;
      }
    }

    const supportedIDEs = [
      'cursor',
      'claude',
      'claude-desktop',
      'claude-code',
      'windsurf',
      'zed',
      'vscode-cline',
      'vscode-roo',
      'vscode-continue',
      'opencode',
      'trae',
      'antigravity',
      'codex',
      'gemini-cli',
      'goose',
      'kiro',
    ];
    if (!supportedIDEs.includes(ide)) {
      console.log();
      console.log(`  ${c('red', '✗')} Invalid IDE: ${ide}`);
      console.log(`  ${dim('Supported:')} ${supportedIDEs.join(', ')}`);
      console.log();
      process.exitCode = 1;
      return;
    }

    if (!['npx', 'direct'].includes(method)) {
      console.log();
      console.log(`  ${c('red', '✗')} Invalid method: ${method}`);
      console.log(`  ${dim('Supported:')} npx, direct`);
      console.log();
      process.exitCode = 1;
      return;
    }

    const preview = getInstallPreview(ide, method);

    if (preview.action === 'override' && !force) {
      console.log();
      console.log(`  ${c('yellow', '⚠')} Octocode is already configured.`);
      console.log(
        `  ${dim('Use')} ${c('cyan', '--force')} ${dim('to overwrite.')}`
      );
      console.log();
      process.exitCode = 1;
      return;
    }

    console.log();
    console.log(`  ${bold('Installing octocode-mcp')}`);
    console.log(`    ${dim('IDE:')}    ${getIDEDisplayName(ide)}`);
    console.log(`    ${dim('Method:')} ${INSTALL_METHOD_INFO[method].name}`);
    console.log(`    ${dim('Action:')} ${preview.action.toUpperCase()}`);
    console.log();

    const spinner = new Spinner('Writing configuration...').start();

    const result = installOctocode({ ide, method, force });

    if (result.success) {
      spinner.succeed('Installation complete!');
      console.log();
      console.log(
        `  ${c('green', '✓')} Config saved to: ${preview.configPath}`
      );
      if (result.backupPath) {
        console.log(`  ${dim('Backup:')} ${result.backupPath}`);
      }
      console.log();
      console.log(
        `  ${bold('Next:')} Restart ${getIDEDisplayName(ide)} to activate.`
      );
      console.log();
    } else {
      spinner.fail('Installation failed');
      console.log();
      if (result.error) {
        console.log(`  ${c('red', '✗')} ${result.error}`);
      }
      console.log();
      process.exitCode = 1;
    }
  },
};
