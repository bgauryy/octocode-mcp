/**
 * Command Validator
 *
 * Validates commands and arguments to prevent command injection and ensure
 * only safe, allowed commands can be executed by the application.
 *
 * This is a critical security component that prevents:
 * - Execution of unauthorized commands
 * - Command injection attacks
 * - Privilege escalation through command manipulation
 */

export class CommandValidator {
  /**
   * Allowed NPM commands that are safe to execute
   * These commands are read-only or configuration-related and cannot
   * modify the system or install packages.
   */
  private static readonly ALLOWED_NPM_COMMANDS = {
    view: ['view'], // View package information
    search: ['search'], // Search for packages
    ping: ['ping'], // Test NPM registry connectivity
    config: ['config'], // View NPM configuration (read-only operations)
    whoami: ['whoami'], // Show current NPM user
  } as const;

  /**
   * Allowed GitHub CLI commands that are safe to execute
   * Limited to authentication-related read-only operations.
   */
  private static readonly ALLOWED_GH_COMMANDS = {
    auth: ['auth'], // Authentication operations
    version: ['version'], // Version information
  } as const;

  /**
   * Validate NPM command and arguments
   *
   * @param command - The NPM command to validate
   * @param args - Command arguments (first argument should match command)
   * @returns true if command is allowed, false otherwise
   */
  public static validateNpmCommand(command: string, args: string[]): boolean {
    // Check if command is in allowlist
    const allowedCommands = Object.keys(this.ALLOWED_NPM_COMMANDS);
    if (!allowedCommands.includes(command)) {
      return false;
    }

    // Validate that first argument matches the command
    // This prevents command substitution attacks
    if (args.length === 0 || args[0] !== command) {
      return false;
    }

    return true;
  }

  /**
   * Validate GitHub CLI command and arguments
   *
   * @param command - The main GH command (e.g., 'auth')
   * @param args - Command arguments (first argument should match command)
   * @returns true if command is allowed, false otherwise
   */
  public static validateGhCommand(command: string, args: string[]): boolean {
    // Check if command is in allowlist
    const allowedCommands = Object.keys(this.ALLOWED_GH_COMMANDS);
    if (!allowedCommands.includes(command)) {
      return false;
    }

    // Validate that first argument matches the command
    if (args.length === 0 || args[0] !== command) {
      return false;
    }

    return true;
  }

  /**
   * Generic command validation for any command type
   *
   * @param commandType - Type of command ('npm' or 'gh')
   * @param command - The command to validate
   * @param args - Command arguments
   * @returns true if command is allowed, false otherwise
   */
  public static validateCommand(
    commandType: 'npm' | 'gh',
    command: string,
    args: string[]
  ): boolean {
    switch (commandType) {
      case 'npm':
        return this.validateNpmCommand(command, args);
      case 'gh':
        return this.validateGhCommand(command, args);
      default:
        return false;
    }
  }

  /**
   * Get list of allowed NPM commands (for testing/debugging)
   *
   * @returns Array of allowed NPM command names
   */
  public static getAllowedNpmCommands(): string[] {
    return Object.keys(this.ALLOWED_NPM_COMMANDS);
  }

  /**
   * Get list of allowed GitHub CLI commands (for testing/debugging)
   *
   * @returns Array of allowed GH command names
   */
  public static getAllowedGhCommands(): string[] {
    return Object.keys(this.ALLOWED_GH_COMMANDS);
  }

  /**
   * Check if a command is potentially dangerous
   *
   * @param command - Command to check
   * @returns true if command is known to be dangerous
   */
  public static isDangerousCommand(command: string): boolean {
    const dangerousCommands = [
      // NPM dangerous commands
      'install',
      'uninstall',
      'publish',
      'unpublish',
      'run-script',
      'exec',
      'init',
      'create',
      'update',
      'audit',
      'fund',

      // System commands
      'rm',
      'del',
      'rmdir',
      'mv',
      'cp',
      'chmod',
      'chown',
      'sudo',
      'su',
      'curl',
      'wget',
      'ssh',
      'scp',
      'rsync',

      // Shell commands
      'bash',
      'sh',
      'zsh',
      'fish',
      'cmd',
      'powershell',
      'pwsh',
    ];

    return dangerousCommands.includes(command.toLowerCase());
  }
}
