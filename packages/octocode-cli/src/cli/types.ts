/**
 * CLI Types
 */

export interface ParsedArgs {
  command: string | null;
  args: string[];
  options: Record<string, string | boolean>;
}

interface CLIOption {
  name: string;
  short?: string;
  description: string;
  hasValue?: boolean;
  default?: string | boolean;
}

export interface CLICommand {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  options?: CLIOption[];
  handler: (args: ParsedArgs) => Promise<void>;
}
