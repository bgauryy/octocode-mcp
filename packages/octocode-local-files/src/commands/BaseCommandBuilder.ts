/**
 * Base command builder class for constructing safe shell commands
 */

import { escapeShellArg } from '../security/commandValidator.js';

/**
 * Abstract base class for building command strings safely
 */
export abstract class BaseCommandBuilder {
  protected command: string;
  protected args: string[] = [];

  constructor(command: string) {
    this.command = command;
  }

  /**
   * Adds a flag (e.g., -r, -i)
   */
  addFlag(flag: string): this {
    this.args.push(flag);
    return this;
  }

  /**
   * Adds an option with a value (e.g., -A 3)
   */
  protected addOption(option: string, value: string | number): this {
    this.args.push(option, String(value));
    return this;
  }

  /**
   * Adds a raw argument (will be validated but not escaped)
   */
  protected addArg(arg: string): this {
    this.args.push(arg);
    return this;
  }

  /**
   * Adds an escaped argument (for user input)
   */
  protected addEscapedArg(arg: string): this {
    this.args.push(escapeShellArg(arg));
    return this;
  }

  /**
   * Builds the final command arguments array
   */
  build(): { command: string; args: string[] } {
    return {
      command: this.command,
      args: [...this.args],
    };
  }

  /**
   * Resets the builder to initial state
   */
  reset(): this {
    this.args = [];
    return this;
  }

  /**
   * Gets the current args (for debugging)
   */
  getArgs(): string[] {
    return [...this.args];
  }
}
