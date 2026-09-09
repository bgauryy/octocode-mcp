export interface CLIOption {
  name: string;
  description: string;
  hasValue?: boolean;
  default?: string | number | boolean;
}

export interface CLICommandSpec {
  name: string;
  description: string;
  usage?: string;
  scheme?: readonly string[];
  whenToUse?: readonly string[];
  examples?: readonly string[];
  options?: readonly CLIOption[];
}

export type RuntimeCLIOption = Pick<CLIOption, 'name' | 'hasValue' | 'default'>;

export interface ParsedArgs {
  command: string | null;
  args: string[];
  options: Record<string, string | boolean>;
  /**
   * The unmodified argv the parser consumed. Order- and repeat-preserving —
   * used by the schema-aware tool flag parser, since `options` collapses
   * repeated flags and cannot distinguish booleans from consumed values.
   * Optional so hand-built ParsedArgs (tests, embedders) stay valid; the
   * tool flag parser falls back to reconstructing a tail from options.
   */
  raw?: string[];
}

// A runnable command is behavior, not documentation: it carries only its name,
// the option list used for flag validation, and a handler. ALL human-facing
// spec content (description/usage/scheme/whenToUse/examples/options copy) is
// sourced from the package-local command specs via findStaticCommandHelp, so it
// is intentionally not duplicated on runtime command objects.
export interface CLICommand {
  name: string;
  options?: RuntimeCLIOption[];
  handler: (args: ParsedArgs) => Promise<void> | void;
}
