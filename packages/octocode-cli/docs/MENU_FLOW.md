# Octocode CLI Menu Flow

> Understanding the interactive menu system and navigation flows.

## Overview

The Octocode CLI provides both command-line and interactive modes. When run without arguments (`npx octocode`), it launches an interactive menu-driven interface.

```
┌─────────────────────────────────────────────────────────────┐
│                    OCTOCODE INTERACTIVE MODE                │
│                                                             │
│  User runs: npx octocode                                    │
│                    │                                        │
│                    ▼                                        │
│            ┌──────────────┐                                 │
│            │  Main Menu   │ ◄── Entry Point                 │
│            └──────────────┘                                 │
│                    │                                        │
│     ┌──────────────┼──────────────┬──────────────┐          │
│     ▼              ▼              ▼              ▼          │
│ ┌────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐      │
│ │Octocode│  │  Skills  │  │   Auth   │  │System MCP  │      │
│ │ Menu   │  │   Menu   │  │   Menu   │  │   Menu     │      │
│ └────────┘  └──────────┘  └──────────┘  └────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Entry Point Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      src/index.ts                           │
│                                                             │
│  main()                                                     │
│    │                                                        │
│    ├──► runCLI()                                            │
│    │      │                                                 │
│    │      ├── Has command? ──► Execute command handler      │
│    │      │                                                 │
│    │      └── No command? ──► Return false                  │
│    │                                                        │
│    └──► runInteractiveMode()  (if CLI returns false)        │
│           │                                                 │
│           ├── Check environment (Node.js, npm)              │
│           ├── Print welcome banner                          │
│           └── runMenuLoop()  ──► Interactive Menu           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Files:**
- `src/index.ts` - Main entry point
- `src/cli/index.ts` - CLI command dispatcher
- `src/ui/menu.ts` - Interactive menu loop

---

## Main Menu

The main menu is the central hub of the interactive interface.

```
┌─────────────────────────────────────────────────────────────┐
│                       MAIN MENU                             │
│                                                             │
│  Status: [Environment Status Line]                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  🐙 Octocode MCP                                      │  │
│  │     ├── Install / Add to IDE                          │  │
│  │     ├── Configure                                     │  │
│  │     └── Install All Skills (if available)             │  │
│  │                                                       │  │
│  │  🧠 Manage System Skills                              │  │
│  │     └── Install, manage, browse skills                │  │
│  │                                                       │  │
│  │  🔐 GitHub Authentication                             │  │
│  │     └── Login / Logout / Status                       │  │
│  │                                                       │  │
│  │  ⚡ Manage System MCP                                 │  │
│  │     └── Sync, inspect, marketplace                    │  │
│  │                                                       │  │
│  │  ─────────────────────────────────                    │  │
│  │  Exit                                                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Menu Choices (`MenuChoice` type):**

| Choice | Handler | Description |
|--------|---------|-------------|
| `octocode` | `runOctocodeFlow()` | Octocode installation & configuration |
| `skills` | `runSkillsMenu()` | Skills management |
| `auth` | `runAuthFlow()` | GitHub authentication |
| `mcp-config` | `runMCPConfigFlow()` | MCP configuration management |
| `exit` | `printGoodbye()` | Exit application |

---

## Octocode Submenu

Manages Octocode MCP installation and configuration.

```
┌─────────────────────────────────────────────────────────────┐
│                    OCTOCODE SUBMENU                         │
│                                                             │
│  Installed on: [List of configured IDEs]                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  📦 Install / Add Octocode                            │  │
│  │     └── Setup for Cursor, Claude, Windsurf...         │  │
│  │                                                       │  │
│  │  ⚙️  Configure Octocode (if installed)                │  │
│  │     └── Server options & preferences                  │  │
│  │                                                       │  │
│  │  🧠 Install All Skills (if not all installed)         │  │
│  │     └── One-click install of all Octocode skills      │  │
│  │                                                       │  │
│  │  ─────────────────────────────────                    │  │
│  │  ← Back to main menu                                  │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Flow: `runOctocodeFlow()` → `showOctocodeMenu()`**

| Choice | Action |
|--------|--------|
| `install` | `runInstallFlow()` - Multi-step installation wizard |
| `configure` | `runConfigOptionsFlow()` - Edit server configuration |
| `install-skills` | `installAllOctocodeSkills()` - Batch skill installation |
| `back` | Return to main menu |

---

## Install Flow

Multi-step wizard with back navigation support.

```
┌─────────────────────────────────────────────────────────────┐
│                      INSTALL FLOW                           │
│                                                             │
│   Step 1          Step 2          Step 3          Step 4    │
│  ┌────────┐      ┌────────┐      ┌────────┐      ┌────────┐ │
│  │ Select │ ──►  │ Local  │ ──►  │ GitHub │ ──►  │Confirm │ │
│  │ Client │      │ Tools  │      │  Auth  │      │Install │ │
│  └────────┘      └────────┘      └────────┘      └────────┘ │
│       │               │               │               │     │
│       ◄───────────────┴───────────────┴───────────────┘     │
│                    (Back navigation)                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  InstallFlowState:                                  │    │
│  │    - client: MCPClient | null                       │    │
│  │    - customPath?: string                            │    │
│  │    - hasExistingOctocode: boolean                   │    │
│  │    - enableLocal: boolean                           │    │
│  │    - githubAuth: { method, token?, hostname? }      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Step Details:**

| Step | Name | Description |
|------|------|-------------|
| 1 | `client` | Select target IDE/client (Cursor, Claude, etc.) |
| 2 | `updateConfirm` | If exists: confirm update or go back |
| 3 | `localTools` | Enable local codebase tools? |
| 4 | `githubAuth` | Configure GitHub authentication method |
| 5 | `confirm` | Review and confirm installation |
| 6 | `install` | Perform actual installation |

---

## Skills Menu

Manages AI assistant skills (prompts for Claude Code).

```
┌─────────────────────────────────────────────────────────────┐
│                      SKILLS MENU                            │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  🧠 Octocode Official (X available)                   │  │
│  │     └── Install official Octocode skills              │  │
│  │                                                       │  │
│  │  🏪 Skills Marketplace                                │  │
│  │     └── Browse & install community skills             │  │
│  │                                                       │  │
│  │  📋 Manage Installed (X installed)                    │  │
│  │     └── View, update, or remove skills                │  │
│  │                                                       │  │
│  │  📍 Change Skills Path                                │  │
│  │     └── Set custom installation directory             │  │
│  │                                                       │  │
│  │  📊 View Status                                       │  │
│  │     └── Show skill installation status                │  │
│  │                                                       │  │
│  │  📖 What are Skills?                                  │  │
│  │     └── Learn about AI skills                         │  │
│  │                                                       │  │
│  │  ─────────────────────────────────                    │  │
│  │  ← Back to main menu                                  │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Skills Menu Flow:**

```
runSkillsMenu()
    │
    ├── 'octocode-official' ──► runOctocodeOfficialFlow()
    │                              │
    │                              ├── Install All
    │                              └── Browse individually
    │
    ├── 'marketplace' ──► runMarketplaceFlow()
    │                        │
    │                        ├── Select source (Official/Community)
    │                        └── Browse & install skills
    │
    ├── 'manage' ──► manageInstalledSkills()
    │                  │
    │                  ├── Select installed skill
    │                  └── View details / Remove / Open location
    │
    ├── 'change-path' ──► Prompt for new path
    │
    ├── 'view' ──► showSkillsStatus()
    │
    ├── 'learn' ──► Open documentation URL
    │
    └── 'back' ──► Return to main menu
```

---

## Auth Menu

Manages GitHub authentication.

```
┌─────────────────────────────────────────────────────────────┐
│                       AUTH MENU                             │
│                                                             │
│  Current Status: [Auth status display]                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  When NOT authenticated:                              │  │
│  │    🔐 Login to GitHub                                 │  │
│  │    📖 gh CLI Guidance                                 │  │
│  │                                                       │  │
│  │  When authenticated:                                  │  │
│  │    🔓 Logout from GitHub                              │  │
│  │    🔓 Logout from gh CLI (if available)               │  │
│  │                                                       │  │
│  │  ─────────────────────────────────                    │  │
│  │  ← Back to main menu                                  │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Auth Flow:**

| Choice | Action |
|--------|--------|
| `login` | `runLoginFlow()` - OAuth authentication |
| `logout` | `runLogoutFlow()` - Remove Octocode credentials |
| `gh-logout` | `runGitHubAuthLogout()` - Remove gh CLI credentials |
| `gh-guidance` | `showGhCliGuidance()` - Help for gh CLI setup |
| `back` | Return to main menu |

---

## MCP Config Menu

Manages MCP server configurations across all clients.

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP CONFIG MENU                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  🔍 Inspect Configurations                            │  │
│  │     └── View MCP servers per client                   │  │
│  │                                                       │  │
│  │  🔄 Sync Configurations                               │  │
│  │     └── Synchronize across clients                    │  │
│  │                                                       │  │
│  │  🏪 MCP Marketplace                                   │  │
│  │     └── Browse & install external MCPs                │  │
│  │                                                       │  │
│  │  ─────────────────────────────────                    │  │
│  │  ← Back to main menu                                  │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**MCP Config Flow:**

```
runMCPConfigFlow()
    │
    ├── 'inspect' ──► runInspectFlow()
    │                   │
    │                   ├── Select client
    │                   └── View/Remove MCP servers
    │
    ├── 'sync' ──► runSyncFlow()
    │               │
    │               ├── Analyze differences
    │               ├── Resolve conflicts
    │               └── Apply sync
    │
    ├── 'marketplace' ──► runExternalMCPFlow()
    │                       │
    │                       ├── Select target client
    │                       ├── Select browse mode
    │                       ├── Select MCP to install
    │                       ├── Configure env vars
    │                       └── Confirm & install
    │
    └── 'back' ──► Return to main menu
```

---

## External MCP Install Flow

Multi-step wizard for installing external MCP servers.

```
┌─────────────────────────────────────────────────────────────┐
│                  EXTERNAL MCP FLOW                          │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Step 1   │  │ Step 2   │  │ Step 3   │  │ Step 4   │     │
│  │ Select   │  │ Browse   │  │ Select   │  │ View     │     │
│  │ Client   │─►│ Mode     │─►│ MCP      │─►│ Details  │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│       │                                          │          │
│       │        ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│       │        │ Step 5   │  │ Step 6   │  │ Step 7   │     │
│       └───────►│ Env Vars │─►│ Confirm  │─►│ Install  │     │
│                └──────────┘  └──────────┘  └──────────┘     │
│                                                             │
│  Browse Modes:                                              │
│    • By Category (Productivity, DevOps, etc.)               │
│    • By Tag (search, code, git, etc.)                       │
│    • Popular MCPs                                           │
│    • All MCPs (searchable list)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## State Management

### Application State

```typescript
interface AppState {
  octocode: {
    isInstalled: boolean;
    installedClients: ClientInstallStatus[];
    availableClients: ClientInstallStatus[];
    hasMoreToInstall: boolean;
  };
  skills: {
    hasSkills: boolean;
    allInstalled: boolean;
    skills: SkillStatus[];
  };
  currentClient: MCPClient | null;
  githubAuth: OctocodeAuthStatus;
}
```

### State Refresh

The menu system refreshes state on each iteration:
1. **First run:** State fetched without loading indicator
2. **Subsequent runs:** Spinner shown during state refresh
3. **Screen cleared** and welcome banner reprinted

---

## Navigation Patterns

### Back Navigation

All submenus support back navigation:
- Pressing `← Back` returns to parent menu
- Install flow supports step-by-step back navigation
- No data loss when navigating back

### Menu Loops

```typescript
// Standard menu loop pattern
let inMenu = true;
while (inMenu) {
  const choice = await showMenu();
  switch (choice) {
    case 'action1':
      await doAction1();
      break;
    case 'back':
    default:
      inMenu = false;
      break;
  }
}
```

### Exit Handling

- **SIGINT (Ctrl+C):** Graceful shutdown with cleanup
- **SIGTERM:** Graceful shutdown with cleanup
- **Menu Exit:** `printGoodbye()` with helpful tips

---

## File Structure

```
src/ui/
├── menu.ts                    # Main menu and orchestration
├── state.ts                   # Application state management
├── header.ts                  # Welcome/goodbye banners
├── constants.ts               # UI constants and labels
├── gh-guidance.ts             # GitHub CLI guidance
│
├── install/
│   ├── index.ts               # Install module exports
│   ├── flow.ts                # Install flow wizard
│   ├── prompts.ts             # Install prompt components
│   ├── display.ts             # Display helpers
│   └── environment.ts         # Environment detection
│
├── config/
│   ├── index.ts               # Configuration flow
│   └── inspect-flow.ts        # Inspect configurations
│
├── skills-menu/
│   ├── index.ts               # Skills menu flow
│   └── marketplace.ts         # Skills marketplace
│
├── external-mcp/
│   ├── index.ts               # External MCP exports
│   ├── flow.ts                # External MCP install flow
│   ├── prompts.ts             # MCP selection prompts
│   └── display.ts             # MCP display helpers
│
└── sync/
    ├── index.ts               # Sync module exports
    └── flow.ts                # Sync flow with conflict resolution
```

---

## See Also

- [CLI Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md)
- [Architecture Overview](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/ARCHITECTURE.md)
