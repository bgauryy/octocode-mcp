#!/usr/bin/env node
import fs from "node:fs";
import os, { homedir } from "node:os";
import path from "node:path";
import { spawnSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const colors = {
  reset: "\x1B[0m",
  bright: "\x1B[1m",
  dim: "\x1B[2m",
  underscore: "\x1B[4m",
  red: "\x1B[31m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  blue: "\x1B[34m",
  magenta: "\x1B[35m",
  cyan: "\x1B[36m",
  white: "\x1B[37m",
  bgRed: "\x1B[41m",
  bgGreen: "\x1B[42m",
  bgYellow: "\x1B[43m",
  bgBlue: "\x1B[44m",
  bgMagenta: "\x1B[45m"
};
const c = (color, text) => `${colors[color]}${text}${colors.reset}`;
const bold = (text) => c("bright", text);
const dim = (text) => c("dim", text);
const isWindows = os.platform() === "win32";
const isMac = os.platform() === "darwin";
os.platform() === "linux";
const HOME = os.homedir();
function getAppDataPath() {
  if (isWindows) {
    return process.env.APPDATA || path.join(HOME, "AppData", "Roaming");
  }
  return HOME;
}
function clearScreen() {
  const clearSequence = "\x1B[2J\x1B[3J\x1B[H";
  process.stdout.write(clearSequence);
}
function openFile(filePath, editor) {
  try {
    let command;
    let args;
    if (editor) {
      command = editor;
      args = [filePath];
    } else if (isMac) {
      command = "open";
      args = [filePath];
    } else if (isWindows) {
      command = "cmd";
      args = ["/c", "start", '""', filePath];
    } else {
      command = "xdg-open";
      args = [filePath];
    }
    const result = spawnSync(command, args, {
      stdio: "ignore",
      shell: isWindows && !editor
    });
    return result.status === 0;
  } catch {
    return false;
  }
}
function openInEditor(filePath, ide) {
  switch (ide) {
    case "cursor":
      return openFile(filePath, "cursor");
    case "vscode":
      return openFile(filePath, "code");
    case "default":
    default:
      return openFile(filePath);
  }
}
const notLoadedError = () => {
  throw new Error("Inquirer not loaded. Call loadInquirer() first.");
};
let select = notLoadedError;
let confirm = notLoadedError;
let input = notLoadedError;
let checkbox = notLoadedError;
let Separator = class {
  type = "separator";
  separator = "";
  constructor() {
    throw new Error("Inquirer not loaded. Call loadInquirer() first.");
  }
};
let loaded = false;
async function loadInquirer() {
  if (loaded) return;
  try {
    const inquirer = await import("@inquirer/prompts");
    select = inquirer.select;
    confirm = inquirer.confirm;
    input = inquirer.input;
    checkbox = inquirer.checkbox;
    Separator = inquirer.Separator;
    loaded = true;
  } catch {
    console.error("\n  ❌ Missing dependency: @inquirer/prompts");
    console.error("  Please install it first:\n");
    console.error("    npm install @inquirer/prompts\n");
    process.exit(1);
  }
}
const prompts = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  get Separator() {
    return Separator;
  },
  get checkbox() {
    return checkbox;
  },
  get confirm() {
    return confirm;
  },
  get input() {
    return input;
  },
  loadInquirer,
  get select() {
    return select;
  }
}, Symbol.toStringTag, { value: "Module" }));
function runCommand(command, args = []) {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      timeout: 3e4
      // 30s timeout
    });
    return {
      success: result.status === 0,
      stdout: result.stdout?.trim() || "",
      stderr: result.stderr?.trim() || "",
      exitCode: result.status
    };
  } catch (error) {
    return {
      success: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : "Unknown error",
      exitCode: null
    };
  }
}
function commandExists(command) {
  const checkCommand = process.platform === "win32" ? "where" : "which";
  const result = runCommand(checkCommand, [command]);
  return result.success;
}
function getAppContext() {
  return {
    cwd: getShortCwd(),
    ide: detectIDE(),
    git: detectGit()
  };
}
function getShortCwd() {
  const cwd = process.cwd();
  const home = homedir();
  if (cwd.startsWith(home)) {
    return "~" + cwd.slice(home.length);
  }
  return cwd;
}
function detectIDE() {
  const env = process.env;
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID) {
    return "Cursor";
  }
  if (env.TERM_PROGRAM === "vscode" || env.VSCODE_PID) {
    return "VS Code";
  }
  if (env.TERM_PROGRAM === "Apple_Terminal") {
    return "Terminal";
  }
  return "Terminal";
}
function detectGit() {
  const root = runCommand("git", ["rev-parse", "--show-toplevel"]);
  if (!root.success) return void 0;
  const branch = runCommand("git", ["branch", "--show-current"]);
  return {
    root: root.stdout.split("/").pop() || "repo",
    // Just the repo name
    branch: branch.success ? branch.stdout : "HEAD"
  };
}
function printLogo() {
  const logo = [
    "        ▄▄██████▄▄",
    "      ▄██████████████▄",
    "     ▐████████████████▌",
    "     ▐██▀  ▀████▀  ▀██▌",
    "     ▐██  ▄ ████ ▄  ██▌",
    "     ▐████▄▄▀▀▀▀▄▄████▌",
    "      ▀██████████████▀",
    "    ▄▄▄████▀▀  ▀▀████▄▄▄",
    " ▄████▀▀▄▄▄██████▄▄▄▀▀████▄",
    "▐██▌  ▄██▀▀      ▀▀██▄  ▐██▌",
    " ▀▀  ▐██▌          ▐██▌  ▀▀",
    "      ▀▀            ▀▀"
  ];
  for (const line of logo) {
    console.log(c("magenta", "  " + line));
  }
}
function printTitle() {
  const title = [
    " ██████╗  ██████╗████████╗ ██████╗  ██████╗ ██████╗ ██████╗ ███████╗",
    "██╔═══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝",
    "██║   ██║██║        ██║   ██║   ██║██║     ██║   ██║██║  ██║█████╗  ",
    "██║   ██║██║        ██║   ██║   ██║██║     ██║   ██║██║  ██║██╔══╝  ",
    "╚██████╔╝╚██████╗   ██║   ╚██████╔╝╚██████╗╚██████╔╝██████╔╝███████╗",
    " ╚═════╝  ╚═════╝   ╚═╝    ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝"
  ];
  for (const line of title) {
    console.log(c("magenta", " " + line));
  }
}
function printWelcome() {
  console.log();
  printLogo();
  console.log();
  printTitle();
  console.log();
  console.log();
  try {
    const ctx = getAppContext();
    console.log(`  ${dim("📂")} ${ctx.cwd}`);
    console.log();
    let envLine = `  ${dim("💻")} ${bold(ctx.ide)}`;
    if (ctx.git) {
      envLine += `   ${dim("🐙")} ${ctx.git.root} ${dim("(")}${ctx.git.branch}${dim(")")}`;
    }
    console.log(envLine);
    console.log();
  } catch {
    console.log();
  }
}
function printGoodbye() {
  console.log();
  console.log(c("magenta", "─".repeat(66)));
  console.log(c("magenta", "  Thanks for using Octocode CLI! 👋"));
  console.log(c("magenta", `  🔍🐙 ${c("underscore", "https://octocode.ai")}`));
  console.log(c("magenta", "─".repeat(66)));
  console.log();
}
const activeSpinners = /* @__PURE__ */ new Set();
function ensureCursorRestored() {
  process.stdout.write("\x1B[?25h");
}
let cleanupRegistered = false;
function registerCleanupHandlers() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  process.on("exit", ensureCursorRestored);
  process.on("SIGINT", () => {
    ensureCursorRestored();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    ensureCursorRestored();
    process.exit(0);
  });
  process.on("uncaughtException", (err) => {
    ensureCursorRestored();
    console.error("Uncaught exception:", err);
    process.exit(1);
  });
}
class Spinner {
  text;
  frames;
  i;
  timer;
  constructor(text = "") {
    this.text = text;
    this.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    this.i = 0;
    this.timer = null;
  }
  start(text) {
    if (text) this.text = text;
    registerCleanupHandlers();
    activeSpinners.add(this);
    process.stdout.write("\x1B[?25l");
    this.timer = setInterval(() => {
      const frame = this.frames[this.i++ % this.frames.length];
      process.stdout.write(`\r${c("cyan", frame)} ${this.text}`);
    }, 80);
    return this;
  }
  stop(symbol = "✓", color = "green") {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    activeSpinners.delete(this);
    process.stdout.write(`\r\x1B[2K${c(color, symbol)} ${this.text}
`);
    process.stdout.write("\x1B[?25h");
    return this;
  }
  succeed(text) {
    if (text) this.text = text;
    return this.stop("✓", "green");
  }
  fail(text) {
    if (text) this.text = text;
    return this.stop("✗", "red");
  }
  info(text) {
    if (text) this.text = text;
    return this.stop("ℹ", "blue");
  }
  warn(text) {
    if (text) this.text = text;
    return this.stop("⚠", "yellow");
  }
}
const IDE_INFO = {
  cursor: {
    name: "Cursor",
    description: "AI-first code editor",
    url: "https://cursor.sh"
  },
  claude: {
    name: "Claude Desktop",
    description: "Anthropic's Claude desktop app",
    url: "https://claude.ai/download"
  }
};
const INSTALL_METHOD_INFO = {
  direct: {
    name: "Direct (curl)",
    description: "Download and run directly from octocodeai.com",
    pros: ["Always latest version", "No npm required"],
    cons: ["Requires curl (or PowerShell on Windows)", "Slower startup"]
  },
  npx: {
    name: "NPX",
    description: "Run via npx from npm registry",
    pros: ["Standard npm workflow", "Faster after first run (cached)"],
    cons: ["Requires Node.js/npm"]
  }
};
function dirExists(dirPath) {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
function readFileContent(filePath) {
  try {
    if (fileExists(filePath)) {
      return fs.readFileSync(filePath, "utf8");
    }
  } catch {
  }
  return null;
}
function writeFileContent(filePath, content) {
  try {
    const dir = path.dirname(filePath);
    if (!dirExists(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}
function backupFile(filePath) {
  if (!fileExists(filePath)) {
    return null;
  }
  try {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const backupPath = `${filePath}.backup-${timestamp}`;
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}
function readJsonFile(filePath) {
  const content = readFileContent(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function writeJsonFile(filePath, data) {
  try {
    const content = JSON.stringify(data, null, 2) + "\n";
    return writeFileContent(filePath, content);
  } catch {
    return false;
  }
}
function copyDirectory(src, dest) {
  try {
    if (!dirExists(src)) {
      return false;
    }
    if (!dirExists(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
    return true;
  } catch {
    return false;
  }
}
function listSubdirectories(dirPath) {
  try {
    if (!dirExists(dirPath)) {
      return [];
    }
    return fs.readdirSync(dirPath, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}
function getAppSupportDir() {
  if (isWindows) {
    return getAppDataPath();
  }
  if (isMac) {
    return path.join(HOME, "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME || path.join(HOME, ".config");
}
function getVSCodeGlobalStoragePath() {
  const appSupport = getAppSupportDir();
  if (isWindows) {
    return path.join(appSupport, "Code", "User", "globalStorage");
  }
  if (isMac) {
    return path.join(appSupport, "Code", "User", "globalStorage");
  }
  return path.join(appSupport, "Code", "User", "globalStorage");
}
const MCP_CLIENTS = {
  cursor: {
    id: "cursor",
    name: "Cursor",
    description: "AI-first code editor",
    category: "ide",
    url: "https://cursor.sh",
    envVars: ["CURSOR_AGENT", "CURSOR_TRACE_ID", "CURSOR_SESSION_ID", "CURSOR"]
  },
  "claude-desktop": {
    id: "claude-desktop",
    name: "Claude Desktop",
    description: "Anthropic's desktop app",
    category: "desktop",
    url: "https://claude.ai/download"
  },
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    description: "Claude CLI for terminal",
    category: "cli",
    url: "https://docs.anthropic.com/claude-code",
    envVars: ["CLAUDE_CODE"]
  },
  "vscode-cline": {
    id: "vscode-cline",
    name: "Cline (VS Code)",
    description: "AI coding assistant extension",
    category: "extension",
    url: "https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev",
    envVars: ["VSCODE_PID", "TERM_PROGRAM"]
  },
  "vscode-roo": {
    id: "vscode-roo",
    name: "Roo-Cline (VS Code)",
    description: "Roo AI coding extension",
    category: "extension",
    envVars: ["VSCODE_PID"]
  },
  windsurf: {
    id: "windsurf",
    name: "Windsurf",
    description: "Codeium AI IDE",
    category: "ide",
    url: "https://codeium.com/windsurf",
    envVars: ["WINDSURF_SESSION"]
  },
  trae: {
    id: "trae",
    name: "Trae",
    description: "Adaptive AI IDE",
    category: "ide",
    url: "https://trae.ai"
  },
  antigravity: {
    id: "antigravity",
    name: "Antigravity",
    description: "Gemini-powered AI IDE",
    category: "ide"
  },
  "vscode-continue": {
    id: "vscode-continue",
    name: "Continue (VS Code)",
    description: "Open-source AI assistant",
    category: "extension",
    url: "https://continue.dev",
    envVars: ["VSCODE_PID"]
  },
  zed: {
    id: "zed",
    name: "Zed",
    description: "High-performance code editor",
    category: "ide",
    url: "https://zed.dev",
    envVars: ["ZED_TERM"]
  },
  custom: {
    id: "custom",
    name: "Custom Path",
    description: "Specify your own MCP config path",
    category: "cli"
  }
};
function getMCPConfigPath(client, customPath) {
  if (client === "custom" && customPath) {
    return customPath;
  }
  const appSupport = getAppSupportDir();
  const vsCodeStorage = getVSCodeGlobalStoragePath();
  switch (client) {
    case "cursor":
      if (isWindows) {
        return path.join(getAppDataPath(), "Cursor", "mcp.json");
      }
      return path.join(HOME, ".cursor", "mcp.json");
    case "claude-desktop":
      if (isWindows) {
        return path.join(appSupport, "Claude", "claude_desktop_config.json");
      }
      if (isMac) {
        return path.join(appSupport, "Claude", "claude_desktop_config.json");
      }
      return path.join(appSupport, "claude", "claude_desktop_config.json");
    case "claude-code":
      return path.join(HOME, ".claude.json");
    case "vscode-cline":
      return path.join(
        vsCodeStorage,
        "saoudrizwan.claude-dev",
        "settings",
        "cline_mcp_settings.json"
      );
    case "vscode-roo":
      return path.join(
        vsCodeStorage,
        "rooveterinaryinc.roo-cline",
        "settings",
        "cline_mcp_settings.json"
      );
    case "windsurf":
      return path.join(HOME, ".codeium", "windsurf", "mcp_config.json");
    case "trae":
      if (isWindows) {
        return path.join(getAppDataPath(), "Trae", "mcp.json");
      }
      if (isMac) {
        return path.join(appSupport, "Trae", "mcp.json");
      }
      return path.join(appSupport, "Trae", "mcp.json");
    case "antigravity":
      return path.join(HOME, ".gemini", "antigravity", "mcp_config.json");
    case "vscode-continue":
      return path.join(HOME, ".continue", "config.json");
    case "zed":
      if (isWindows) {
        return path.join(getAppDataPath(), "Zed", "settings.json");
      }
      if (isMac) {
        return path.join(HOME, ".config", "zed", "settings.json");
      }
      return path.join(appSupport, "zed", "settings.json");
    case "custom":
      throw new Error("Custom path requires customPath parameter");
    default:
      throw new Error(`Unknown MCP client: ${client}`);
  }
}
function clientConfigExists(client, customPath) {
  try {
    const configPath = getMCPConfigPath(client, customPath);
    const configDir = path.dirname(configPath);
    return dirExists(configDir);
  } catch {
    return false;
  }
}
function configFileExists(client, customPath) {
  try {
    const configPath = getMCPConfigPath(client, customPath);
    return fileExists(configPath);
  } catch {
    return false;
  }
}
function detectCurrentClient() {
  const env = process.env;
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID || env.CURSOR_SESSION_ID || env.CURSOR) {
    return "cursor";
  }
  if (env.WINDSURF_SESSION) {
    return "windsurf";
  }
  if (env.CLAUDE_CODE) {
    return "claude-code";
  }
  if (env.ZED_TERM || env.ZED) {
    return "zed";
  }
  if (env.VSCODE_PID || env.TERM_PROGRAM === "vscode") {
    return "vscode-cline";
  }
  return null;
}
function ideConfigExists(ide) {
  const clientMap = {
    cursor: "cursor",
    claude: "claude-desktop"
  };
  return clientConfigExists(clientMap[ide]);
}
function readMCPConfig(configPath) {
  if (!fileExists(configPath)) {
    return { mcpServers: {} };
  }
  return readJsonFile(configPath);
}
function writeMCPConfig(configPath, config, createBackup = true) {
  try {
    let backupPath;
    if (createBackup && fileExists(configPath)) {
      const backup = backupFile(configPath);
      if (backup) {
        backupPath = backup;
      }
    }
    const dir = path.dirname(configPath);
    if (!dirExists(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const success = writeJsonFile(configPath, config);
    if (!success) {
      return { success: false, error: "Failed to write config file" };
    }
    return { success: true, backupPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
function getOctocodeServerConfig(method, envOptions) {
  let config;
  switch (method) {
    case "direct":
      config = {
        command: "bash",
        args: [
          "-c",
          "curl -sL https://octocodeai.com/octocode/latest/index.js -o /tmp/index.js && node /tmp/index.js"
        ]
      };
      break;
    case "npx":
      config = {
        command: "npx",
        args: ["octocode-mcp@latest"]
      };
      break;
    default:
      throw new Error(`Unknown install method: ${method}`);
  }
  if (envOptions) {
    const env = {};
    if (envOptions.enableLocal) {
      env.ENABLE_LOCAL = "true";
    }
    if (envOptions.githubToken) {
      env.GITHUB_TOKEN = envOptions.githubToken;
    }
    if (Object.keys(env).length > 0) {
      config.env = env;
    }
  }
  return config;
}
function getOctocodeServerConfigWindows(method, envOptions) {
  if (method === "direct") {
    const config = {
      command: "powershell",
      args: [
        "-Command",
        "Invoke-WebRequest -Uri 'https://octocodeai.com/octocode/latest/index.js' -OutFile $env:TEMP\\index.js; node $env:TEMP\\index.js"
      ]
    };
    if (envOptions) {
      const env = {};
      if (envOptions.enableLocal) {
        env.ENABLE_LOCAL = "true";
      }
      if (envOptions.githubToken) {
        env.GITHUB_TOKEN = envOptions.githubToken;
      }
      if (Object.keys(env).length > 0) {
        config.env = env;
      }
    }
    return config;
  }
  return getOctocodeServerConfig(method, envOptions);
}
function mergeOctocodeConfig(config, method, envOptions) {
  const serverConfig = isWindows ? getOctocodeServerConfigWindows(method, envOptions) : getOctocodeServerConfig(method, envOptions);
  return {
    ...config,
    mcpServers: {
      ...config.mcpServers,
      octocode: serverConfig
    }
  };
}
function isOctocodeConfigured(config) {
  return Boolean(config.mcpServers?.octocode);
}
function getConfiguredMethod(config) {
  const octocode = config.mcpServers?.octocode;
  if (!octocode) return null;
  if (octocode.command === "npx") return "npx";
  if (octocode.command === "bash" || octocode.command === "powershell") {
    return "direct";
  }
  return null;
}
function getClientInstallStatus(client, customPath) {
  const configPath = getMCPConfigPath(client, customPath);
  const configExists = configFileExists(client, customPath);
  let octocodeInstalled = false;
  let method = null;
  if (configExists) {
    const config = readMCPConfig(configPath);
    if (config) {
      octocodeInstalled = isOctocodeConfigured(config);
      method = getConfiguredMethod(config);
    }
  }
  return {
    client,
    configExists,
    octocodeInstalled,
    method,
    configPath
  };
}
function getAllClientInstallStatus() {
  const clients = [
    "cursor",
    "claude-desktop",
    "claude-code",
    "vscode-cline",
    "vscode-roo",
    "vscode-continue",
    "windsurf",
    "zed"
  ];
  return clients.map((client) => getClientInstallStatus(client));
}
function getClientStatusIndicator(status) {
  if (status.octocodeInstalled) {
    return c("green", "✓ Installed");
  }
  if (status.configExists) {
    return c("blue", "○ Ready");
  }
  if (clientConfigExists(status.client)) {
    return c("dim", "○ Available");
  }
  return c("dim", "○ Not found");
}
function getAllClientsWithStatus() {
  const clientOrder = [
    "cursor",
    "claude-desktop",
    "claude-code",
    "windsurf",
    "trae",
    "antigravity",
    "zed",
    "vscode-cline",
    "vscode-roo",
    "vscode-continue"
  ];
  return clientOrder.map((clientId) => ({
    clientId,
    status: getClientInstallStatus(clientId),
    isAvailable: clientConfigExists(clientId)
  }));
}
async function selectMCPClient() {
  const currentClient = detectCurrentClient();
  const allClients = getAllClientsWithStatus();
  const installedClients = allClients.filter((c2) => c2.status.octocodeInstalled);
  const availableClients = allClients.filter(
    (c2) => c2.isAvailable && !c2.status.octocodeInstalled
  );
  if (installedClients.length === 0) {
    return await promptNoConfigurationsFound(availableClients, currentClient);
  }
  return await promptExistingConfigurations(
    installedClients,
    availableClients,
    currentClient
  );
}
async function promptNoConfigurationsFound(availableClients, currentClient) {
  console.log();
  console.log(c("yellow", "  ┌" + "─".repeat(60) + "┐"));
  console.log(
    c("yellow", "  │ ") + `${c("yellow", "ℹ")} No octocode configurations found` + " ".repeat(24) + c("yellow", "│")
  );
  console.log(c("yellow", "  └" + "─".repeat(60) + "┘"));
  console.log();
  console.log(`  ${dim("Octocode is not configured in any MCP client yet.")}`);
  console.log();
  if (availableClients.length === 0) {
    console.log(
      `  ${c("red", "✗")} ${dim("No MCP clients detected on this system.")}`
    );
    console.log();
    console.log(`  ${dim("Supported clients:")}`);
    console.log(`    ${dim("• Cursor, Claude Desktop, Claude Code")}`);
    console.log(`    ${dim("• Windsurf, Zed, VS Code (Cline/Roo/Continue)")}`);
    console.log();
    console.log(`  ${dim("Install a supported client and try again,")}`);
    console.log(`  ${dim('or use "Custom Path" to specify a config file.')}`);
    console.log();
    const choices2 = [
      {
        name: `${c("cyan", "⚙")} Custom Path - ${dim("Specify your own MCP config path")}`,
        value: "custom"
      },
      new Separator(),
      {
        name: `${c("dim", "← Back")}`,
        value: "back"
      }
    ];
    const selected2 = await select({
      message: "What would you like to do?",
      choices: choices2,
      loop: false
    });
    if (selected2 === "back") return null;
    if (selected2 === "custom") {
      const customPath = await promptCustomPath();
      if (!customPath) return null;
      return { client: "custom", customPath };
    }
    return null;
  }
  const choices = [];
  for (const { clientId, status } of availableClients) {
    const client = MCP_CLIENTS[clientId];
    let name = `${client.name} - ${dim(client.description)}`;
    name += ` ${getClientStatusIndicator(status)}`;
    if (currentClient === clientId) {
      name = `${c("green", "★")} ${name} ${c("yellow", "(Current)")}`;
    }
    choices.push({
      name,
      value: clientId
    });
  }
  choices.sort((a, b) => {
    if (currentClient === a.value) return -1;
    if (currentClient === b.value) return 1;
    return 0;
  });
  choices.push(new Separator());
  choices.push({
    name: `${c("cyan", "⚙")} Custom Path - ${dim("Specify your own MCP config path")}`,
    value: "custom"
  });
  choices.push(new Separator());
  choices.push({
    name: `${c("dim", "← Back")}`,
    value: "back"
  });
  const selected = await select({
    message: "Select a client to install octocode:",
    choices,
    loop: false
  });
  if (selected === "back") return null;
  if (selected === "custom") {
    const customPath = await promptCustomPath();
    if (!customPath) return null;
    return { client: "custom", customPath };
  }
  return { client: selected };
}
async function promptExistingConfigurations(installedClients, availableClients, currentClient) {
  console.log();
  console.log(
    `  ${c("green", "✓")} Found ${bold(String(installedClients.length))} octocode configuration${installedClients.length > 1 ? "s" : ""}`
  );
  console.log();
  const choices = [];
  for (const { clientId } of installedClients) {
    const client = MCP_CLIENTS[clientId];
    let name = `${c("green", "✓")} ${client.name} - ${dim("View/Edit configuration")}`;
    if (currentClient === clientId) {
      name += ` ${c("yellow", "(Current)")}`;
    }
    choices.push({
      name,
      value: clientId
    });
  }
  choices.sort((a, b) => {
    if (currentClient === a.value) return -1;
    if (currentClient === b.value) return 1;
    return 0;
  });
  if (availableClients.length > 0) {
    choices.push(new Separator());
    choices.push({
      name: `${c("blue", "+")} Install to another client - ${dim(`${availableClients.length} available`)}`,
      value: "install-new"
    });
  }
  choices.push(new Separator());
  choices.push({
    name: `${c("cyan", "⚙")} Custom Path - ${dim("Specify your own MCP config path")}`,
    value: "custom"
  });
  choices.push(new Separator());
  choices.push({
    name: `${c("dim", "← Back")}`,
    value: "back"
  });
  const selected = await select({
    message: "Select configuration to manage:",
    choices,
    loop: false
  });
  if (selected === "back") return null;
  if (selected === "install-new") {
    return await promptInstallToNewClient(availableClients, currentClient);
  }
  if (selected === "custom") {
    const customPath = await promptCustomPath();
    if (!customPath) return null;
    return { client: "custom", customPath };
  }
  return { client: selected };
}
async function promptInstallToNewClient(availableClients, currentClient) {
  console.log();
  console.log(`  ${c("blue", "ℹ")} Select a client for new installation:`);
  console.log();
  const choices = [];
  for (const { clientId, status } of availableClients) {
    const client = MCP_CLIENTS[clientId];
    let name = `${client.name} - ${dim(client.description)}`;
    name += ` ${getClientStatusIndicator(status)}`;
    if (currentClient === clientId) {
      name = `${c("green", "★")} ${name} ${c("yellow", "(Current)")}`;
    }
    choices.push({
      name,
      value: clientId
    });
  }
  choices.sort((a, b) => {
    if (currentClient === a.value) return -1;
    if (currentClient === b.value) return 1;
    return 0;
  });
  choices.push(new Separator());
  choices.push({
    name: `${c("dim", "← Back to configurations")}`,
    value: "back"
  });
  const selected = await select({
    message: "Select client to install octocode:",
    choices,
    loop: false
  });
  if (selected === "back") {
    const allClients = getAllClientsWithStatus();
    const installedClients = allClients.filter((c2) => c2.status.octocodeInstalled);
    return await promptExistingConfigurations(
      installedClients,
      availableClients,
      currentClient
    );
  }
  return { client: selected };
}
function expandPath(inputPath) {
  if (inputPath.startsWith("~")) {
    return path.join(process.env.HOME || "", inputPath.slice(1));
  }
  return inputPath;
}
async function promptCustomPath() {
  console.log();
  console.log(
    `  ${c("blue", "ℹ")} Enter the full path to your MCP config file (JSON)`
  );
  console.log(`  ${dim("Leave empty to go back")}`);
  console.log();
  console.log(`  ${dim("Common paths:")}`);
  console.log(`    ${dim("•")} ~/.cursor/mcp.json ${dim("(Cursor)")}`);
  console.log(
    `    ${dim("•")} ~/Library/Application Support/Claude/claude_desktop_config.json`
  );
  console.log(`      ${dim("(Claude Desktop)")}`);
  console.log(`    ${dim("•")} ~/.claude.json ${dim("(Claude Code)")}`);
  console.log(
    `    ${dim("•")} ~/.codeium/windsurf/mcp_config.json ${dim("(Windsurf)")}`
  );
  console.log(`    ${dim("•")} ~/.config/zed/settings.json ${dim("(Zed)")}`);
  console.log(`    ${dim("•")} ~/.continue/config.json ${dim("(Continue)")}`);
  console.log();
  const customPath = await input({
    message: "MCP config path (or press Enter to go back):",
    validate: (value) => {
      if (!value.trim()) {
        return true;
      }
      const expandedPath = expandPath(value);
      if (!expandedPath.endsWith(".json")) {
        return "Path must be a .json file (e.g., mcp.json, config.json)";
      }
      if (!path.isAbsolute(expandedPath)) {
        return "Please provide an absolute path (starting with / or ~)";
      }
      const parentDir = path.dirname(expandedPath);
      if (!dirExists(parentDir)) {
        return `Parent directory does not exist: ${parentDir}
Create it first or choose a different location.`;
      }
      return true;
    }
  });
  if (!customPath || !customPath.trim()) return null;
  return expandPath(customPath);
}
async function promptLocalTools() {
  console.log();
  console.log(`  ${c("blue", "ℹ")} ${bold("Local Tools")}`);
  console.log(
    `  ${dim("Enable local filesystem tools for searching and reading files")}`
  );
  console.log(`  ${dim("in your local codebase.")}`);
  console.log();
  const choice = await select({
    message: "Enable local tools?",
    choices: [
      {
        name: `${c("yellow", "○")} Disable ${dim("(Recommended)")} - ${dim("Use only GitHub tools")}`,
        value: "disable"
      },
      {
        name: `${c("green", "●")} Enable - ${dim("Allow local file exploration")}`,
        value: "enable"
      },
      new Separator(),
      {
        name: `${c("dim", "← Back")}`,
        value: "back"
      }
    ],
    loop: false
  });
  if (choice === "back") return null;
  return choice === "enable";
}
async function promptGitHubAuth() {
  console.log();
  console.log(`  ${c("blue", "ℹ")} ${bold("GitHub Authentication")}`);
  console.log(`  ${dim("Required for accessing GitHub repositories.")}`);
  console.log();
  const method = await select({
    message: "How would you like to authenticate with GitHub?",
    choices: [
      {
        name: `${c("green", "●")} gh CLI ${dim("(Recommended)")} - ${dim("Uses existing gh auth")}`,
        value: "gh-cli"
      },
      {
        name: `${c("yellow", "●")} GITHUB_TOKEN - ${dim("Enter personal access token")}`,
        value: "token"
      },
      {
        name: `${c("dim", "○")} Skip - ${dim("Configure manually later")}`,
        value: "skip"
      },
      new Separator(),
      {
        name: `${c("dim", "← Back")}`,
        value: "back"
      }
    ],
    loop: false
  });
  if (method === "back") return null;
  if (method === "gh-cli") {
    console.log();
    console.log(
      `  ${c("cyan", "→")} Make sure gh CLI is installed and authenticated:`
    );
    console.log(`    ${dim("https://cli.github.com/")}`);
    console.log();
    console.log(
      `  ${dim("Run")} ${c("cyan", "gh auth login")} ${dim("if not already authenticated.")}`
    );
    console.log();
    return { method: "gh-cli" };
  }
  if (method === "token") {
    console.log();
    console.log(`  ${dim("Leave empty and press Enter to go back")}`);
    console.log();
    const token = await input({
      message: "Enter your GitHub personal access token:",
      validate: (value) => {
        if (!value.trim()) {
          return true;
        }
        if (value.length < 20) {
          return "Token appears too short";
        }
        return true;
      }
    });
    if (!token || !token.trim()) {
      return null;
    }
    console.log();
    console.log(`  ${c("yellow", "⚠")} ${bold("Security Note:")}`);
    console.log(
      `  ${dim("Your token will be saved in the MCP configuration file.")}`
    );
    console.log(
      `  ${dim("Make sure this file is not committed to version control.")}`
    );
    console.log();
    return { method: "token", token };
  }
  return { method: "skip" };
}
const GH_CLI_URL = "https://cli.github.com/";
function isGitHubCLIInstalled() {
  return commandExists("gh");
}
function checkGitHubAuth() {
  if (!isGitHubCLIInstalled()) {
    return {
      installed: false,
      authenticated: false,
      error: "GitHub CLI (gh) is not installed"
    };
  }
  const result = runCommand("gh", ["auth", "status"]);
  if (result.success) {
    const usernameMatch = result.stdout.match(
      /Logged in to github\.com.*account\s+(\S+)/i
    );
    const username = usernameMatch ? usernameMatch[1] : void 0;
    return {
      installed: true,
      authenticated: true,
      username
    };
  }
  return {
    installed: true,
    authenticated: false,
    error: result.stderr || "Not authenticated"
  };
}
function getGitHubCLIVersion() {
  const result = runCommand("gh", ["--version"]);
  if (result.success) {
    const match = result.stdout.match(/gh version ([\d.]+)/);
    return match ? match[1] : result.stdout.split("\n")[0];
  }
  return null;
}
function getAuthLoginCommand() {
  return "gh auth login";
}
function printGitHubAuthStatus() {
  const status = checkGitHubAuth();
  if (!status.installed) {
    console.log(
      `  ${c("yellow", "⚠")} GitHub: ${c("yellow", "gh CLI not found")}`
    );
    console.log(
      `    ${c("yellow", "Authenticate using gh CLI")} (${c("underscore", GH_CLI_URL)}) ${c("yellow", "OR use GITHUB_TOKEN configuration")}`
    );
  } else if (!status.authenticated) {
    console.log(
      `  ${c("yellow", "⚠")} GitHub CLI not authenticated - run ${c("yellow", getAuthLoginCommand())}`
    );
    console.log(`      ${dim("or set GITHUB_TOKEN in MCP config")}`);
  } else {
    console.log(
      `  ${c("green", "✓")} GitHub: Authenticated as ${c("cyan", status.username || "unknown")}`
    );
  }
}
function printConfigPreview(config) {
  const hasEnv = config.env && Object.keys(config.env).length > 0;
  console.log();
  console.log(c("dim", "  {"));
  console.log(c("dim", '    "mcpServers": {'));
  console.log(c("magenta", '      "octocode"') + c("dim", ": {"));
  console.log(
    c("dim", '        "command": ') + c("green", `"${config.command}"`) + c("dim", ",")
  );
  console.log(c("dim", '        "args": ['));
  config.args.forEach((arg, i) => {
    const isLast = i === config.args.length - 1;
    const truncated = arg.length > 50 ? arg.slice(0, 47) + "..." : arg;
    console.log(
      c("dim", "          ") + c("green", `"${truncated}"`) + (isLast && !hasEnv ? "" : c("dim", ","))
    );
  });
  console.log(c("dim", "        ]") + (hasEnv ? c("dim", ",") : ""));
  if (hasEnv && config.env) {
    console.log(c("dim", '        "env": {'));
    const envEntries = Object.entries(config.env);
    envEntries.forEach(([key, value], i) => {
      const isLast = i === envEntries.length - 1;
      const lowerKey = key.toLowerCase();
      const isSensitive = lowerKey.includes("token") || lowerKey.includes("secret");
      const displayValue = isSensitive ? "***" : value;
      console.log(
        c("dim", "          ") + c("cyan", `"${key}"`) + c("dim", ": ") + c("green", `"${displayValue}"`) + (isLast ? "" : c("dim", ","))
      );
    });
    console.log(c("dim", "        }"));
  }
  console.log(c("dim", "      }"));
  console.log(c("dim", "    }"));
  console.log(c("dim", "  }"));
  console.log();
}
function printInstallError(result) {
  console.log();
  console.log(`  ${c("red", "✗")} ${bold("Installation failed")}`);
  if (result.error) {
    console.log(`  ${dim("Error:")} ${result.error}`);
  }
  console.log();
}
function printExistingOctocodeConfig(server) {
  const boxWidth = 60;
  console.log();
  console.log(c("cyan", "  ┌" + "─".repeat(boxWidth) + "┐"));
  const commandLine = `${server.command} ${server.args.join(" ")}`;
  const maxLen = boxWidth - 4;
  const displayCommand = commandLine.length > maxLen ? commandLine.slice(0, maxLen - 3) + "..." : commandLine;
  const cmdPadding = Math.max(0, boxWidth - 2 - displayCommand.length);
  console.log(
    c("cyan", "  │ ") + dim(displayCommand) + " ".repeat(cmdPadding) + c("cyan", "│")
  );
  if (server.env && Object.keys(server.env).length > 0) {
    console.log(c("cyan", "  │") + " ".repeat(boxWidth) + c("cyan", "│"));
    const envLabel = "Environment:";
    const envPadding = boxWidth - 2 - envLabel.length;
    console.log(
      c("cyan", "  │ ") + bold(envLabel) + " ".repeat(envPadding) + c("cyan", "│")
    );
    for (const [key, value] of Object.entries(server.env)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = lowerKey.includes("token") || lowerKey.includes("secret");
      const displayValue = isSensitive ? "***" : value;
      const envLine = `  ${key}: ${displayValue}`;
      const truncatedEnv = envLine.length > maxLen ? envLine.slice(0, maxLen - 3) + "..." : envLine;
      const padding = Math.max(0, boxWidth - 2 - truncatedEnv.length);
      console.log(
        c("cyan", "  │ ") + dim(truncatedEnv) + " ".repeat(padding) + c("cyan", "│")
      );
    }
  }
  console.log(c("cyan", "  └" + "─".repeat(boxWidth) + "┘"));
}
function detectAvailableIDEs() {
  const available = [];
  if (ideConfigExists("cursor")) {
    available.push("cursor");
  }
  if (ideConfigExists("claude")) {
    available.push("claude");
  }
  return available;
}
function checkExistingInstallation(ide) {
  const configPath = getMCPConfigPath(ide);
  const configExists = fileExists(configPath);
  if (!configExists) {
    return { installed: false, configPath, configExists: false };
  }
  const config = readMCPConfig(configPath);
  if (!config) {
    return { installed: false, configPath, configExists: true };
  }
  return {
    installed: isOctocodeConfigured(config),
    configPath,
    configExists: true
  };
}
function installOctocode(options) {
  const { ide, method, force = false } = options;
  const configPath = getMCPConfigPath(ide);
  let config = readMCPConfig(configPath) || { mcpServers: {} };
  if (isOctocodeConfigured(config) && !force) {
    return {
      success: false,
      configPath,
      alreadyInstalled: true,
      error: "Octocode is already configured. Use --force to overwrite."
    };
  }
  config = mergeOctocodeConfig(config, method);
  const writeResult = writeMCPConfig(configPath, config);
  if (!writeResult.success) {
    return {
      success: false,
      configPath,
      error: writeResult.error || "Failed to write config"
    };
  }
  return {
    success: true,
    configPath,
    backupPath: writeResult.backupPath
  };
}
function getInstallPreview(ide, method) {
  const configPath = getMCPConfigPath(ide);
  const existing = checkExistingInstallation(ide);
  const existingConfig = readMCPConfig(configPath);
  const serverConfig = isWindows ? getOctocodeServerConfigWindows(method) : getOctocodeServerConfig(method);
  let action = "create";
  if (existing.installed) {
    action = "override";
  } else if (existing.configExists) {
    action = "add";
  }
  return {
    ide,
    method,
    configPath,
    serverConfig,
    action,
    existingMethod: existingConfig ? getConfiguredMethod(existingConfig) : null
  };
}
function checkExistingClientInstallation(client, customPath) {
  const configPath = client === "custom" && customPath ? customPath : getMCPConfigPath(client, customPath);
  const configExists = fileExists(configPath);
  if (!configExists) {
    return { installed: false, configPath, configExists: false };
  }
  const config = readMCPConfig(configPath);
  if (!config) {
    return { installed: false, configPath, configExists: true };
  }
  return {
    installed: isOctocodeConfigured(config),
    configPath,
    configExists: true
  };
}
function installOctocodeForClient(options) {
  const { client, method, customPath, force = false, envOptions } = options;
  const configPath = client === "custom" && customPath ? customPath : getMCPConfigPath(client, customPath);
  let config = readMCPConfig(configPath) || { mcpServers: {} };
  if (isOctocodeConfigured(config) && !force) {
    return {
      success: false,
      configPath,
      alreadyInstalled: true,
      error: "Octocode is already configured. Use --force to overwrite."
    };
  }
  config = mergeOctocodeConfig(config, method, envOptions);
  const writeResult = writeMCPConfig(configPath, config);
  if (!writeResult.success) {
    return {
      success: false,
      configPath,
      error: writeResult.error || "Failed to write config"
    };
  }
  return {
    success: true,
    configPath,
    backupPath: writeResult.backupPath
  };
}
function getInstallPreviewForClient(client, method, customPath, envOptions) {
  const configPath = client === "custom" && customPath ? customPath : getMCPConfigPath(client, customPath);
  const existing = checkExistingClientInstallation(client, customPath);
  const existingConfig = readMCPConfig(configPath);
  const serverConfig = isWindows ? getOctocodeServerConfigWindows(method, envOptions) : getOctocodeServerConfig(method, envOptions);
  let action = "create";
  if (existing.installed) {
    action = "override";
  } else if (existing.configExists) {
    action = "add";
  }
  return {
    client,
    method,
    configPath,
    serverConfig,
    action,
    existingMethod: existingConfig ? getConfiguredMethod(existingConfig) : null
  };
}
async function runInstallFlow() {
  await loadInquirer();
  console.log();
  console.log(c("blue", "━".repeat(66)));
  console.log(`  📦 ${bold("Configure MCP server for your environment")}`);
  console.log(c("blue", "━".repeat(66)));
  console.log();
  const state = {
    client: null,
    hasExistingOctocode: false,
    enableLocal: false,
    githubAuth: { method: "skip" }
  };
  let currentStep = "client";
  while (currentStep !== "done") {
    switch (currentStep) {
      case "client": {
        const selection = await selectMCPClient();
        if (!selection) {
          return;
        }
        state.client = selection.client;
        state.customPath = selection.customPath;
        const configPath = state.customPath || getMCPConfigPath(state.client);
        const existingConfig = readMCPConfig(configPath);
        state.hasExistingOctocode = !!existingConfig?.mcpServers?.octocode;
        if (state.hasExistingOctocode) {
          currentStep = "updateConfirm";
        } else {
          currentStep = "localTools";
        }
        break;
      }
      case "updateConfirm": {
        const configPath = state.customPath || getMCPConfigPath(state.client);
        const existingConfig = readMCPConfig(configPath);
        console.log();
        console.log(c("yellow", "  ┌" + "─".repeat(60) + "┐"));
        console.log(
          c("yellow", "  │ ") + `${c("yellow", "⚠")} ${bold("Octocode is already configured!")}` + " ".repeat(28) + c("yellow", "│")
        );
        console.log(c("yellow", "  └" + "─".repeat(60) + "┘"));
        console.log();
        console.log(`  ${bold("Current octocode configuration:")}`);
        printExistingOctocodeConfig(existingConfig.mcpServers.octocode);
        console.log();
        console.log(`  ${dim("Config file:")} ${c("cyan", configPath)}`);
        console.log();
        const updateChoice = await select({
          message: "What would you like to do?",
          choices: [
            {
              name: `${c("green", "✓")} Update existing configuration`,
              value: "update"
            },
            new Separator(),
            {
              name: `${c("dim", "← Back to client selection")}`,
              value: "back"
            }
          ],
          loop: false
        });
        if (updateChoice === "back") {
          currentStep = "client";
        } else {
          currentStep = "localTools";
        }
        break;
      }
      case "localTools": {
        const enableLocal = await promptLocalTools();
        if (enableLocal === null) {
          currentStep = state.hasExistingOctocode ? "updateConfirm" : "client";
        } else {
          state.enableLocal = enableLocal;
          currentStep = "githubAuth";
        }
        break;
      }
      case "githubAuth": {
        const githubAuth = await promptGitHubAuth();
        if (githubAuth === null) {
          currentStep = "localTools";
        } else {
          state.githubAuth = githubAuth;
          currentStep = "confirm";
        }
        break;
      }
      case "confirm": {
        const shouldProceed = await showConfirmationAndPrompt(state);
        if (shouldProceed === "proceed") {
          currentStep = "install";
        } else if (shouldProceed === "back") {
          currentStep = "githubAuth";
        } else {
          console.log(`  ${dim("Configuration cancelled.")}`);
          return;
        }
        break;
      }
      case "install": {
        await performInstall(state);
        currentStep = "done";
        break;
      }
    }
  }
}
async function showConfirmationAndPrompt(state) {
  const clientInfo = MCP_CLIENTS[state.client];
  const method = "npx";
  const envOptions = {};
  if (state.enableLocal) {
    envOptions.enableLocal = true;
  }
  if (state.githubAuth.method === "token" && state.githubAuth.token) {
    envOptions.githubToken = state.githubAuth.token;
  }
  const preview = getInstallPreviewForClient(
    state.client,
    method,
    state.customPath,
    envOptions
  );
  console.log();
  if (state.hasExistingOctocode) {
    console.log(
      `  ${c("yellow", "⚠")} Will ${c("yellow", "UPDATE")} existing octocode configuration`
    );
  } else if (preview.action === "add") {
    console.log(
      `  ${c("blue", "ℹ")} Config file exists, will ${c("green", "ADD")} octocode entry`
    );
  } else {
    console.log(
      `  ${c("green", "✓")} Will ${c("green", "CREATE")} new config file`
    );
  }
  console.log();
  console.log(c("blue", "  ┌" + "─".repeat(60) + "┐"));
  console.log(
    c("blue", "  │ ") + bold("Configuration to be added:") + " ".repeat(33) + c("blue", "│")
  );
  console.log(c("blue", "  └" + "─".repeat(60) + "┘"));
  printConfigPreview(preview.serverConfig);
  console.log();
  console.log(`  ${bold("Summary:")}`);
  console.log(`    ${dim("Client:")}       ${clientInfo.name}`);
  console.log(`    ${dim("Method:")}       npx (octocode-mcp@latest)`);
  const localStatus = state.enableLocal ? c("green", "Enabled") : c("dim", "Disabled");
  console.log(`    ${dim("Local Tools:")} ${localStatus}`);
  let authStatus;
  if (state.githubAuth.method === "token") {
    authStatus = c("green", "Token configured");
  } else if (state.githubAuth.method === "gh-cli") {
    authStatus = c("cyan", "Using gh CLI");
  } else {
    authStatus = c("dim", "Not configured");
  }
  console.log(`    ${dim("GitHub Auth:")} ${authStatus}`);
  let actionStatus;
  if (state.hasExistingOctocode) {
    actionStatus = c("yellow", "UPDATE");
  } else if (preview.action === "add") {
    actionStatus = c("green", "ADD");
  } else {
    actionStatus = c("green", "CREATE");
  }
  console.log(`    ${dim("Action:")}       ${actionStatus}`);
  console.log();
  console.log(`  ${c("yellow", "⚠")} ${bold("Note:")}`);
  console.log(
    `  ${dim("Nothing is saved to any server. Configuration is stored locally at:")}`
  );
  console.log(`  ${c("cyan", preview.configPath)}`);
  console.log();
  const choice = await select({
    message: "What would you like to do?",
    choices: [
      {
        name: `${c("green", "✓")} Proceed with configuration`,
        value: "proceed"
      },
      new Separator(),
      {
        name: `${c("dim", "← Back to edit options")}`,
        value: "back"
      },
      {
        name: `${c("dim", "✗ Cancel")}`,
        value: "cancel"
      }
    ],
    loop: false
  });
  return choice;
}
async function performInstall(state) {
  const method = "npx";
  const envOptions = {};
  if (state.enableLocal) {
    envOptions.enableLocal = true;
  }
  if (state.githubAuth.method === "token" && state.githubAuth.token) {
    envOptions.githubToken = state.githubAuth.token;
  }
  const preview = getInstallPreviewForClient(
    state.client,
    method,
    state.customPath,
    envOptions
  );
  const spinner = new Spinner("Configuring octocode-mcp...").start();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const result = installOctocodeForClient({
    client: state.client,
    method,
    customPath: state.customPath,
    force: state.hasExistingOctocode,
    envOptions
  });
  if (result.success) {
    spinner.succeed("Octocode configured successfully!");
    printInstallSuccessForClient(result, state.client, preview.configPath);
  } else {
    spinner.fail("Configuration failed");
    printInstallError(result);
  }
}
function printInstallSuccessForClient(result, client, configPath) {
  const clientInfo = MCP_CLIENTS[client];
  console.log();
  console.log(c("green", "  ┌" + "─".repeat(60) + "┐"));
  console.log(
    c("green", "  │ ") + `${c("green", "✓")} ${bold("Octocode installed successfully!")}` + " ".repeat(26) + c("green", "│")
  );
  console.log(c("green", "  └" + "─".repeat(60) + "┘"));
  console.log();
  console.log(`  ${bold("Configuration saved to:")}`);
  console.log(`  ${c("cyan", configPath)}`);
  console.log();
  if (result.backupPath) {
    console.log(`  ${dim("Backup saved to:")} ${result.backupPath}`);
    console.log();
  }
  console.log(`  ${bold("Next steps:")}`);
  console.log(`    1. Restart ${clientInfo?.name || client}`);
  console.log(`    2. Look for ${c("cyan", "octocode")} in MCP servers`);
  console.log();
}
function printNodeEnvironmentStatus(status) {
  if (status.nodeInstalled) {
    console.log(
      `  ${c("green", "✓")} Node.js: ${bold(status.nodeVersion || "unknown")}`
    );
  } else {
    console.log(`  ${c("red", "✗")} Node.js: ${c("red", "Not found in PATH")}`);
  }
  if (status.npmInstalled) {
    console.log(
      `  ${c("green", "✓")} npm: ${bold(status.npmVersion || "unknown")}`
    );
  } else {
    console.log(
      `  ${c("yellow", "⚠")} npm: ${c("yellow", "Not found in PATH")}`
    );
  }
  printRegistryStatus(status.registryStatus, status.registryLatency);
  printOctocodePackageStatus(
    status.octocodePackageAvailable,
    status.octocodePackageVersion
  );
}
function printRegistryStatus(status, latency) {
  const latencyStr = latency !== null ? `(${latency}ms)` : "";
  switch (status) {
    case "ok":
      console.log(
        `  ${c("green", "✓")} Registry: ${c("green", "OK")} ${dim(latencyStr)}`
      );
      break;
    case "slow":
      console.log(
        `  ${c("yellow", "⚠")} Registry: ${c("yellow", "Slow")} ${dim(latencyStr)}`
      );
      break;
    case "failed":
      console.log(
        `  ${c("red", "✗")} Registry: ${c("red", "Unreachable")} ${latency !== null ? dim(latencyStr) : ""}`
      );
      break;
  }
}
function printOctocodePackageStatus(available, version) {
  if (available) {
    console.log(
      `  ${c("green", "✓")} octocode-mcp: ${c("green", "Available")} ${dim(`(v${version})`)}`
    );
  } else {
    console.log(
      `  ${c("red", "✗")} octocode-mcp: ${c("red", "Not found in registry")}`
    );
  }
}
function printNodeDoctorHint() {
  console.log(
    `  ${dim("For deeper diagnostics:")} ${c("cyan", "npx node-doctor")}`
  );
}
function hasEnvironmentIssues(status) {
  return !status.nodeInstalled || !status.npmInstalled || status.registryStatus === "slow" || status.registryStatus === "failed" || !status.octocodePackageAvailable;
}
const REGISTRY_OK_THRESHOLD = 1e3;
const REGISTRY_SLOW_THRESHOLD = 3e3;
function checkNodeInPath() {
  try {
    const version = execSync("node --version", {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return { installed: true, version };
  } catch {
    return { installed: false, version: null };
  }
}
function checkNpmInPath() {
  try {
    const version = execSync("npm --version", {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return { installed: true, version: `v${version}` };
  } catch {
    return { installed: false, version: null };
  }
}
async function checkNpmRegistry() {
  const registryUrl = "https://registry.npmjs.org";
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      REGISTRY_SLOW_THRESHOLD
    );
    const response = await fetch(registryUrl, {
      method: "HEAD",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const latency = Date.now() - start;
    if (!response.ok) {
      return { status: "failed", latency };
    }
    if (latency > REGISTRY_SLOW_THRESHOLD) {
      return { status: "failed", latency };
    }
    if (latency > REGISTRY_OK_THRESHOLD) {
      return { status: "slow", latency };
    }
    return { status: "ok", latency };
  } catch {
    return { status: "failed", latency: null };
  }
}
function checkOctocodePackage() {
  try {
    const result = execSync("npm view octocode-mcp version", {
      encoding: "utf-8",
      timeout: 1e4,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return { available: true, version: result };
  } catch {
    return { available: false, version: null };
  }
}
async function checkNodeEnvironment() {
  const nodeCheck = checkNodeInPath();
  const npmCheck = checkNpmInPath();
  const registryCheck = await checkNpmRegistry();
  const octocodeCheck = checkOctocodePackage();
  return {
    nodeInstalled: nodeCheck.installed,
    nodeVersion: nodeCheck.version,
    npmInstalled: npmCheck.installed,
    npmVersion: npmCheck.version,
    registryStatus: registryCheck.status,
    registryLatency: registryCheck.latency,
    octocodePackageAvailable: octocodeCheck.available,
    octocodePackageVersion: octocodeCheck.version
  };
}
const ALL_AVAILABLE_TOOLS = {
  // GitHub tools
  github: [
    {
      id: "githubSearchCode",
      name: "Search Code",
      description: "Search for code patterns in GitHub repositories"
    },
    {
      id: "githubGetFileContent",
      name: "Get File Content",
      description: "Fetch file content from GitHub repositories"
    },
    {
      id: "githubViewRepoStructure",
      name: "View Repo Structure",
      description: "Browse repository directory structure"
    },
    {
      id: "githubSearchRepositories",
      name: "Search Repositories",
      description: "Search for GitHub repositories"
    },
    {
      id: "githubSearchPullRequests",
      name: "Search Pull Requests",
      description: "Search for pull requests and view diffs"
    },
    {
      id: "packageSearch",
      name: "Package Search",
      description: "Search npm/Python packages and find their repos"
    }
  ],
  // Local tools
  local: [
    {
      id: "localSearchCode",
      name: "Ripgrep Search",
      description: "Fast content search with regex support"
    },
    {
      id: "localViewStructure",
      name: "View Structure",
      description: "Browse local directory structure"
    },
    {
      id: "localFindFiles",
      name: "Find Files",
      description: "Find files by name, time, size, permissions"
    },
    {
      id: "localGetFileContent",
      name: "Fetch Content",
      description: "Read targeted sections of local files"
    }
  ]
};
const ALL_CONFIG_OPTIONS = [
  {
    id: "enableLocal",
    envVar: "ENABLE_LOCAL",
    name: "Local File Tools",
    description: "Enable local file exploration tools for searching and browsing local files",
    type: "boolean",
    defaultValue: "false"
  },
  {
    id: "githubApiUrl",
    envVar: "GITHUB_API_URL",
    name: "GitHub API URL",
    description: "Custom GitHub API endpoint (for GitHub Enterprise)",
    type: "string",
    defaultValue: "https://api.github.com"
  },
  {
    id: "toolsToRun",
    envVar: "TOOLS_TO_RUN",
    name: "Tools to Run",
    description: "Specific tools to enable (all others disabled)",
    type: "array",
    defaultValue: "",
    toolCategory: "all"
  },
  {
    id: "enableTools",
    envVar: "ENABLE_TOOLS",
    name: "Enable Tools",
    description: "Additional tools to enable",
    type: "array",
    defaultValue: "",
    toolCategory: "all"
  },
  {
    id: "disableTools",
    envVar: "DISABLE_TOOLS",
    name: "Disable Tools",
    description: "Tools to disable",
    type: "array",
    defaultValue: "",
    toolCategory: "all"
  },
  {
    id: "requestTimeout",
    envVar: "REQUEST_TIMEOUT",
    name: "Request Timeout",
    description: "API request timeout in milliseconds",
    type: "number",
    defaultValue: "30000",
    validation: { min: 3e4, max: 6e5 }
  },
  {
    id: "maxRetries",
    envVar: "MAX_RETRIES",
    name: "Max Retries",
    description: "Maximum number of API retry attempts",
    type: "number",
    defaultValue: "3",
    validation: { min: 0, max: 10 }
  }
];
function getAllTools() {
  return [
    ...ALL_AVAILABLE_TOOLS.github.map((t) => ({
      ...t,
      category: "github"
    })),
    ...ALL_AVAILABLE_TOOLS.local.map((t) => ({
      ...t,
      category: "local"
    }))
  ];
}
function getCurrentValue(env, option) {
  const value = env[option.envVar];
  if (value === void 0 || value === null || value === "") {
    return option.defaultValue;
  }
  return value;
}
function formatDisplayValue(option, value) {
  if (option.type === "boolean") {
    const isEnabled = value === "1" || value.toLowerCase() === "true";
    return isEnabled ? c("green", "enabled") : c("dim", "disabled");
  }
  if (option.type === "array") {
    if (!value || value === "") {
      return c("dim", option.id === "toolsToRun" ? "(all tools)" : "(none)");
    }
    const tools = value.split(",").filter((t) => t.trim());
    return tools.length > 2 ? `${tools.slice(0, 2).join(", ")} ${c("dim", `+${tools.length - 2} more`)}` : tools.join(", ");
  }
  if (option.type === "number") {
    if (value === option.defaultValue) {
      return `${value} ${c("dim", "(default)")}`;
    }
    return value;
  }
  if (value === option.defaultValue) {
    return `${c("dim", value)}`;
  }
  return c("cyan", value);
}
function parseBooleanValue(value) {
  return value === "1" || value.toLowerCase() === "true";
}
async function showConfigMenu() {
  const choice = await select({
    message: "Configuration Options:",
    choices: [
      {
        name: "🔧 Edit configuration",
        value: "edit",
        description: "Configure all octocode-mcp settings for a client"
      },
      {
        name: "📋 View all configuration options",
        value: "view",
        description: "Show available environment variables and their defaults"
      },
      {
        name: "📄 Show current JSON config",
        value: "show-json",
        description: "Display the actual MCP config JSON for a client"
      },
      new Separator(),
      {
        name: `${c("dim", "← Back to main menu")}`,
        value: "back"
      }
    ],
    pageSize: 10,
    loop: false,
    theme: {
      prefix: "  ",
      style: {
        highlight: (text) => c("cyan", text),
        message: (text) => bold(text)
      }
    }
  });
  return choice;
}
async function runConfigOptionsFlow() {
  await loadInquirer();
  console.log();
  console.log(c("blue", "━".repeat(66)));
  console.log(`  ⚙️  ${bold("Configure Octocode Options")}`);
  console.log(c("blue", "━".repeat(66)));
  console.log();
  const choice = await showConfigMenu();
  switch (choice) {
    case "view":
      showConfigInfo();
      await pressEnterToContinue$1();
      break;
    case "edit":
      await runEditConfigFlow();
      break;
    case "show-json":
      await showCurrentJsonConfig();
      break;
  }
}
async function pressEnterToContinue$1() {
  const { input: input2 } = await Promise.resolve().then(() => prompts);
  console.log();
  await input2({
    message: dim("Press Enter to continue..."),
    default: ""
  });
}
async function promptOpenConfigFile(configPath) {
  console.log();
  const openChoice = await select({
    message: "Open config file?",
    choices: [
      {
        name: "📝 Open in Cursor",
        value: "cursor",
        description: "Open in Cursor IDE"
      },
      {
        name: "📝 Open in VS Code",
        value: "vscode",
        description: "Open in Visual Studio Code"
      },
      {
        name: "📄 Open in default app",
        value: "default",
        description: "Open with system default application"
      },
      new Separator(),
      {
        name: `${c("dim", "← Skip")}`,
        value: "no"
      }
    ],
    pageSize: 10,
    loop: false,
    theme: {
      prefix: "  ",
      style: {
        highlight: (text) => c("cyan", text),
        message: (text) => bold(text)
      }
    }
  });
  if (openChoice === "no") {
    return;
  }
  const success = openInEditor(configPath, openChoice);
  if (success) {
    console.log(`  ${c("green", "✓")} Opened ${configPath}`);
  } else {
    console.log(`  ${c("yellow", "⚠")} Could not open file automatically`);
    console.log(`  ${dim("Try opening manually:")} ${c("cyan", configPath)}`);
  }
  console.log();
}
async function editBooleanOption(option, currentValue) {
  const isEnabled = parseBooleanValue(currentValue);
  const currentStatus = isEnabled ? c("green", "enabled") : c("dim", "disabled");
  console.log();
  console.log(`  ${bold(option.name)}`);
  console.log(`  ${dim(option.description)}`);
  console.log(`  ${dim("Current:")} ${currentStatus}`);
  console.log();
  const choice = await select({
    message: `${option.name}:`,
    choices: [
      {
        name: `${c("green", "✓")} Enable`,
        value: "enable"
      },
      {
        name: `${c("yellow", "○")} Disable`,
        value: "disable"
      },
      new Separator(),
      {
        name: `${c("dim", "← Cancel")}`,
        value: "cancel"
      }
    ],
    loop: false
  });
  if (choice === "cancel") return null;
  return choice === "enable" ? "1" : "false";
}
async function editStringOption(option, currentValue) {
  const displayCurrent = currentValue && currentValue !== option.defaultValue ? c("cyan", currentValue) : c("dim", currentValue || option.defaultValue);
  console.log();
  console.log(`  ${bold(option.name)}`);
  console.log(`  ${dim(option.description)}`);
  console.log(`  ${dim("Current:")} ${displayCurrent}`);
  console.log(`  ${dim("Default:")} ${option.defaultValue}`);
  console.log(`  ${dim("(Leave empty and press Enter to cancel)")}`);
  console.log();
  const newValue = await input({
    message: `${option.name}:`,
    default: "",
    validate: (value) => {
      if (!value.trim()) {
        return true;
      }
      if (option.validation?.pattern && !option.validation.pattern.test(value)) {
        return "Invalid format";
      }
      return true;
    }
  });
  if (!newValue.trim()) {
    return null;
  }
  return newValue === option.defaultValue ? "" : newValue;
}
async function editNumberOption(option, currentValue) {
  const displayCurrent = currentValue && currentValue !== option.defaultValue ? c("cyan", currentValue) : c("dim", currentValue || option.defaultValue);
  console.log();
  console.log(`  ${bold(option.name)}`);
  console.log(`  ${dim(option.description)}`);
  console.log(`  ${dim("Current:")} ${displayCurrent}`);
  if (option.validation?.min !== void 0 || option.validation?.max !== void 0) {
    const min = option.validation?.min ?? 0;
    const max = option.validation?.max ?? Infinity;
    console.log(`  ${dim("Range:")} ${min} - ${max === Infinity ? "∞" : max}`);
  }
  console.log(`  ${dim("Default:")} ${option.defaultValue}`);
  console.log(`  ${dim("(Leave empty and press Enter to cancel)")}`);
  console.log();
  const newValue = await input({
    message: `${option.name}:`,
    default: "",
    validate: (value) => {
      if (!value.trim()) {
        return true;
      }
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        return "Please enter a valid number";
      }
      if (option.validation?.min !== void 0 && num < option.validation.min) {
        return `Minimum value is ${option.validation.min}`;
      }
      if (option.validation?.max !== void 0 && num > option.validation.max) {
        return `Maximum value is ${option.validation.max}`;
      }
      return true;
    }
  });
  if (!newValue.trim()) {
    return null;
  }
  return newValue === option.defaultValue ? "" : newValue;
}
async function editArrayOption(option, currentValue) {
  const allTools = getAllTools();
  const currentTools = currentValue ? currentValue.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const currentDisplay = currentTools.length > 0 ? currentTools.join(", ") : option.id === "toolsToRun" ? c("dim", "(all tools)") : c("dim", "(none)");
  console.log();
  console.log(`  ${bold(option.name)}`);
  console.log(`  ${dim(option.description)}`);
  console.log(`  ${dim("Current:")} ${currentDisplay}`);
  console.log();
  const action = await select({
    message: `${option.name}:`,
    choices: [
      {
        name: "📝 Select tools",
        value: "select",
        description: "Choose which tools to include"
      },
      {
        name: `${c("yellow", "↺")} Clear all`,
        value: "clear",
        description: option.id === "toolsToRun" ? "Reset to all tools enabled" : "Remove all tools from this list"
      },
      new Separator(),
      {
        name: `${c("dim", "← Cancel")}`,
        value: "cancel"
      }
    ],
    loop: false
  });
  if (action === "cancel") {
    return null;
  }
  if (action === "clear") {
    return "";
  }
  const choices = [];
  choices.push({
    name: c("blue", "── GitHub Tools ──"),
    value: "__separator_github__",
    disabled: true
  });
  for (const tool of allTools.filter((t) => t.category === "github")) {
    choices.push({
      name: `${tool.name} ${c("dim", `(${tool.id})`)}`,
      value: tool.id,
      checked: currentTools.includes(tool.id),
      description: tool.description
    });
  }
  choices.push({
    name: c("yellow", "── Local Tools ──"),
    value: "__separator_local__",
    disabled: true
  });
  for (const tool of allTools.filter((t) => t.category === "local")) {
    choices.push({
      name: `${tool.name} ${c("dim", `(${tool.id})`)}`,
      value: tool.id,
      checked: currentTools.includes(tool.id),
      description: tool.description
    });
  }
  console.log();
  console.log(`  ${dim("Use Space to select/deselect, Enter to confirm")}`);
  const selected = await checkbox({
    message: `Select tools for ${option.name}:`,
    choices,
    pageSize: 15,
    loop: false,
    theme: {
      prefix: "  ",
      style: {
        highlight: (text) => c("cyan", text),
        message: (text) => bold(text)
      }
    }
  });
  const validTools = selected.filter((t) => !t.startsWith("__separator"));
  return validTools.length > 0 ? validTools.join(",") : "";
}
async function showEditConfigMenu(env) {
  const choices = [];
  const booleanOptions = ALL_CONFIG_OPTIONS.filter((o) => o.type === "boolean");
  const stringOptions = ALL_CONFIG_OPTIONS.filter((o) => o.type === "string");
  const numberOptions = ALL_CONFIG_OPTIONS.filter((o) => o.type === "number");
  const arrayOptions = ALL_CONFIG_OPTIONS.filter((o) => o.type === "array");
  if (booleanOptions.length > 0) {
    choices.push({
      name: c("dim", "── Features ──"),
      value: "__sep1__"
    });
    for (const option of booleanOptions) {
      const value = getCurrentValue(env, option);
      const displayValue = formatDisplayValue(option, value);
      choices.push({
        name: `${option.name}: ${displayValue}`,
        value: option.id,
        description: option.description
      });
    }
  }
  if (stringOptions.length > 0) {
    choices.push({
      name: c("dim", "── Endpoints ──"),
      value: "__sep2__"
    });
    for (const option of stringOptions) {
      const value = getCurrentValue(env, option);
      const displayValue = formatDisplayValue(option, value);
      choices.push({
        name: `${option.name}: ${displayValue}`,
        value: option.id,
        description: option.description
      });
    }
  }
  if (numberOptions.length > 0) {
    choices.push({
      name: c("dim", "── Performance ──"),
      value: "__sep3__"
    });
    for (const option of numberOptions) {
      const value = getCurrentValue(env, option);
      const displayValue = formatDisplayValue(option, value);
      choices.push({
        name: `${option.name}: ${displayValue}`,
        value: option.id,
        description: option.description
      });
    }
  }
  if (arrayOptions.length > 0) {
    choices.push({
      name: c("dim", "── Tool Selection ──"),
      value: "__sep4__"
    });
    for (const option of arrayOptions) {
      const value = getCurrentValue(env, option);
      const displayValue = formatDisplayValue(option, value);
      choices.push({
        name: `${option.name}: ${displayValue}`,
        value: option.id,
        description: option.description
      });
    }
  }
  choices.push({
    name: c("dim", "── Actions ──"),
    value: "__sep5__"
  });
  choices.push({
    name: `${c("green", "💾")} Save changes`,
    value: "save",
    description: "Save configuration and exit"
  });
  choices.push({
    name: `${c("yellow", "↺")} Reset to defaults`,
    value: "reset",
    description: "Clear all custom configuration"
  });
  choices.push({
    name: `${c("dim", "← Back")}`,
    value: "back"
  });
  const choice = await select({
    message: "Select option to configure:",
    choices,
    pageSize: 18,
    loop: false,
    theme: {
      prefix: "  ",
      style: {
        highlight: (text) => c("cyan", text),
        message: (text) => bold(text)
      }
    }
  });
  return choice;
}
async function runEditConfigFlow() {
  const selection = await selectMCPClient();
  if (!selection) return;
  const { client, customPath } = selection;
  const clientInfo = MCP_CLIENTS[client];
  const configPath = customPath || getMCPConfigPath(client);
  const config = readMCPConfig(configPath);
  if (!config) {
    console.log();
    console.log(`  ${c("red", "✗")} Failed to read config file: ${configPath}`);
    console.log();
    return;
  }
  if (!isOctocodeConfigured(config)) {
    console.log();
    console.log(
      `  ${c("yellow", "⚠")} Octocode is not configured for ${clientInfo.name}`
    );
    console.log(
      `  ${dim('Please install octocode first using "Install octocode-mcp".')}`
    );
    console.log();
    return;
  }
  console.log();
  console.log(`  ${dim("Config file:")} ${c("cyan", configPath)}`);
  console.log(`  ${dim("Client:")} ${clientInfo.name}`);
  console.log();
  const originalEnv = { ...config.mcpServers?.octocode?.env || {} };
  const workingEnv = { ...originalEnv };
  let editing = true;
  while (editing) {
    const choice = await showEditConfigMenu(workingEnv);
    if (choice.startsWith("__sep")) {
      continue;
    }
    switch (choice) {
      case "save": {
        const hasChanges = JSON.stringify(originalEnv) !== JSON.stringify(workingEnv);
        if (!hasChanges) {
          console.log();
          console.log(`  ${dim("No changes to save.")}`);
          console.log();
          editing = false;
          break;
        }
        const spinner = new Spinner("Saving configuration...").start();
        const cleanEnv = {};
        for (const [key, value] of Object.entries(workingEnv)) {
          if (value && value !== "") {
            cleanEnv[key] = value;
          }
        }
        const updatedConfig = {
          ...config,
          mcpServers: {
            ...config.mcpServers,
            octocode: {
              ...config.mcpServers.octocode,
              env: Object.keys(cleanEnv).length > 0 ? cleanEnv : void 0
            }
          }
        };
        if (updatedConfig.mcpServers?.octocode?.env && Object.keys(updatedConfig.mcpServers.octocode.env).length === 0) {
          delete updatedConfig.mcpServers.octocode.env;
        }
        const result = writeMCPConfig(configPath, updatedConfig);
        if (result.success) {
          spinner.succeed("Configuration saved!");
          console.log();
          console.log(`  ${c("green", "✓")} Config saved to: ${configPath}`);
          if (result.backupPath) {
            console.log(`  ${dim("Backup:")} ${result.backupPath}`);
          }
          console.log();
          console.log(
            `  ${bold("Note:")} Restart ${clientInfo.name} for changes to take effect.`
          );
          await promptOpenConfigFile(configPath);
        } else {
          spinner.fail("Failed to save configuration");
          console.log();
          console.log(`  ${c("red", "✗")} ${result.error || "Unknown error"}`);
          console.log();
        }
        editing = false;
        break;
      }
      case "reset": {
        const confirmReset = await confirm({
          message: "Reset all configuration to defaults?",
          default: false
        });
        if (confirmReset) {
          for (const key of Object.keys(workingEnv)) {
            delete workingEnv[key];
          }
          console.log(`  ${c("yellow", "↺")} Configuration reset to defaults`);
        }
        break;
      }
      case "back": {
        const hasUnsavedChanges = JSON.stringify(originalEnv) !== JSON.stringify(workingEnv);
        if (hasUnsavedChanges) {
          const confirmDiscard = await confirm({
            message: "Discard unsaved changes?",
            default: false
          });
          if (!confirmDiscard) {
            break;
          }
        }
        editing = false;
        break;
      }
      default: {
        const option = ALL_CONFIG_OPTIONS.find((o) => o.id === choice);
        if (!option) break;
        const currentValue = getCurrentValue(workingEnv, option);
        let newValue = null;
        switch (option.type) {
          case "boolean":
            newValue = await editBooleanOption(option, currentValue);
            break;
          case "string":
            newValue = await editStringOption(option, currentValue);
            break;
          case "number":
            newValue = await editNumberOption(option, currentValue);
            break;
          case "array":
            newValue = await editArrayOption(option, currentValue);
            break;
        }
        if (newValue !== null) {
          if (newValue === "" || newValue === option.defaultValue) {
            delete workingEnv[option.envVar];
          } else {
            workingEnv[option.envVar] = newValue;
          }
        }
        break;
      }
    }
  }
}
async function showCurrentJsonConfig() {
  const selection = await selectMCPClient();
  if (!selection) return;
  const { client, customPath } = selection;
  const clientInfo = MCP_CLIENTS[client];
  const configPath = customPath || getMCPConfigPath(client);
  const config = readMCPConfig(configPath);
  if (!config) {
    console.log();
    console.log(`  ${c("red", "✗")} Failed to read config file: ${configPath}`);
    console.log();
    return;
  }
  if (!isOctocodeConfigured(config)) {
    console.log();
    console.log(
      `  ${c("yellow", "⚠")} Octocode is not configured for ${clientInfo.name}`
    );
    console.log(
      `  ${dim('Please install octocode first using "Install octocode-mcp".')}`
    );
    console.log();
    return;
  }
  const octocodeConfig = config.mcpServers?.octocode;
  console.log();
  console.log(c("blue", "━".repeat(66)));
  console.log(`  📄 ${bold("Current Octocode Configuration")}`);
  console.log(c("blue", "━".repeat(66)));
  console.log();
  console.log(`  ${dim("Client:")} ${c("cyan", clientInfo.name)}`);
  console.log(`  ${dim("Config file:")} ${c("cyan", configPath)}`);
  console.log();
  console.log(`  ${bold("JSON Configuration:")}`);
  console.log();
  const jsonString = JSON.stringify({ octocode: octocodeConfig }, null, 2);
  const lines = jsonString.split("\n");
  for (const line of lines) {
    const highlighted = line.replace(/"([^"]+)":/g, `${c("cyan", '"$1"')}:`).replace(/: "([^"]+)"/g, `: ${c("green", '"$1"')}`).replace(/: (\d+)/g, `: ${c("yellow", "$1")}`).replace(/: (true|false)/g, `: ${c("magenta", "$1")}`);
    console.log(`  ${highlighted}`);
  }
  console.log();
  console.log(c("blue", "━".repeat(66)));
  await promptOpenConfigFile(configPath);
}
function getExampleValue(option) {
  switch (option.id) {
    case "enableLocal":
      return "ENABLE_LOCAL=1";
    case "githubApiUrl":
      return "GITHUB_API_URL=https://github.mycompany.com/api/v3";
    case "toolsToRun":
      return "TOOLS_TO_RUN=githubSearchCode,githubGetFileContent";
    case "enableTools":
      return "ENABLE_TOOLS=localSearchCode,localFindFiles";
    case "disableTools":
      return "DISABLE_TOOLS=githubSearchPullRequests";
    case "requestTimeout":
      return "REQUEST_TIMEOUT=60000";
    case "maxRetries":
      return "MAX_RETRIES=5";
    default:
      return `${option.envVar}=${option.defaultValue}`;
  }
}
function getDisplayDefault(option) {
  if (option.type === "array") {
    return option.id === "toolsToRun" ? "(all tools)" : "(none)";
  }
  return option.defaultValue;
}
function showConfigInfo() {
  console.log();
  console.log(`  ${bold("All Available Configuration Options")}`);
  console.log();
  console.log(
    `  ${dim("These options can be set as environment variables in your MCP config.")}`
  );
  console.log(
    `  ${dim('Add them to the "env" object in your octocode server configuration.')}`
  );
  console.log();
  console.log(`  ${dim("Example config:")}`);
  console.log(`  ${dim("{")}
  ${dim('  "mcpServers": {')}
  ${dim('    "octocode": {')}
  ${dim('      "command": "npx",')}
  ${dim('      "args": ["octocode-mcp@latest"],')}
  ${c("green", '      "env": { "ENABLE_LOCAL": "1" }')}
  ${dim("    }")}
  ${dim("  }")}
  ${dim("}")}`);
  console.log();
  console.log(c("blue", "━".repeat(66)));
  console.log();
  for (const option of ALL_CONFIG_OPTIONS) {
    const typeColor = option.type === "boolean" ? "green" : option.type === "number" ? "yellow" : option.type === "array" ? "magenta" : "cyan";
    console.log(`  ${c("cyan", option.envVar)} ${dim(`(${option.type})`)}`);
    console.log(`    ${option.description}`);
    console.log(`    ${dim("Default:")} ${getDisplayDefault(option)}`);
    console.log(
      `    ${dim("Example:")} ${c(typeColor, getExampleValue(option))}`
    );
    console.log();
  }
}
function getSkillsState() {
  const srcDir = getSkillsSourceDir$1();
  const destDir = getSkillsDestDir$1();
  if (!dirExists(srcDir)) {
    return {
      sourceExists: false,
      destDir,
      skills: [],
      installedCount: 0,
      notInstalledCount: 0,
      allInstalled: false,
      hasSkills: false
    };
  }
  const availableSkills = listSubdirectories(srcDir).filter(
    (name) => !name.startsWith(".")
  );
  const skills = availableSkills.map((skill) => ({
    name: skill,
    installed: dirExists(path.join(destDir, skill)),
    srcPath: path.join(srcDir, skill),
    destPath: path.join(destDir, skill)
  }));
  const installedCount = skills.filter((s) => s.installed).length;
  const notInstalledCount = skills.filter((s) => !s.installed).length;
  return {
    sourceExists: true,
    destDir,
    skills,
    installedCount,
    notInstalledCount,
    allInstalled: notInstalledCount === 0 && skills.length > 0,
    hasSkills: skills.length > 0
  };
}
function getOctocodeState() {
  const allClients = getAllClientInstallStatus();
  const installedClients = allClients.filter((c2) => c2.octocodeInstalled);
  const availableClients = allClients.filter(
    (c2) => c2.configExists && !c2.octocodeInstalled
  );
  return {
    installedClients,
    availableClients,
    isInstalled: installedClients.length > 0,
    hasMoreToInstall: availableClients.length > 0
  };
}
function getAppState() {
  return {
    octocode: getOctocodeState(),
    skills: getSkillsState(),
    currentClient: detectCurrentClient(),
    githubAuth: checkGitHubAuth()
  };
}
function getClientNames(clients) {
  return clients.map((c2) => MCP_CLIENTS[c2.client]?.name || c2.client).join(", ");
}
function formatPath(p) {
  if (p.startsWith(HOME)) {
    return "~" + p.slice(HOME.length);
  }
  return p;
}
function buildSkillsMenuItem(skills) {
  if (!skills.sourceExists || !skills.hasSkills) {
    return {
      name: "📚 Skills",
      value: "skills",
      description: "No skills available"
    };
  }
  if (skills.allInstalled) {
    return {
      name: `📚 Skills ${c("green", "✓")}`,
      value: "skills",
      description: formatPath(skills.destDir)
    };
  }
  if (skills.installedCount > 0) {
    return {
      name: "📚 Skills",
      value: "skills",
      description: `${skills.installedCount} installed, ${skills.notInstalledCount} available`
    };
  }
  return {
    name: "📚 Install Skills",
    value: "skills",
    description: "Install Octocode skills for Claude Code"
  };
}
async function showMainMenu(state) {
  if (state.octocode.isInstalled) {
    const names = getClientNames(state.octocode.installedClients);
    console.log(`  ${c("green", "✓")} Installed in: ${c("cyan", names)}`);
  }
  if (state.githubAuth.authenticated) {
    console.log(
      `  ${c("green", "✓")} GitHub: ${c("cyan", state.githubAuth.username || "authenticated")}`
    );
  } else if (state.githubAuth.installed) {
    console.log(
      `  ${c("yellow", "⚠")} GitHub: ${c("yellow", "not authenticated")}`
    );
  } else {
    console.log(
      `  ${c("yellow", "⚠")} GitHub CLI: ${c("yellow", "not installed")}`
    );
  }
  const choices = [];
  if (state.octocode.isInstalled) {
    choices.push({
      name: "⚙️  Configure Options",
      value: "conf"
    });
    if (state.octocode.hasMoreToInstall) {
      const availableNames = getClientNames(state.octocode.availableClients);
      choices.push({
        name: "📦 Install to more clients",
        value: "install",
        description: `Available: ${availableNames}`
      });
    }
  } else {
    choices.push({
      name: "📦 Install octocode-mcp",
      value: "install",
      description: "Install MCP server for Cursor, Claude Desktop, and more"
    });
  }
  choices.push(buildSkillsMenuItem(state.skills));
  choices.push(
    new Separator()
  );
  choices.push({
    name: "🚪 Exit",
    value: "exit",
    description: "Quit the application"
  });
  choices.push(
    new Separator(" ")
  );
  choices.push(
    new Separator(
      `  ${c("yellow", "For checking node status in your system use")} ${c("cyan", "npx node-doctor")}`
    )
  );
  choices.push(
    new Separator(
      c("magenta", `  ─── 🔍🐙 ${bold("https://octocode.ai")} ───`)
    )
  );
  const choice = await select({
    message: "What would you like to do?",
    choices,
    pageSize: 10,
    loop: false,
    theme: {
      prefix: "  ",
      style: {
        highlight: (text) => c("magenta", text),
        message: (text) => bold(text)
      }
    }
  });
  return choice;
}
function getSkillsSourceDir$1() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..", "skills");
}
function getSkillsDestDir$1() {
  return path.join(HOME, ".claude", "skills");
}
async function pressEnterToContinue() {
  console.log();
  await input({
    message: dim("Press Enter to continue..."),
    default: ""
  });
}
async function showSkillsMenu(hasUninstalled) {
  const choices = [];
  if (hasUninstalled) {
    choices.push({
      name: "📥 Install skills",
      value: "install",
      description: "Install Octocode skills to Claude Code"
    });
  }
  choices.push({
    name: "📋 View skills status",
    value: "view",
    description: "Show installed and available skills"
  });
  choices.push(
    new Separator()
  );
  choices.push({
    name: `${c("dim", "← Back to main menu")}`,
    value: "back"
  });
  const choice = await select({
    message: "Skills Options:",
    choices,
    pageSize: 10,
    loop: false,
    theme: {
      prefix: "  ",
      style: {
        highlight: (text) => c("magenta", text),
        message: (text) => bold(text)
      }
    }
  });
  return choice;
}
function getSkillsInfo() {
  const srcDir = getSkillsSourceDir$1();
  const destDir = getSkillsDestDir$1();
  if (!dirExists(srcDir)) {
    return {
      srcDir,
      destDir,
      skillsStatus: [],
      notInstalled: [],
      sourceExists: false
    };
  }
  const availableSkills = listSubdirectories(srcDir).filter(
    (name) => !name.startsWith(".")
  );
  const skillsStatus = availableSkills.map((skill) => ({
    name: skill,
    installed: dirExists(path.join(destDir, skill)),
    srcPath: path.join(srcDir, skill),
    destPath: path.join(destDir, skill)
  }));
  const notInstalled = skillsStatus.filter((s) => !s.installed);
  return { srcDir, destDir, skillsStatus, notInstalled, sourceExists: true };
}
function showSkillsStatus(info) {
  const { destDir, skillsStatus, notInstalled } = info;
  if (skillsStatus.length === 0) {
    console.log(`  ${dim("No skills available.")}`);
    console.log();
    return;
  }
  console.log(`  ${bold("Skills:")}`);
  console.log();
  for (const skill of skillsStatus) {
    if (skill.installed) {
      console.log(
        `    ${c("green", "✓")} ${skill.name} - ${c("green", "installed")}`
      );
    } else {
      console.log(
        `    ${c("yellow", "○")} ${skill.name} - ${dim("not installed")}`
      );
    }
  }
  console.log();
  console.log(`  ${bold("Installation path:")}`);
  console.log(`  ${c("cyan", destDir)}`);
  console.log();
  if (notInstalled.length === 0) {
    console.log(`  ${c("green", "✓")} All skills are installed!`);
  } else {
    console.log(
      `  ${c("yellow", "ℹ")} ${notInstalled.length} skill(s) not installed`
    );
  }
  console.log();
}
async function installSkills(info) {
  const { destDir, notInstalled } = info;
  if (notInstalled.length === 0) {
    console.log(`  ${c("green", "✓")} All skills are already installed!`);
    console.log();
    console.log(`  ${bold("Installation path:")}`);
    console.log(`  ${c("cyan", destDir)}`);
    console.log();
    await pressEnterToContinue();
    return true;
  }
  console.log(`  ${bold("Skills to install:")}`);
  console.log();
  for (const skill of notInstalled) {
    console.log(`    ${c("yellow", "○")} ${skill.name}`);
  }
  console.log();
  console.log(`  ${bold("Installation path:")}`);
  console.log(`  ${c("cyan", destDir)}`);
  console.log();
  const choice = await select({
    message: `Install ${notInstalled.length} skill(s)?`,
    choices: [
      {
        name: `${c("green", "✓")} Yes, install skills`,
        value: "install"
      },
      new Separator(),
      {
        name: `${c("dim", "← Back to skills menu")}`,
        value: "back"
      }
    ],
    loop: false
  });
  if (choice === "back") {
    return false;
  }
  console.log();
  const spinner = new Spinner("Installing skills...").start();
  let installedCount = 0;
  const failed = [];
  for (const skill of notInstalled) {
    if (copyDirectory(skill.srcPath, skill.destPath)) {
      installedCount++;
    } else {
      failed.push(skill.name);
    }
  }
  if (failed.length === 0) {
    spinner.succeed("Skills installed!");
  } else {
    spinner.warn("Some skills failed to install");
  }
  console.log();
  if (installedCount > 0) {
    console.log(`  ${c("green", "✓")} Installed ${installedCount} skill(s)`);
    console.log(`  ${dim("Location:")} ${c("cyan", destDir)}`);
  }
  if (failed.length > 0) {
    console.log(`  ${c("red", "✗")} Failed: ${failed.join(", ")}`);
  }
  console.log();
  if (installedCount > 0) {
    console.log(`  ${bold("Skills are now available in Claude Code!")}`);
    console.log();
  }
  await pressEnterToContinue();
  return true;
}
async function runSkillsFlow() {
  await loadInquirer();
  console.log();
  console.log(c("blue", "━".repeat(66)));
  console.log(`  📚 ${bold("Octocode Skills for Claude Code")}`);
  console.log(c("blue", "━".repeat(66)));
  console.log();
  let info = getSkillsInfo();
  if (!info.sourceExists) {
    console.log(`  ${c("yellow", "⚠")} Skills source directory not found.`);
    console.log(`  ${dim("This may happen if running from source.")}`);
    console.log();
    await pressEnterToContinue();
    return;
  }
  if (info.skillsStatus.length === 0) {
    console.log(`  ${dim("No skills available.")}`);
    console.log();
    await pressEnterToContinue();
    return;
  }
  let inSkillsMenu = true;
  while (inSkillsMenu) {
    info = getSkillsInfo();
    const choice = await showSkillsMenu(info.notInstalled.length > 0);
    switch (choice) {
      case "install": {
        const installed = await installSkills(info);
        if (installed) {
          continue;
        }
        break;
      }
      case "view":
        showSkillsStatus(info);
        await pressEnterToContinue();
        break;
      case "back":
      default:
        inSkillsMenu = false;
        break;
    }
  }
}
async function handleMenuChoice(choice) {
  switch (choice) {
    case "install":
      await runInstallFlow();
      return true;
    case "skills":
      await runSkillsFlow();
      return true;
    case "conf":
      await runConfigOptionsFlow();
      return true;
    case "exit":
      printGoodbye();
      return false;
    default:
      return true;
  }
}
async function runMenuLoop() {
  let firstRun = true;
  let running = true;
  while (running) {
    if (!firstRun) {
      clearScreen();
      printWelcome();
    }
    firstRun = false;
    const state = getAppState();
    const choice = await showMainMenu(state);
    running = await handleMenuChoice(choice);
  }
}
const OPTIONS_WITH_VALUES = /* @__PURE__ */ new Set(["ide", "method", "output", "o"]);
function parseArgs(argv = process.argv.slice(2)) {
  const result = {
    command: null,
    args: [],
    options: {}
  };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      if (value !== void 0) {
        result.options[key] = value;
      } else if (OPTIONS_WITH_VALUES.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        result.options[key] = argv[i + 1];
        i++;
      } else {
        result.options[key] = true;
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const flags = arg.slice(1);
      const lastFlag = flags[flags.length - 1];
      if (flags.length === 1 && OPTIONS_WITH_VALUES.has(lastFlag) && i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        result.options[lastFlag] = argv[i + 1];
        i++;
      } else {
        for (const flag of flags) {
          result.options[flag] = true;
        }
      }
    } else if (!result.command) {
      result.command = arg;
    } else {
      result.args.push(arg);
    }
    i++;
  }
  return result;
}
function hasHelpFlag(args) {
  return Boolean(args.options["help"] || args.options["h"]);
}
function hasVersionFlag(args) {
  return Boolean(args.options["version"] || args.options["v"]);
}
function printNodeDoctorHintCLI() {
  console.log(
    `  ${dim("For deeper diagnostics:")} ${c("cyan", "npx node-doctor")}`
  );
  console.log();
}
const installCommand = {
  name: "install",
  aliases: ["i"],
  description: "Install octocode-mcp for an IDE",
  usage: "octocode install --ide <cursor|claude> --method <npx|direct>",
  options: [
    {
      name: "ide",
      description: "IDE to configure (cursor or claude)",
      hasValue: true
    },
    {
      name: "method",
      short: "m",
      description: "Installation method (npx or direct)",
      hasValue: true,
      default: "npx"
    },
    {
      name: "force",
      short: "f",
      description: "Overwrite existing configuration"
    }
  ],
  handler: async (args) => {
    const ide = args.options["ide"];
    const method = args.options["method"] || "npx";
    const force = Boolean(args.options["force"] || args.options["f"]);
    if (method === "npx") {
      const nodeCheck = checkNodeInPath();
      const npmCheck = checkNpmInPath();
      if (!nodeCheck.installed) {
        console.log();
        console.log(
          `  ${c("red", "✗")} Node.js is ${c("red", "not found in PATH")}`
        );
        console.log(
          `  ${dim("Node.js is required for npx installation method.")}`
        );
        console.log();
        printNodeDoctorHintCLI();
        process.exitCode = 1;
        return;
      }
      if (!npmCheck.installed) {
        console.log();
        console.log(
          `  ${c("yellow", "⚠")} npm is ${c("yellow", "not found in PATH")}`
        );
        console.log(`  ${dim("npm is required for npx installation method.")}`);
        console.log();
        printNodeDoctorHintCLI();
        process.exitCode = 1;
        return;
      }
    }
    if (!ide) {
      const available = detectAvailableIDEs();
      console.log();
      console.log(
        `  ${c("red", "✗")} Missing required option: ${c("cyan", "--ide")}`
      );
      console.log();
      if (available.length > 0) {
        console.log(`  ${bold("Available IDEs:")}`);
        for (const availableIde of available) {
          console.log(`    ${c("cyan", "•")} ${availableIde}`);
        }
      } else {
        console.log(`  ${c("yellow", "⚠")} No supported IDEs detected.`);
        console.log(`  ${dim("Install Cursor or Claude Desktop first.")}`);
      }
      console.log();
      console.log(
        `  ${dim("Usage:")} octocode install --ide cursor --method npx`
      );
      console.log();
      process.exitCode = 1;
      return;
    }
    if (!["cursor", "claude"].includes(ide)) {
      console.log();
      console.log(`  ${c("red", "✗")} Invalid IDE: ${ide}`);
      console.log(`  ${dim("Supported:")} cursor, claude`);
      console.log();
      process.exitCode = 1;
      return;
    }
    if (!["npx", "direct"].includes(method)) {
      console.log();
      console.log(`  ${c("red", "✗")} Invalid method: ${method}`);
      console.log(`  ${dim("Supported:")} npx, direct`);
      console.log();
      process.exitCode = 1;
      return;
    }
    const preview = getInstallPreview(ide, method);
    if (preview.action === "override" && !force) {
      console.log();
      console.log(`  ${c("yellow", "⚠")} Octocode is already configured.`);
      console.log(
        `  ${dim("Use")} ${c("cyan", "--force")} ${dim("to overwrite.")}`
      );
      console.log();
      process.exitCode = 1;
      return;
    }
    console.log();
    console.log(`  ${bold("Installing octocode-mcp")}`);
    console.log(`    ${dim("IDE:")}    ${IDE_INFO[ide].name}`);
    console.log(`    ${dim("Method:")} ${INSTALL_METHOD_INFO[method].name}`);
    console.log(`    ${dim("Action:")} ${preview.action.toUpperCase()}`);
    console.log();
    const spinner = new Spinner("Writing configuration...").start();
    const result = installOctocode({ ide, method, force });
    if (result.success) {
      spinner.succeed("Installation complete!");
      console.log();
      console.log(
        `  ${c("green", "✓")} Config saved to: ${preview.configPath}`
      );
      if (result.backupPath) {
        console.log(`  ${dim("Backup:")} ${result.backupPath}`);
      }
      console.log();
      console.log(
        `  ${bold("Next:")} Restart ${IDE_INFO[ide].name} to activate.`
      );
      console.log();
    } else {
      spinner.fail("Installation failed");
      console.log();
      if (result.error) {
        console.log(`  ${c("red", "✗")} ${result.error}`);
      }
      console.log();
      process.exitCode = 1;
    }
  }
};
const authCommand = {
  name: "auth",
  aliases: ["a", "gh"],
  description: "Check GitHub CLI authentication status",
  usage: "octocode auth",
  handler: async () => {
    console.log();
    console.log(`  ${bold("🔐 GitHub CLI Authentication")}`);
    console.log();
    const status = checkGitHubAuth();
    if (!status.installed) {
      console.log(
        `  ${c("red", "✗")} GitHub CLI is ${c("red", "not installed")}`
      );
      console.log();
      console.log(`  ${bold("To install:")}`);
      console.log(`    ${c("cyan", "→")} ${c("underscore", GH_CLI_URL)}`);
      console.log();
      process.exitCode = 1;
      return;
    }
    const version = getGitHubCLIVersion();
    console.log(
      `  ${c("green", "✓")} GitHub CLI installed` + (version ? dim(` (v${version})`) : "")
    );
    if (status.authenticated) {
      console.log(
        `  ${c("green", "✓")} Authenticated as ${c("cyan", status.username || "unknown")}`
      );
      console.log();
    } else {
      console.log(`  ${c("yellow", "⚠")} ${c("yellow", "Not authenticated")}`);
      console.log();
      console.log(`  ${bold("To authenticate:")}`);
      console.log(
        `    ${c("cyan", "→")} ${c("yellow", getAuthLoginCommand())}`
      );
      console.log();
      process.exitCode = 1;
    }
  }
};
function getSkillsSourceDir() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..", "..", "skills");
}
function getSkillsDestDir() {
  return path.join(HOME, ".claude", "skills");
}
const skillsCommand = {
  name: "skills",
  aliases: ["sk"],
  description: "Install Octocode skills for Claude Code",
  usage: "octocode skills [install|list]",
  options: [
    {
      name: "force",
      short: "f",
      description: "Overwrite existing skills"
    }
  ],
  handler: async (args) => {
    const subcommand = args.args[0] || "list";
    const force = Boolean(args.options["force"] || args.options["f"]);
    const srcDir = getSkillsSourceDir();
    const destDir = getSkillsDestDir();
    if (!dirExists(srcDir)) {
      console.log();
      console.log(`  ${c("red", "✗")} Skills directory not found`);
      console.log(`  ${dim("Expected:")} ${srcDir}`);
      console.log();
      process.exitCode = 1;
      return;
    }
    const availableSkills = listSubdirectories(srcDir).filter(
      (name) => !name.startsWith(".")
    );
    if (subcommand === "list") {
      console.log();
      console.log(`  ${bold("📚 Available Octocode Skills")}`);
      console.log();
      if (availableSkills.length === 0) {
        console.log(`  ${dim("No skills available.")}`);
      } else {
        for (const skill of availableSkills) {
          const installed = dirExists(path.join(destDir, skill));
          const status = installed ? c("green", "✓ installed") : dim("not installed");
          console.log(`  ${c("cyan", "•")} ${skill} ${status}`);
        }
      }
      console.log();
      console.log(`  ${dim("To install:")} octocode skills install`);
      console.log(`  ${dim("Destination:")} ${destDir}`);
      console.log();
      return;
    }
    if (subcommand === "install") {
      console.log();
      console.log(`  ${bold("📦 Installing Octocode Skills")}`);
      console.log();
      if (availableSkills.length === 0) {
        console.log(`  ${c("yellow", "⚠")} No skills to install.`);
        console.log();
        return;
      }
      const spinner = new Spinner("Installing skills...").start();
      let installed = 0;
      let skipped = 0;
      for (const skill of availableSkills) {
        const skillSrc = path.join(srcDir, skill);
        const skillDest = path.join(destDir, skill);
        if (dirExists(skillDest) && !force) {
          skipped++;
          continue;
        }
        if (copyDirectory(skillSrc, skillDest)) {
          installed++;
        }
      }
      spinner.succeed("Skills installation complete!");
      console.log();
      if (installed > 0) {
        console.log(
          `  ${c("green", "✓")} Installed ${installed} skill(s) to ${destDir}`
        );
      }
      if (skipped > 0) {
        console.log(
          `  ${c("yellow", "⚠")} Skipped ${skipped} existing skill(s)`
        );
        console.log(
          `  ${dim("Use")} ${c("cyan", "--force")} ${dim("to overwrite.")}`
        );
      }
      console.log();
      console.log(`  ${bold("Skills are now available in Claude Code!")}`);
      console.log();
      return;
    }
    console.log();
    console.log(`  ${c("red", "✗")} Unknown subcommand: ${subcommand}`);
    console.log(`  ${dim("Usage:")} octocode skills [install|list]`);
    console.log();
    process.exitCode = 1;
  }
};
const commands = [
  installCommand,
  authCommand,
  skillsCommand
];
function findCommand(name) {
  return commands.find((cmd) => cmd.name === name || cmd.aliases?.includes(name));
}
function showHelp() {
  console.log();
  console.log(
    `  ${c("magenta", bold("🔍🐙 Octocode CLI"))} - Install and configure octocode-mcp`
  );
  console.log();
  console.log(`  ${bold("USAGE")}`);
  console.log(`    ${c("magenta", "octocode")} [command] [options]`);
  console.log();
  console.log(`  ${bold("COMMANDS")}`);
  console.log(
    `    ${c("magenta", "install")}     Configure octocode-mcp for an IDE`
  );
  console.log(
    `    ${c("magenta", "auth")}        Check GitHub CLI authentication status`
  );
  console.log();
  console.log(`  ${bold("OPTIONS")}`);
  console.log(`    ${c("cyan", "-h, --help")}       Show this help message`);
  console.log(`    ${c("cyan", "-v, --version")}    Show version number`);
  console.log();
  console.log(`  ${bold("EXAMPLES")}`);
  console.log(`    ${dim("# Interactive mode")}`);
  console.log(`    ${c("yellow", "octocode")}`);
  console.log();
  console.log(`    ${dim("# Install for Cursor using npx")}`);
  console.log(
    `    ${c("yellow", "octocode install --ide cursor --method npx")}`
  );
  console.log();
  console.log(`    ${dim("# Install for Claude Desktop using direct method")}`);
  console.log(
    `    ${c("yellow", "octocode install --ide claude --method direct")}`
  );
  console.log();
  console.log(`    ${dim("# Check GitHub authentication")}`);
  console.log(`    ${c("yellow", "octocode auth")}`);
  console.log();
  console.log(c("magenta", `  ─── 🔍🐙 ${bold("https://octocode.ai")} ───`));
  console.log();
}
function showCommandHelp(command) {
  console.log();
  console.log(`  ${c("magenta", bold("🔍🐙 octocode " + command.name))}`);
  console.log();
  console.log(`  ${command.description}`);
  console.log();
  if (command.usage) {
    console.log(`  ${bold("USAGE")}`);
    console.log(`    ${command.usage}`);
    console.log();
  }
  if (command.options && command.options.length > 0) {
    console.log(`  ${bold("OPTIONS")}`);
    for (const opt of command.options) {
      const shortFlag = opt.short ? `-${opt.short}, ` : "    ";
      const longFlag = `--${opt.name}`;
      const valueHint = opt.hasValue ? ` <value>` : "";
      const defaultHint = opt.default !== void 0 ? dim(` (default: ${opt.default})`) : "";
      console.log(
        `    ${c("cyan", shortFlag + longFlag + valueHint)}${defaultHint}`
      );
      console.log(`        ${opt.description}`);
    }
    console.log();
  }
}
function showVersion() {
  const version = "1.0.0";
  console.log(`octocode-cli v${version}`);
}
async function runCLI(argv) {
  const args = parseArgs(argv);
  if (hasHelpFlag(args)) {
    if (args.command) {
      const cmd = findCommand(args.command);
      if (cmd) {
        showCommandHelp(cmd);
        return true;
      }
    }
    showHelp();
    return true;
  }
  if (hasVersionFlag(args)) {
    showVersion();
    return true;
  }
  if (!args.command) {
    return false;
  }
  const command = findCommand(args.command);
  if (!command) {
    console.log();
    console.log(`  Unknown command: ${args.command}`);
    console.log(`  Run 'octocode --help' to see available commands.`);
    console.log();
    process.exitCode = 1;
    return true;
  }
  if (hasHelpFlag(args)) {
    showCommandHelp(command);
    return true;
  }
  await command.handler(args);
  return true;
}
async function runInteractiveMode() {
  await loadInquirer();
  clearScreen();
  printWelcome();
  console.log(c("blue", "━".repeat(66)));
  console.log(`  🔍 ${bold("Environment Check")}`);
  console.log(c("blue", "━".repeat(66)));
  const envStatus = await checkNodeEnvironment();
  printNodeEnvironmentStatus(envStatus);
  printGitHubAuthStatus();
  if (hasEnvironmentIssues(envStatus)) {
    printNodeDoctorHint();
  }
  if (!envStatus.nodeInstalled) {
    console.log(
      `  ${c("red", "✗")} ${bold("Node.js is required to run octocode-mcp")}`
    );
    printNodeDoctorHint();
    printGoodbye();
    return;
  }
  await runMenuLoop();
}
async function main() {
  const handled = await runCLI();
  if (handled) {
    return;
  }
  await runInteractiveMode();
}
function handleTermination() {
  process.stdout.write("\x1B[?25h");
  console.log();
  console.log(dim("  Goodbye! 👋"));
  process.exit(0);
}
process.on("SIGINT", handleTermination);
process.on("SIGTERM", handleTermination);
main().catch((err) => {
  if (err?.name === "ExitPromptError") {
    console.log();
    console.log(dim("  Goodbye! 👋"));
    process.exit(0);
  }
  console.error("Error:", err);
  process.exit(1);
});
