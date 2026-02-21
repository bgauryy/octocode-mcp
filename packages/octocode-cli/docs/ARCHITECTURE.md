# Octocode CLI Architecture

> Technical architecture and design patterns of the Octocode CLI.

## Overview

The Octocode CLI is an interactive installer and management tool for the Octocode MCP server. It provides both command-line and interactive menu-driven interfaces.

```
┌─────────────────────────────────────────────────────────────────┐
│                      OCTOCODE CLI                               │
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────┐             │
│  │   CLI Commands      │    │  Interactive Mode   │             │
│  │   (Non-interactive) │    │  (Menu-driven)      │             │
│  └─────────────────────┘    └─────────────────────┘             │
│            │                          │                         │
│            └──────────┬───────────────┘                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Features Layer                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │ Install  │ │  Auth    │ │  Skills  │ │   Sync   │    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                       │                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Utilities Layer                      │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │  Colors  │ │ Prompts  │ │MCP Config│ │   FS     │    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
packages/octocode-cli/
├── src/
│   ├── index.ts              # Main entry point
│   │
│   ├── cli/                  # CLI command handling
│   │   ├── index.ts          # CLI dispatcher
│   │   ├── commands.ts       # Command definitions
│   │   ├── parser.ts         # Argument parser
│   │   ├── help.ts           # Help text generation
│   │   └── types.ts          # CLI type definitions
│   │
│   ├── ui/                   # Interactive UI components
│   │   ├── menu.ts           # Main menu loop
│   │   ├── state.ts          # App state management
│   │   ├── header.ts         # Welcome/goodbye banners
│   │   ├── constants.ts      # UI constants
│   │   ├── install/          # Install flow UI
│   │   ├── config/           # Configuration UI
│   │   ├── skills-menu/      # Skills management UI
│   │   ├── external-mcp/     # External MCP installer
│   │   └── sync/             # Sync flow UI
│   │
│   ├── features/             # Core business logic
│   │   ├── install.ts        # Installation logic
│   │   ├── gh-auth.ts        # GitHub CLI auth
│   │   ├── github-oauth.ts   # OAuth authentication
│   │   ├── node-check.ts     # Node.js environment checks
│   │   └── sync.ts           # Config synchronization
│   │
│   ├── configs/              # Configuration data
│   │   ├── mcp-registry.ts   # MCP server registry
│   │   └── skills-marketplace.ts  # Skills marketplace
│   │
│   ├── utils/                # Utility functions
│   │   ├── colors.ts         # Terminal colors
│   │   ├── prompts.ts        # Inquirer wrapper
│   │   ├── spinner.ts        # Loading spinner
│   │   ├── mcp-config.ts     # MCP config read/write
│   │   ├── fs.ts             # File system utilities
│   │   ├── skills.ts         # Skills utilities
│   │   └── token-storage.ts  # Token management
│   │
│   └── types/                # Type definitions
│       └── index.ts          # Shared types
│
├── skills/                   # Bundled skill definitions
│   ├── octocode-research/
│   ├── octocode-implement/
│   ├── octocode-pr-review/
│   └── ...
│
├── tests/                    # Test files
├── docs/                     # Documentation
└── out/                      # Build output
```

---

## Core Components

### Entry Point (`src/index.ts`)

The main entry point handles dual-mode operation:

```typescript
async function main(): Promise<void> {
  // Try CLI mode first
  const handled = await runCLI();
  if (handled) {
    return;
  }
  // Fall back to interactive mode
  await runInteractiveMode();
}
```

**Responsibilities:**
- Signal handling (SIGINT, SIGTERM)
- Error boundary with graceful exit
- Mode selection (CLI vs Interactive)

---

### CLI Layer (`src/cli/`)

#### Command Dispatcher (`index.ts`)

```typescript
export async function runCLI(argv?: string[]): Promise<boolean> {
  const args = parseArgs(argv);
  
  // Handle global flags
  if (hasHelpFlag(args)) { /* ... */ }
  if (hasVersionFlag(args)) { /* ... */ }
  
  // No command = interactive mode
  if (!args.command) return false;
  
  // Execute command
  const command = findCommand(args.command);
  await command.handler(args);
  return true;
}
```

#### Command Definition Pattern (`commands.ts`)

```typescript
const installCommand: CLICommand = {
  name: 'install',
  aliases: ['i'],
  description: 'Install octocode-mcp for an IDE',
  usage: 'octocode install --ide <cursor|claude> --method <npx|direct>',
  options: [
    { name: 'ide', description: '...', hasValue: true },
    { name: 'method', short: 'm', hasValue: true, default: 'npx' },
    { name: 'force', short: 'f' },
  ],
  handler: async (args: ParsedArgs) => {
    // Command implementation
  },
};

// All commands exported as array
const commands: CLICommand[] = [
  installCommand,
  loginCommand,
  logoutCommand,
  authCommand,
  skillsCommand,
  tokenCommand,
  statusCommand,
  syncCommand,
];
```

#### Argument Parser (`parser.ts`)

Simple argument parser without external dependencies:

```typescript
interface ParsedArgs {
  command?: string;
  positional: string[];
  options: Record<string, string | boolean>;
  flags: Set<string>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  // Parse --option value, --flag, -short patterns
}
```

---

### UI Layer (`src/ui/`)

#### State Management (`state.ts`)

Centralized application state:

```typescript
export interface AppState {
  octocode: OctocodeState;
  skills: SkillsState;
  currentClient: MCPClient | null;
  githubAuth: OctocodeAuthStatus;
}

export async function getAppState(): Promise<AppState> {
  return {
    octocode: getOctocodeState(),
    skills: getSkillsState(),
    currentClient: detectCurrentClient(),
    githubAuth: await getAuthStatusAsync(),
  };
}
```

#### Menu Loop Pattern (`menu.ts`)

Standard menu loop with state refresh:

```typescript
export async function runMenuLoop(): Promise<void> {
  let firstRun = true;
  let running = true;
  
  while (running) {
    // Refresh state (with spinner on subsequent runs)
    let state = firstRun 
      ? await getAppState() 
      : await refreshWithSpinner();
    
    // Render and handle choice
    const choice = await showMainMenu(state);
    running = await handleMenuChoice(choice);
    
    firstRun = false;
  }
}
```

#### Step-Based Flow Pattern

For multi-step wizards with back navigation:

```typescript
type InstallStep = 'client' | 'localTools' | 'githubAuth' | 'confirm' | 'install' | 'done';

export async function runInstallFlow(): Promise<void> {
  const state: InstallFlowState = { /* initial state */ };
  let currentStep: InstallStep = 'client';
  
  while (currentStep !== 'done') {
    switch (currentStep) {
      case 'client': {
        const result = await selectClient();
        if (!result) return; // Back = exit flow
        state.client = result;
        currentStep = 'localTools';
        break;
      }
      case 'localTools': {
        const result = await promptLocalTools();
        if (result === null) {
          currentStep = 'client'; // Back
        } else {
          state.enableLocal = result;
          currentStep = 'githubAuth';
        }
        break;
      }
      // ... more steps
    }
  }
}
```

---

### Features Layer (`src/features/`)

#### Installation (`install.ts`)

```typescript
export function installOctocode(options: InstallOptions): InstallResult {
  // 1. Get config path for IDE
  const configPath = getMCPConfigPath(options.ide);
  
  // 2. Read existing config
  const existingConfig = readMCPConfig(configPath);
  
  // 3. Build octocode server config
  const serverConfig = buildOctocodeConfig(options);
  
  // 4. Merge and write config
  const newConfig = mergeConfig(existingConfig, serverConfig);
  writeMCPConfig(configPath, newConfig);
  
  return { success: true };
}
```

#### OAuth Authentication (`github-oauth.ts`)

```typescript
export async function login(hostname: string): Promise<LoginResult> {
  // 1. Generate device code
  const deviceCode = await requestDeviceCode();
  
  // 2. Show user code for authorization
  console.log(`Enter code: ${deviceCode.user_code}`);
  
  // 3. Poll for token
  const token = await pollForToken(deviceCode);
  
  // 4. Store securely (encrypted file on macOS)
  await storeToken(hostname, token);
  
  return { success: true };
}
```

---

### Utilities Layer (`src/utils/`)

#### Terminal Colors (`colors.ts`)

Zero-dependency color utilities:

```typescript
export type ColorName = 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'dim' | 'bold' | 'underscore';

export function c(color: ColorName, text: string): string {
  const codes: Record<ColorName, [number, number]> = {
    red: [31, 39],
    green: [32, 39],
    // ...
  };
  const [start, end] = codes[color];
  return `\x1b[${start}m${text}\x1b[${end}m`;
}
```

#### Prompts Wrapper (`prompts.ts`)

Lazy-loaded Inquirer wrapper:

```typescript
// Lazy loading to improve startup time
let select: SelectFunction;
let confirm: ConfirmFunction;
let input: InputFunction;
let loaded = false;

export async function loadInquirer(): Promise<void> {
  if (loaded) return;
  
  const inquirer = await import('@inquirer/prompts');
  select = inquirer.select;
  confirm = inquirer.confirm;
  input = inquirer.input;
  loaded = true;
}
```

#### MCP Config (`mcp-config.ts`)

MCP configuration file management:

```typescript
export interface MCPConfig {
  mcpServers?: Record<string, MCPServerConfig>;
}

export function readMCPConfig(path: string): MCPConfig | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function writeMCPConfig(path: string, config: MCPConfig): void {
  ensureDirectoryExists(dirname(path));
  writeFileSync(path, JSON.stringify(config, null, 2));
}
```

---

## Configuration Data

### MCP Registry (`src/configs/mcp-registry.ts`)

Registry of installable MCP servers:

```typescript
export interface MCPRegistryEntry {
  id: string;
  name: string;
  description: string;
  category: MCPCategory;
  tags: string[];
  command: string;
  args?: string[];
  env?: Record<string, { required: boolean; description: string }>;
  repository?: string;
  author?: string;
}

export const MCP_REGISTRY: MCPRegistryEntry[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'File system operations',
    category: 'productivity',
    tags: ['files', 'io'],
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
  },
  // ... more entries
];
```

### Skills Marketplace (`src/configs/skills-marketplace.ts`)

Available skills for installation:

```typescript
export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  author: string;
  repository: string;
  source: MarketplaceSource;
}

export const SKILLS_MARKETPLACE: MarketplaceSkill[] = [
  // Official Octocode skills
  // Community skills
];
```

---

## Design Patterns

### 1. Dual-Mode Operation

The CLI supports both non-interactive (flags) and interactive (menu) modes:

```
npx octocode                    # → Interactive mode
npx octocode install --ide X    # → CLI mode
```

### 2. State Machine for Flows

Multi-step flows use explicit state machines:

```typescript
type Step = 'a' | 'b' | 'c' | 'done';
let step: Step = 'a';

while (step !== 'done') {
  switch (step) {
    case 'a':
      // Handle step, set next step or go back
      break;
  }
}
```

### 3. Lazy Loading

Heavy dependencies loaded on-demand:

```typescript
// ❌ Slow startup
import inquirer from '@inquirer/prompts';

// ✅ Fast startup
let inquirer: typeof import('@inquirer/prompts');
async function loadInquirer() {
  if (!inquirer) {
    inquirer = await import('@inquirer/prompts');
  }
}
```

### 4. Zero-Dependency Core

Core utilities (colors, argument parsing) have no external dependencies:

- `colors.ts` - ANSI escape codes
- `parser.ts` - Simple regex-based parsing
- `spinner.ts` - Native terminal control

### 5. Platform Detection

Smart defaults based on environment:

```typescript
export function detectCurrentClient(): MCPClient | null {
  // Check TERM_PROGRAM, cursor-specific vars, etc.
  if (process.env.CURSOR_TRACE_ID) return 'cursor';
  if (process.env.TERM_PROGRAM === 'vscode') return 'vscode';
  return null;
}
```

---

## Data Flow

### Installation Flow

```
User Input → Validation → Config Building → File Writing
     │            │              │               │
     └── IDE ─────┴── Method ────┴── Options ────┴── mcpSettings.json
```

### Authentication Flow

```
Device Code Request → User Authorization → Token Polling → Secure Storage
         │                    │                  │              │
         └── GitHub API ──────┴── Browser ───────┴── Keychain ──┘
```

### Sync Flow

```
Read All Configs → Analyze Differences → Resolve Conflicts → Apply Changes
       │                   │                    │                │
       └── Per Client ─────┴── Diff Algorithm ──┴── User Input ──┘
```

---

## Testing Strategy

### Test Structure

```
tests/
├── cli/               # CLI command tests
├── features/          # Feature logic tests
├── ui/                # UI component tests
├── utils/             # Utility tests
├── configs/           # Configuration validation tests
└── setup.ts           # Test setup and mocks
```

### Test Patterns

```typescript
// Unit test example
describe('parseArgs', () => {
  it('parses command with options', () => {
    const result = parseArgs(['install', '--ide', 'cursor']);
    expect(result.command).toBe('install');
    expect(result.options.ide).toBe('cursor');
  });
});

// Integration test with mocks
describe('installOctocode', () => {
  it('creates config file', () => {
    vi.mock('fs', () => ({
      writeFileSync: vi.fn(),
    }));
    
    installOctocode({ ide: 'cursor', method: 'npx' });
    
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
```

---

## Build & Distribution

### Build Process

```bash
# TypeScript → JavaScript (ESM)
yarn build

# Output: out/octocode-cli.js (single bundle)
```

### Distribution

The CLI is distributed via npm:

```bash
# Install globally
npm install -g octocode

# Run via npx (recommended)
npx octocode
```

---

## See Also

- [CLI Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md)
- [Menu Flow](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/MENU_FLOW.md)
