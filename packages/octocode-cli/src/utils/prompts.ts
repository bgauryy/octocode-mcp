/**
 * Dynamic Import for ES Module (@inquirer/prompts)
 */

/**
 * Error thrown when user cancels a prompt (e.g., presses Escape)
 * This is distinct from ExitPromptError (Ctrl+C) which exits the app
 */
export class CancelPromptError extends Error {
  override name = 'CancelPromptError';
  override message = 'Prompt was canceled';
}

type SelectConfig<T> = {
  message: string;
  choices: Array<
    | {
        name: string;
        value: T;
        description?: string;
      }
    | { type: 'separator'; separator?: string }
  >;
  pageSize?: number;
  loop?: boolean;
  theme?: {
    prefix?: string;
    style?: {
      highlight?: (text: string) => string;
      message?: (text: string) => string;
    };
  };
};

type SelectFunction = <T>(config: SelectConfig<T>) => Promise<T>;

type ConfirmFunction = (config: {
  message: string;
  default?: boolean;
}) => Promise<boolean>;

type InputFunction = (config: {
  message: string;
  default?: string;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
}) => Promise<string>;

type CheckboxFunction = <T>(config: {
  message: string;
  choices: Array<{
    name: string;
    value: T;
    checked?: boolean;
    disabled?: boolean | string;
    description?: string;
  }>;
  pageSize?: number;
  loop?: boolean;
  required?: boolean;
  theme?: {
    prefix?: string;
    style?: {
      highlight?: (text: string) => string;
      message?: (text: string) => string;
    };
  };
}) => Promise<T[]>;

type SearchFunction = <T>(config: {
  message: string;
  source: (
    term: string | undefined,
    opt: { signal: AbortSignal }
  ) =>
    | Promise<
        Array<{
          value: T;
          name?: string;
          description?: string;
          disabled?: boolean | string;
        }>
      >
    | Array<{
        value: T;
        name?: string;
        description?: string;
        disabled?: boolean | string;
      }>;
  pageSize?: number;
  theme?: {
    prefix?: string;
    style?: {
      highlight?: (text: string) => string;
      message?: (text: string) => string;
    };
  };
}) => Promise<T>;

// Separator is a class that can be instantiated with optional text
interface SeparatorInstance {
  type: 'separator';
  separator: string;
}

type SeparatorClass = {
  new (separator?: string): SeparatorInstance;
};

// Initialize with placeholder functions that throw if called before loadInquirer()
const notLoadedError = (): never => {
  throw new Error('Inquirer not loaded. Call loadInquirer() first.');
};

export let select: SelectFunction = notLoadedError as unknown as SelectFunction;
export let confirm: ConfirmFunction =
  notLoadedError as unknown as ConfirmFunction;
export let input: InputFunction = notLoadedError as unknown as InputFunction;
export let checkbox: CheckboxFunction =
  notLoadedError as unknown as CheckboxFunction;
export let search: SearchFunction = notLoadedError as unknown as SearchFunction;
export let Separator: SeparatorClass = class {
  type = 'separator' as const;
  separator = '';
  constructor() {
    throw new Error('Inquirer not loaded. Call loadInquirer() first.');
  }
} as unknown as SeparatorClass;

export type { SeparatorClass, SeparatorInstance };

let loaded = false;

export async function loadInquirer(): Promise<void> {
  if (loaded) return;

  try {
    const inquirer = await import('@inquirer/prompts');
    select = inquirer.select as SelectFunction;
    confirm = inquirer.confirm as ConfirmFunction;
    input = inquirer.input as InputFunction;
    checkbox = inquirer.checkbox as CheckboxFunction;
    search = inquirer.search as SearchFunction;
    Separator = inquirer.Separator as SeparatorClass;
    loaded = true;
  } catch {
    console.error('\n  ❌ Missing dependency: @inquirer/prompts');
    console.error('  Please install it first:\n');
    console.error('    npm install @inquirer/prompts\n');
    process.exit(1);
  }
}

export function isInquirerLoaded(): boolean {
  return loaded;
}

/**
 * Select wrapper (alias for select)
 *
 * @example
 * const value = await selectWithCancel({ message: 'Choose:', choices });
 * // Use value directly
 */
export async function selectWithCancel<T>(config: SelectConfig<T>): Promise<T> {
  // Import inquirer functions dynamically
  const inquirer = await import('@inquirer/prompts');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await inquirer.select(config as any)) as T;
}

/**
 * Helper to format step indicator for menu messages
 * @example formatStep(1, 3, 'Select client') => '[Step 1/3] Select client'
 */
export function formatStep(
  current: number,
  total: number,
  message: string
): string {
  return `[Step ${current}/${total}] ${message}`;
}
