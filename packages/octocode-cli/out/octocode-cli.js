#!/usr/bin/env node
import fs, { existsSync, unlinkSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import os, { homedir } from "node:os";
import path, { join } from "node:path";
import childProcess, { spawnSync, execFile as execFile$2, execSync } from "node:child_process";
import { createDecipheriv, randomBytes, createCipheriv } from "node:crypto";
import process$1 from "node:process";
import { fileURLToPath } from "node:url";
import fs$1, { constants } from "node:fs/promises";
import { promisify } from "node:util";
import { Buffer as Buffer$1 } from "node:buffer";
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
function printFooter() {
  console.log();
  console.log(c("magenta", `  ─── 🔍🐙 ${bold("https://octocode.ai")} ───`));
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
function removeDirectory(dirPath) {
  try {
    if (!dirExists(dirPath)) {
      return false;
    }
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
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
      const customPath = await promptCustomPath$1();
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
    const customPath = await promptCustomPath$1();
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
    const customPath = await promptCustomPath$1();
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
async function promptCustomPath$1() {
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
function getUserAgent() {
  if (typeof navigator === "object" && "userAgent" in navigator) {
    return navigator.userAgent;
  }
  if (typeof process === "object" && process.version !== void 0) {
    return `Node.js/${process.version.substr(1)} (${process.platform}; ${process.arch})`;
  }
  return "<environment undetectable>";
}
var VERSION$2 = "0.0.0-development";
var userAgent = `octokit-endpoint.js/${VERSION$2} ${getUserAgent()}`;
var DEFAULTS = {
  method: "GET",
  baseUrl: "https://api.github.com",
  headers: {
    accept: "application/vnd.github.v3+json",
    "user-agent": userAgent
  },
  mediaType: {
    format: ""
  }
};
function lowercaseKeys(object) {
  if (!object) {
    return {};
  }
  return Object.keys(object).reduce((newObj, key) => {
    newObj[key.toLowerCase()] = object[key];
    return newObj;
  }, {});
}
function isPlainObject$1(value) {
  if (typeof value !== "object" || value === null) return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const Ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return typeof Ctor === "function" && Ctor instanceof Ctor && Function.prototype.call(Ctor) === Function.prototype.call(value);
}
function mergeDeep(defaults, options) {
  const result = Object.assign({}, defaults);
  Object.keys(options).forEach((key) => {
    if (isPlainObject$1(options[key])) {
      if (!(key in defaults)) Object.assign(result, { [key]: options[key] });
      else result[key] = mergeDeep(defaults[key], options[key]);
    } else {
      Object.assign(result, { [key]: options[key] });
    }
  });
  return result;
}
function removeUndefinedProperties(obj) {
  for (const key in obj) {
    if (obj[key] === void 0) {
      delete obj[key];
    }
  }
  return obj;
}
function merge(defaults, route, options) {
  if (typeof route === "string") {
    let [method, url] = route.split(" ");
    options = Object.assign(url ? { method, url } : { url: method }, options);
  } else {
    options = Object.assign({}, route);
  }
  options.headers = lowercaseKeys(options.headers);
  removeUndefinedProperties(options);
  removeUndefinedProperties(options.headers);
  const mergedOptions = mergeDeep(defaults || {}, options);
  if (options.url === "/graphql") {
    if (defaults && defaults.mediaType.previews?.length) {
      mergedOptions.mediaType.previews = defaults.mediaType.previews.filter(
        (preview) => !mergedOptions.mediaType.previews.includes(preview)
      ).concat(mergedOptions.mediaType.previews);
    }
    mergedOptions.mediaType.previews = (mergedOptions.mediaType.previews || []).map((preview) => preview.replace(/-preview/, ""));
  }
  return mergedOptions;
}
function addQueryParameters(url, parameters) {
  const separator = /\?/.test(url) ? "&" : "?";
  const names = Object.keys(parameters);
  if (names.length === 0) {
    return url;
  }
  return url + separator + names.map((name) => {
    if (name === "q") {
      return "q=" + parameters.q.split("+").map(encodeURIComponent).join("+");
    }
    return `${name}=${encodeURIComponent(parameters[name])}`;
  }).join("&");
}
var urlVariableRegex = /\{[^{}}]+\}/g;
function removeNonChars(variableName) {
  return variableName.replace(/(?:^\W+)|(?:(?<!\W)\W+$)/g, "").split(/,/);
}
function extractUrlVariableNames(url) {
  const matches = url.match(urlVariableRegex);
  if (!matches) {
    return [];
  }
  return matches.map(removeNonChars).reduce((a, b) => a.concat(b), []);
}
function omit(object, keysToOmit) {
  const result = { __proto__: null };
  for (const key of Object.keys(object)) {
    if (keysToOmit.indexOf(key) === -1) {
      result[key] = object[key];
    }
  }
  return result;
}
function encodeReserved(str) {
  return str.split(/(%[0-9A-Fa-f]{2})/g).map(function(part) {
    if (!/%[0-9A-Fa-f]/.test(part)) {
      part = encodeURI(part).replace(/%5B/g, "[").replace(/%5D/g, "]");
    }
    return part;
  }).join("");
}
function encodeUnreserved(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, function(c2) {
    return "%" + c2.charCodeAt(0).toString(16).toUpperCase();
  });
}
function encodeValue(operator, value, key) {
  value = operator === "+" || operator === "#" ? encodeReserved(value) : encodeUnreserved(value);
  if (key) {
    return encodeUnreserved(key) + "=" + value;
  } else {
    return value;
  }
}
function isDefined(value) {
  return value !== void 0 && value !== null;
}
function isKeyOperator(operator) {
  return operator === ";" || operator === "&" || operator === "?";
}
function getValues(context, operator, key, modifier) {
  var value = context[key], result = [];
  if (isDefined(value) && value !== "") {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      value = value.toString();
      if (modifier && modifier !== "*") {
        value = value.substring(0, parseInt(modifier, 10));
      }
      result.push(
        encodeValue(operator, value, isKeyOperator(operator) ? key : "")
      );
    } else {
      if (modifier === "*") {
        if (Array.isArray(value)) {
          value.filter(isDefined).forEach(function(value2) {
            result.push(
              encodeValue(operator, value2, isKeyOperator(operator) ? key : "")
            );
          });
        } else {
          Object.keys(value).forEach(function(k) {
            if (isDefined(value[k])) {
              result.push(encodeValue(operator, value[k], k));
            }
          });
        }
      } else {
        const tmp = [];
        if (Array.isArray(value)) {
          value.filter(isDefined).forEach(function(value2) {
            tmp.push(encodeValue(operator, value2));
          });
        } else {
          Object.keys(value).forEach(function(k) {
            if (isDefined(value[k])) {
              tmp.push(encodeUnreserved(k));
              tmp.push(encodeValue(operator, value[k].toString()));
            }
          });
        }
        if (isKeyOperator(operator)) {
          result.push(encodeUnreserved(key) + "=" + tmp.join(","));
        } else if (tmp.length !== 0) {
          result.push(tmp.join(","));
        }
      }
    }
  } else {
    if (operator === ";") {
      if (isDefined(value)) {
        result.push(encodeUnreserved(key));
      }
    } else if (value === "" && (operator === "&" || operator === "?")) {
      result.push(encodeUnreserved(key) + "=");
    } else if (value === "") {
      result.push("");
    }
  }
  return result;
}
function parseUrl(template) {
  return {
    expand: expand.bind(null, template)
  };
}
function expand(template, context) {
  var operators = ["+", "#", ".", "/", ";", "?", "&"];
  template = template.replace(
    /\{([^\{\}]+)\}|([^\{\}]+)/g,
    function(_, expression, literal) {
      if (expression) {
        let operator = "";
        const values = [];
        if (operators.indexOf(expression.charAt(0)) !== -1) {
          operator = expression.charAt(0);
          expression = expression.substr(1);
        }
        expression.split(/,/g).forEach(function(variable) {
          var tmp = /([^:\*]*)(?::(\d+)|(\*))?/.exec(variable);
          values.push(getValues(context, operator, tmp[1], tmp[2] || tmp[3]));
        });
        if (operator && operator !== "+") {
          var separator = ",";
          if (operator === "?") {
            separator = "&";
          } else if (operator !== "#") {
            separator = operator;
          }
          return (values.length !== 0 ? operator : "") + values.join(separator);
        } else {
          return values.join(",");
        }
      } else {
        return encodeReserved(literal);
      }
    }
  );
  if (template === "/") {
    return template;
  } else {
    return template.replace(/\/$/, "");
  }
}
function parse(options) {
  let method = options.method.toUpperCase();
  let url = (options.url || "/").replace(/:([a-z]\w+)/g, "{$1}");
  let headers = Object.assign({}, options.headers);
  let body;
  let parameters = omit(options, [
    "method",
    "baseUrl",
    "url",
    "headers",
    "request",
    "mediaType"
  ]);
  const urlVariableNames = extractUrlVariableNames(url);
  url = parseUrl(url).expand(parameters);
  if (!/^http/.test(url)) {
    url = options.baseUrl + url;
  }
  const omittedParameters = Object.keys(options).filter((option) => urlVariableNames.includes(option)).concat("baseUrl");
  const remainingParameters = omit(parameters, omittedParameters);
  const isBinaryRequest = /application\/octet-stream/i.test(headers.accept);
  if (!isBinaryRequest) {
    if (options.mediaType.format) {
      headers.accept = headers.accept.split(/,/).map(
        (format) => format.replace(
          /application\/vnd(\.\w+)(\.v3)?(\.\w+)?(\+json)?$/,
          `application/vnd$1$2.${options.mediaType.format}`
        )
      ).join(",");
    }
    if (url.endsWith("/graphql")) {
      if (options.mediaType.previews?.length) {
        const previewsFromAcceptHeader = headers.accept.match(/(?<![\w-])[\w-]+(?=-preview)/g) || [];
        headers.accept = previewsFromAcceptHeader.concat(options.mediaType.previews).map((preview) => {
          const format = options.mediaType.format ? `.${options.mediaType.format}` : "+json";
          return `application/vnd.github.${preview}-preview${format}`;
        }).join(",");
      }
    }
  }
  if (["GET", "HEAD"].includes(method)) {
    url = addQueryParameters(url, remainingParameters);
  } else {
    if ("data" in remainingParameters) {
      body = remainingParameters.data;
    } else {
      if (Object.keys(remainingParameters).length) {
        body = remainingParameters;
      }
    }
  }
  if (!headers["content-type"] && typeof body !== "undefined") {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  if (["PATCH", "PUT"].includes(method) && typeof body === "undefined") {
    body = "";
  }
  return Object.assign(
    { method, url, headers },
    typeof body !== "undefined" ? { body } : null,
    options.request ? { request: options.request } : null
  );
}
function endpointWithDefaults(defaults, route, options) {
  return parse(merge(defaults, route, options));
}
function withDefaults$1(oldDefaults, newDefaults) {
  const DEFAULTS2 = merge(oldDefaults, newDefaults);
  const endpoint2 = endpointWithDefaults.bind(null, DEFAULTS2);
  return Object.assign(endpoint2, {
    DEFAULTS: DEFAULTS2,
    defaults: withDefaults$1.bind(null, DEFAULTS2),
    merge: merge.bind(null, DEFAULTS2),
    parse
  });
}
var endpoint = withDefaults$1(null, DEFAULTS);
var fastContentTypeParse = {};
var hasRequiredFastContentTypeParse;
function requireFastContentTypeParse() {
  if (hasRequiredFastContentTypeParse) return fastContentTypeParse;
  hasRequiredFastContentTypeParse = 1;
  const NullObject = function NullObject2() {
  };
  NullObject.prototype = /* @__PURE__ */ Object.create(null);
  const paramRE = /; *([!#$%&'*+.^\w`|~-]+)=("(?:[\v\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u00ff]|\\[\v\u0020-\u00ff])*"|[!#$%&'*+.^\w`|~-]+) */gu;
  const quotedPairRE = /\\([\v\u0020-\u00ff])/gu;
  const mediaTypeRE = /^[!#$%&'*+.^\w|~-]+\/[!#$%&'*+.^\w|~-]+$/u;
  const defaultContentType = { type: "", parameters: new NullObject() };
  Object.freeze(defaultContentType.parameters);
  Object.freeze(defaultContentType);
  function parse2(header) {
    if (typeof header !== "string") {
      throw new TypeError("argument header is required and must be a string");
    }
    let index = header.indexOf(";");
    const type = index !== -1 ? header.slice(0, index).trim() : header.trim();
    if (mediaTypeRE.test(type) === false) {
      throw new TypeError("invalid media type");
    }
    const result = {
      type: type.toLowerCase(),
      parameters: new NullObject()
    };
    if (index === -1) {
      return result;
    }
    let key;
    let match;
    let value;
    paramRE.lastIndex = index;
    while (match = paramRE.exec(header)) {
      if (match.index !== index) {
        throw new TypeError("invalid parameter format");
      }
      index += match[0].length;
      key = match[1].toLowerCase();
      value = match[2];
      if (value[0] === '"') {
        value = value.slice(1, value.length - 1);
        quotedPairRE.test(value) && (value = value.replace(quotedPairRE, "$1"));
      }
      result.parameters[key] = value;
    }
    if (index !== header.length) {
      throw new TypeError("invalid parameter format");
    }
    return result;
  }
  function safeParse(header) {
    if (typeof header !== "string") {
      return defaultContentType;
    }
    let index = header.indexOf(";");
    const type = index !== -1 ? header.slice(0, index).trim() : header.trim();
    if (mediaTypeRE.test(type) === false) {
      return defaultContentType;
    }
    const result = {
      type: type.toLowerCase(),
      parameters: new NullObject()
    };
    if (index === -1) {
      return result;
    }
    let key;
    let match;
    let value;
    paramRE.lastIndex = index;
    while (match = paramRE.exec(header)) {
      if (match.index !== index) {
        return defaultContentType;
      }
      index += match[0].length;
      key = match[1].toLowerCase();
      value = match[2];
      if (value[0] === '"') {
        value = value.slice(1, value.length - 1);
        quotedPairRE.test(value) && (value = value.replace(quotedPairRE, "$1"));
      }
      result.parameters[key] = value;
    }
    if (index !== header.length) {
      return defaultContentType;
    }
    return result;
  }
  fastContentTypeParse.default = { parse: parse2, safeParse };
  fastContentTypeParse.parse = parse2;
  fastContentTypeParse.safeParse = safeParse;
  fastContentTypeParse.defaultContentType = defaultContentType;
  return fastContentTypeParse;
}
var fastContentTypeParseExports = requireFastContentTypeParse();
class RequestError extends Error {
  name;
  /**
   * http status code
   */
  status;
  /**
   * Request options that lead to the error.
   */
  request;
  /**
   * Response object if a response was received
   */
  response;
  constructor(message, statusCode, options) {
    super(message, { cause: options.cause });
    this.name = "HttpError";
    this.status = Number.parseInt(statusCode);
    if (Number.isNaN(this.status)) {
      this.status = 0;
    }
    /* v8 ignore else -- @preserve -- Bug with vitest coverage where it sees an else branch that doesn't exist */
    if ("response" in options) {
      this.response = options.response;
    }
    const requestCopy = Object.assign({}, options.request);
    if (options.request.headers.authorization) {
      requestCopy.headers = Object.assign({}, options.request.headers, {
        authorization: options.request.headers.authorization.replace(
          /(?<! ) .*$/,
          " [REDACTED]"
        )
      });
    }
    requestCopy.url = requestCopy.url.replace(/\bclient_secret=\w+/g, "client_secret=[REDACTED]").replace(/\baccess_token=\w+/g, "access_token=[REDACTED]");
    this.request = requestCopy;
  }
}
var VERSION$1 = "10.0.7";
var defaults_default = {
  headers: {
    "user-agent": `octokit-request.js/${VERSION$1} ${getUserAgent()}`
  }
};
function isPlainObject(value) {
  if (typeof value !== "object" || value === null) return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const Ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return typeof Ctor === "function" && Ctor instanceof Ctor && Function.prototype.call(Ctor) === Function.prototype.call(value);
}
var noop = () => "";
async function fetchWrapper(requestOptions) {
  const fetch2 = requestOptions.request?.fetch || globalThis.fetch;
  if (!fetch2) {
    throw new Error(
      "fetch is not set. Please pass a fetch implementation as new Octokit({ request: { fetch }}). Learn more at https://github.com/octokit/octokit.js/#fetch-missing"
    );
  }
  const log = requestOptions.request?.log || console;
  const parseSuccessResponseBody = requestOptions.request?.parseSuccessResponseBody !== false;
  const body = isPlainObject(requestOptions.body) || Array.isArray(requestOptions.body) ? JSON.stringify(requestOptions.body) : requestOptions.body;
  const requestHeaders = Object.fromEntries(
    Object.entries(requestOptions.headers).map(([name, value]) => [
      name,
      String(value)
    ])
  );
  let fetchResponse;
  try {
    fetchResponse = await fetch2(requestOptions.url, {
      method: requestOptions.method,
      body,
      redirect: requestOptions.request?.redirect,
      headers: requestHeaders,
      signal: requestOptions.request?.signal,
      // duplex must be set if request.body is ReadableStream or Async Iterables.
      // See https://fetch.spec.whatwg.org/#dom-requestinit-duplex.
      ...requestOptions.body && { duplex: "half" }
    });
  } catch (error) {
    let message = "Unknown Error";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        error.status = 500;
        throw error;
      }
      message = error.message;
      if (error.name === "TypeError" && "cause" in error) {
        if (error.cause instanceof Error) {
          message = error.cause.message;
        } else if (typeof error.cause === "string") {
          message = error.cause;
        }
      }
    }
    const requestError = new RequestError(message, 500, {
      request: requestOptions
    });
    requestError.cause = error;
    throw requestError;
  }
  const status = fetchResponse.status;
  const url = fetchResponse.url;
  const responseHeaders = {};
  for (const [key, value] of fetchResponse.headers) {
    responseHeaders[key] = value;
  }
  const octokitResponse = {
    url,
    status,
    headers: responseHeaders,
    data: ""
  };
  if ("deprecation" in responseHeaders) {
    const matches = responseHeaders.link && responseHeaders.link.match(/<([^<>]+)>; rel="deprecation"/);
    const deprecationLink = matches && matches.pop();
    log.warn(
      `[@octokit/request] "${requestOptions.method} ${requestOptions.url}" is deprecated. It is scheduled to be removed on ${responseHeaders.sunset}${deprecationLink ? `. See ${deprecationLink}` : ""}`
    );
  }
  if (status === 204 || status === 205) {
    return octokitResponse;
  }
  if (requestOptions.method === "HEAD") {
    if (status < 400) {
      return octokitResponse;
    }
    throw new RequestError(fetchResponse.statusText, status, {
      response: octokitResponse,
      request: requestOptions
    });
  }
  if (status === 304) {
    octokitResponse.data = await getResponseData(fetchResponse);
    throw new RequestError("Not modified", status, {
      response: octokitResponse,
      request: requestOptions
    });
  }
  if (status >= 400) {
    octokitResponse.data = await getResponseData(fetchResponse);
    throw new RequestError(toErrorMessage(octokitResponse.data), status, {
      response: octokitResponse,
      request: requestOptions
    });
  }
  octokitResponse.data = parseSuccessResponseBody ? await getResponseData(fetchResponse) : fetchResponse.body;
  return octokitResponse;
}
async function getResponseData(response) {
  const contentType = response.headers.get("content-type");
  if (!contentType) {
    return response.text().catch(noop);
  }
  const mimetype = fastContentTypeParseExports.safeParse(contentType);
  if (isJSONResponse(mimetype)) {
    let text = "";
    try {
      text = await response.text();
      return JSON.parse(text);
    } catch (err) {
      return text;
    }
  } else if (mimetype.type.startsWith("text/") || mimetype.parameters.charset?.toLowerCase() === "utf-8") {
    return response.text().catch(noop);
  } else {
    return response.arrayBuffer().catch(
      /* v8 ignore next -- @preserve */
      () => new ArrayBuffer(0)
    );
  }
}
function isJSONResponse(mimetype) {
  return mimetype.type === "application/json" || mimetype.type === "application/scim+json";
}
function toErrorMessage(data) {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return "Unknown error";
  }
  if ("message" in data) {
    const suffix = "documentation_url" in data ? ` - ${data.documentation_url}` : "";
    return Array.isArray(data.errors) ? `${data.message}: ${data.errors.map((v) => JSON.stringify(v)).join(", ")}${suffix}` : `${data.message}${suffix}`;
  }
  return `Unknown error: ${JSON.stringify(data)}`;
}
function withDefaults(oldEndpoint, newDefaults) {
  const endpoint2 = oldEndpoint.defaults(newDefaults);
  const newApi = function(route, parameters) {
    const endpointOptions = endpoint2.merge(route, parameters);
    if (!endpointOptions.request || !endpointOptions.request.hook) {
      return fetchWrapper(endpoint2.parse(endpointOptions));
    }
    const request2 = (route2, parameters2) => {
      return fetchWrapper(
        endpoint2.parse(endpoint2.merge(route2, parameters2))
      );
    };
    Object.assign(request2, {
      endpoint: endpoint2,
      defaults: withDefaults.bind(null, endpoint2)
    });
    return endpointOptions.request.hook(request2, endpointOptions);
  };
  return Object.assign(newApi, {
    endpoint: endpoint2,
    defaults: withDefaults.bind(null, endpoint2)
  });
}
var request = withDefaults(endpoint, defaults_default);
/* v8 ignore next -- @preserve */
/* v8 ignore else -- @preserve */
function requestToOAuthBaseUrl(request2) {
  const endpointDefaults = request2.endpoint.DEFAULTS;
  return /^https:\/\/(api\.)?github\.com$/.test(endpointDefaults.baseUrl) ? "https://github.com" : endpointDefaults.baseUrl.replace("/api/v3", "");
}
async function oauthRequest(request2, route, parameters) {
  const withOAuthParameters = {
    baseUrl: requestToOAuthBaseUrl(request2),
    headers: {
      accept: "application/json"
    },
    ...parameters
  };
  const response = await request2(route, withOAuthParameters);
  if ("error" in response.data) {
    const error = new RequestError(
      `${response.data.error_description} (${response.data.error}, ${response.data.error_uri})`,
      400,
      {
        request: request2.endpoint.merge(
          route,
          withOAuthParameters
        )
      }
    );
    error.response = response;
    throw error;
  }
  return response;
}
async function createDeviceCode(options) {
  const request$1 = options.request || request;
  const parameters = {
    client_id: options.clientId
  };
  if ("scopes" in options && Array.isArray(options.scopes)) {
    parameters.scope = options.scopes.join(" ");
  }
  return oauthRequest(request$1, "POST /login/device/code", parameters);
}
async function exchangeDeviceCode(options) {
  const request$1 = options.request || request;
  const response = await oauthRequest(
    request$1,
    "POST /login/oauth/access_token",
    {
      client_id: options.clientId,
      device_code: options.code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    }
  );
  const authentication = {
    clientType: options.clientType,
    clientId: options.clientId,
    token: response.data.access_token,
    scopes: response.data.scope.split(/\s+/).filter(Boolean)
  };
  if ("clientSecret" in options) {
    authentication.clientSecret = options.clientSecret;
  }
  if (options.clientType === "github-app") {
    if ("refresh_token" in response.data) {
      const apiTimeInMs = new Date(response.headers.date).getTime();
      authentication.refreshToken = response.data.refresh_token, authentication.expiresAt = toTimestamp2(
        apiTimeInMs,
        response.data.expires_in
      ), authentication.refreshTokenExpiresAt = toTimestamp2(
        apiTimeInMs,
        response.data.refresh_token_expires_in
      );
    }
    delete authentication.scopes;
  }
  return { ...response, authentication };
}
function toTimestamp2(apiTimeInMs, expirationInSeconds) {
  return new Date(apiTimeInMs + expirationInSeconds * 1e3).toISOString();
}
async function deleteToken(options) {
  const request$1 = options.request || request;
  const auth2 = btoa(`${options.clientId}:${options.clientSecret}`);
  return request$1(
    "DELETE /applications/{client_id}/token",
    {
      headers: {
        authorization: `basic ${auth2}`
      },
      client_id: options.clientId,
      access_token: options.token
    }
  );
}
async function getOAuthAccessToken(state, options) {
  const cachedAuthentication = getCachedAuthentication(state, options.auth);
  if (cachedAuthentication) return cachedAuthentication;
  const { data: verification } = await createDeviceCode({
    clientType: state.clientType,
    clientId: state.clientId,
    request: options.request || state.request,
    // @ts-expect-error the extra code to make TS happy is not worth it
    scopes: options.auth.scopes || state.scopes
  });
  await state.onVerification(verification);
  const authentication = await waitForAccessToken(
    options.request || state.request,
    state.clientId,
    state.clientType,
    verification
  );
  state.authentication = authentication;
  return authentication;
}
function getCachedAuthentication(state, auth2) {
  if (auth2.refresh === true) return false;
  if (!state.authentication) return false;
  if (state.clientType === "github-app") {
    return state.authentication;
  }
  const authentication = state.authentication;
  const newScope = ("scopes" in auth2 && auth2.scopes || state.scopes).join(
    " "
  );
  const currentScope = authentication.scopes.join(" ");
  return newScope === currentScope ? authentication : false;
}
async function wait(seconds) {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1e3));
}
async function waitForAccessToken(request2, clientId, clientType, verification) {
  try {
    const options = {
      clientId,
      request: request2,
      code: verification.device_code
    };
    const { authentication } = clientType === "oauth-app" ? await exchangeDeviceCode({
      ...options,
      clientType: "oauth-app"
    }) : await exchangeDeviceCode({
      ...options,
      clientType: "github-app"
    });
    return {
      type: "token",
      tokenType: "oauth",
      ...authentication
    };
  } catch (error) {
    if (!error.response) throw error;
    const errorType = error.response.data.error;
    if (errorType === "authorization_pending") {
      await wait(verification.interval);
      return waitForAccessToken(request2, clientId, clientType, verification);
    }
    if (errorType === "slow_down") {
      await wait(verification.interval + 7);
      return waitForAccessToken(request2, clientId, clientType, verification);
    }
    throw error;
  }
}
async function auth(state, authOptions) {
  return getOAuthAccessToken(state, {
    auth: authOptions
  });
}
async function hook(state, request2, route, parameters) {
  let endpoint2 = request2.endpoint.merge(
    route,
    parameters
  );
  if (/\/login\/(oauth\/access_token|device\/code)$/.test(endpoint2.url)) {
    return request2(endpoint2);
  }
  const { token } = await getOAuthAccessToken(state, {
    request: request2,
    auth: { type: "oauth" }
  });
  endpoint2.headers.authorization = `token ${token}`;
  return request2(endpoint2);
}
var VERSION = "0.0.0-development";
function createOAuthDeviceAuth(options) {
  const requestWithDefaults = options.request || request.defaults({
    headers: {
      "user-agent": `octokit-auth-oauth-device.js/${VERSION} ${getUserAgent()}`
    }
  });
  const { request: request$1 = requestWithDefaults, ...otherOptions } = options;
  const state = options.clientType === "github-app" ? {
    ...otherOptions,
    clientType: "github-app",
    request: request$1
  } : {
    ...otherOptions,
    clientType: "oauth-app",
    request: request$1,
    scopes: options.scopes || []
  };
  if (!options.clientId) {
    throw new Error(
      '[@octokit/auth-oauth-device] "clientId" option must be set (https://github.com/octokit/auth-oauth-device.js#usage)'
    );
  }
  if (!options.onVerification) {
    throw new Error(
      '[@octokit/auth-oauth-device] "onVerification" option must be a function (https://github.com/octokit/auth-oauth-device.js#usage)'
    );
  }
  return Object.assign(auth.bind(null, state), {
    hook: hook.bind(null, state)
  });
}
let isDockerCached;
function hasDockerEnv() {
  try {
    fs.statSync("/.dockerenv");
    return true;
  } catch {
    return false;
  }
}
function hasDockerCGroup() {
  try {
    return fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
  } catch {
    return false;
  }
}
function isDocker() {
  if (isDockerCached === void 0) {
    isDockerCached = hasDockerEnv() || hasDockerCGroup();
  }
  return isDockerCached;
}
let cachedResult;
const hasContainerEnv = () => {
  try {
    fs.statSync("/run/.containerenv");
    return true;
  } catch {
    return false;
  }
};
function isInsideContainer() {
  if (cachedResult === void 0) {
    cachedResult = hasContainerEnv() || isDocker();
  }
  return cachedResult;
}
const isWsl = () => {
  if (process$1.platform !== "linux") {
    return false;
  }
  if (os.release().toLowerCase().includes("microsoft")) {
    if (isInsideContainer()) {
      return false;
    }
    return true;
  }
  try {
    return fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft") ? !isInsideContainer() : false;
  } catch {
    return false;
  }
};
const isWsl$1 = process$1.env.__IS_WSL_TEST__ ? isWsl : isWsl();
const execFile$1 = promisify(childProcess.execFile);
const powerShellPath$1 = () => `${process$1.env.SYSTEMROOT || process$1.env.windir || String.raw`C:\Windows`}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
const executePowerShell = async (command, options = {}) => {
  const {
    powerShellPath: psPath,
    ...execFileOptions
  } = options;
  const encodedCommand = executePowerShell.encodeCommand(command);
  return execFile$1(
    psPath ?? powerShellPath$1(),
    [
      ...executePowerShell.argumentsPrefix,
      encodedCommand
    ],
    {
      encoding: "utf8",
      ...execFileOptions
    }
  );
};
executePowerShell.argumentsPrefix = [
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy",
  "Bypass",
  "-EncodedCommand"
];
executePowerShell.encodeCommand = (command) => Buffer$1.from(command, "utf16le").toString("base64");
executePowerShell.escapeArgument = (value) => `'${String(value).replaceAll("'", "''")}'`;
function parseMountPointFromConfig(content) {
  for (const line of content.split("\n")) {
    if (/^\s*#/.test(line)) {
      continue;
    }
    const match = /^\s*root\s*=\s*(?<mountPoint>"[^"]*"|'[^']*'|[^#]*)/.exec(line);
    if (!match) {
      continue;
    }
    return match.groups.mountPoint.trim().replaceAll(/^["']|["']$/g, "");
  }
}
const execFile = promisify(childProcess.execFile);
const wslDrivesMountPoint = /* @__PURE__ */ (() => {
  const defaultMountPoint = "/mnt/";
  let mountPoint;
  return async function() {
    if (mountPoint) {
      return mountPoint;
    }
    const configFilePath = "/etc/wsl.conf";
    let isConfigFileExists = false;
    try {
      await fs$1.access(configFilePath, constants.F_OK);
      isConfigFileExists = true;
    } catch {
    }
    if (!isConfigFileExists) {
      return defaultMountPoint;
    }
    const configContent = await fs$1.readFile(configFilePath, { encoding: "utf8" });
    const parsedMountPoint = parseMountPointFromConfig(configContent);
    if (parsedMountPoint === void 0) {
      return defaultMountPoint;
    }
    mountPoint = parsedMountPoint;
    mountPoint = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
    return mountPoint;
  };
})();
const powerShellPathFromWsl = async () => {
  const mountPoint = await wslDrivesMountPoint();
  return `${mountPoint}c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`;
};
const powerShellPath = isWsl$1 ? powerShellPathFromWsl : powerShellPath$1;
let canAccessPowerShellPromise;
const canAccessPowerShell = async () => {
  canAccessPowerShellPromise ??= (async () => {
    try {
      const psPath = await powerShellPath();
      await fs$1.access(psPath, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  })();
  return canAccessPowerShellPromise;
};
const wslDefaultBrowser = async () => {
  const psPath = await powerShellPath();
  const command = String.raw`(Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice").ProgId`;
  const { stdout } = await executePowerShell(command, { powerShellPath: psPath });
  return stdout.trim();
};
const convertWslPathToWindows = async (path2) => {
  if (/^[a-z]+:\/\//i.test(path2)) {
    return path2;
  }
  try {
    const { stdout } = await execFile("wslpath", ["-aw", path2], { encoding: "utf8" });
    return stdout.trim();
  } catch {
    return path2;
  }
};
function defineLazyProperty(object, propertyName, valueGetter) {
  const define = (value) => Object.defineProperty(object, propertyName, { value, enumerable: true, writable: true });
  Object.defineProperty(object, propertyName, {
    configurable: true,
    enumerable: true,
    get() {
      const result = valueGetter();
      define(result);
      return result;
    },
    set(value) {
      define(value);
    }
  });
  return object;
}
const execFileAsync$3 = promisify(execFile$2);
async function defaultBrowserId() {
  if (process$1.platform !== "darwin") {
    throw new Error("macOS only");
  }
  const { stdout } = await execFileAsync$3("defaults", ["read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"]);
  const match = /LSHandlerRoleAll = "(?!-)(?<id>[^"]+?)";\s+?LSHandlerURLScheme = (?:http|https);/.exec(stdout);
  const browserId = match?.groups.id ?? "com.apple.Safari";
  if (browserId === "com.apple.safari") {
    return "com.apple.Safari";
  }
  return browserId;
}
const execFileAsync$2 = promisify(execFile$2);
async function runAppleScript(script, { humanReadableOutput = true, signal } = {}) {
  if (process$1.platform !== "darwin") {
    throw new Error("macOS only");
  }
  const outputArguments = humanReadableOutput ? [] : ["-ss"];
  const execOptions = {};
  if (signal) {
    execOptions.signal = signal;
  }
  const { stdout } = await execFileAsync$2("osascript", ["-e", script, outputArguments], execOptions);
  return stdout.trim();
}
async function bundleName(bundleId) {
  return runAppleScript(`tell application "Finder" to set app_path to application file id "${bundleId}" as string
tell application "System Events" to get value of property list item "CFBundleName" of property list file (app_path & ":Contents:Info.plist")`);
}
const execFileAsync$1 = promisify(execFile$2);
const windowsBrowserProgIds = {
  MSEdgeHTM: { name: "Edge", id: "com.microsoft.edge" },
  // The missing `L` is correct.
  MSEdgeBHTML: { name: "Edge Beta", id: "com.microsoft.edge.beta" },
  MSEdgeDHTML: { name: "Edge Dev", id: "com.microsoft.edge.dev" },
  AppXq0fevzme2pys62n3e0fbqa7peapykr8v: { name: "Edge", id: "com.microsoft.edge.old" },
  ChromeHTML: { name: "Chrome", id: "com.google.chrome" },
  ChromeBHTML: { name: "Chrome Beta", id: "com.google.chrome.beta" },
  ChromeDHTML: { name: "Chrome Dev", id: "com.google.chrome.dev" },
  ChromiumHTM: { name: "Chromium", id: "org.chromium.Chromium" },
  BraveHTML: { name: "Brave", id: "com.brave.Browser" },
  BraveBHTML: { name: "Brave Beta", id: "com.brave.Browser.beta" },
  BraveDHTML: { name: "Brave Dev", id: "com.brave.Browser.dev" },
  BraveSSHTM: { name: "Brave Nightly", id: "com.brave.Browser.nightly" },
  FirefoxURL: { name: "Firefox", id: "org.mozilla.firefox" },
  OperaStable: { name: "Opera", id: "com.operasoftware.Opera" },
  VivaldiHTM: { name: "Vivaldi", id: "com.vivaldi.Vivaldi" },
  "IE.HTTP": { name: "Internet Explorer", id: "com.microsoft.ie" }
};
const _windowsBrowserProgIdMap = new Map(Object.entries(windowsBrowserProgIds));
class UnknownBrowserError extends Error {
}
async function defaultBrowser$1(_execFileAsync = execFileAsync$1) {
  const { stdout } = await _execFileAsync("reg", [
    "QUERY",
    " HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice",
    "/v",
    "ProgId"
  ]);
  const match = /ProgId\s*REG_SZ\s*(?<id>\S+)/.exec(stdout);
  if (!match) {
    throw new UnknownBrowserError(`Cannot find Windows browser in stdout: ${JSON.stringify(stdout)}`);
  }
  const { id } = match.groups;
  const browser = windowsBrowserProgIds[id];
  if (!browser) {
    throw new UnknownBrowserError(`Unknown browser ID: ${id}`);
  }
  return browser;
}
const execFileAsync = promisify(execFile$2);
const titleize = (string) => string.toLowerCase().replaceAll(/(?:^|\s|-)\S/g, (x) => x.toUpperCase());
async function defaultBrowser() {
  if (process$1.platform === "darwin") {
    const id = await defaultBrowserId();
    const name = await bundleName(id);
    return { name, id };
  }
  if (process$1.platform === "linux") {
    const { stdout } = await execFileAsync("xdg-mime", ["query", "default", "x-scheme-handler/http"]);
    const id = stdout.trim();
    const name = titleize(id.replace(/.desktop$/, "").replace("-", " "));
    return { name, id };
  }
  if (process$1.platform === "win32") {
    return defaultBrowser$1();
  }
  throw new Error("Only macOS, Linux, and Windows are supported");
}
const isInSsh = Boolean(process$1.env.SSH_CONNECTION || process$1.env.SSH_CLIENT || process$1.env.SSH_TTY);
const fallbackAttemptSymbol = Symbol("fallbackAttempt");
const __dirname$1 = import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : "";
const localXdgOpenPath = path.join(__dirname$1, "xdg-open");
const { platform, arch } = process$1;
const tryEachApp = async (apps2, opener) => {
  if (apps2.length === 0) {
    return;
  }
  const errors = [];
  for (const app of apps2) {
    try {
      return await opener(app);
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, "Failed to open in all supported apps");
};
const baseOpen = async (options) => {
  options = {
    wait: false,
    background: false,
    newInstance: false,
    allowNonzeroExitCode: false,
    ...options
  };
  const isFallbackAttempt = options[fallbackAttemptSymbol] === true;
  delete options[fallbackAttemptSymbol];
  if (Array.isArray(options.app)) {
    return tryEachApp(options.app, (singleApp) => baseOpen({
      ...options,
      app: singleApp,
      [fallbackAttemptSymbol]: true
    }));
  }
  let { name: app, arguments: appArguments = [] } = options.app ?? {};
  appArguments = [...appArguments];
  if (Array.isArray(app)) {
    return tryEachApp(app, (appName) => baseOpen({
      ...options,
      app: {
        name: appName,
        arguments: appArguments
      },
      [fallbackAttemptSymbol]: true
    }));
  }
  if (app === "browser" || app === "browserPrivate") {
    const ids = {
      "com.google.chrome": "chrome",
      "google-chrome.desktop": "chrome",
      "com.brave.browser": "brave",
      "org.mozilla.firefox": "firefox",
      "firefox.desktop": "firefox",
      "com.microsoft.msedge": "edge",
      "com.microsoft.edge": "edge",
      "com.microsoft.edgemac": "edge",
      "microsoft-edge.desktop": "edge",
      "com.apple.safari": "safari"
    };
    const flags = {
      chrome: "--incognito",
      brave: "--incognito",
      firefox: "--private-window",
      edge: "--inPrivate"
      // Safari doesn't support private mode via command line
    };
    let browser;
    if (isWsl$1) {
      const progId = await wslDefaultBrowser();
      const browserInfo = _windowsBrowserProgIdMap.get(progId);
      browser = browserInfo ?? {};
    } else {
      browser = await defaultBrowser();
    }
    if (browser.id in ids) {
      const browserName = ids[browser.id.toLowerCase()];
      if (app === "browserPrivate") {
        if (browserName === "safari") {
          throw new Error("Safari doesn't support opening in private mode via command line");
        }
        appArguments.push(flags[browserName]);
      }
      return baseOpen({
        ...options,
        app: {
          name: apps[browserName],
          arguments: appArguments
        }
      });
    }
    throw new Error(`${browser.name} is not supported as a default browser`);
  }
  let command;
  const cliArguments = [];
  const childProcessOptions = {};
  let shouldUseWindowsInWsl = false;
  if (isWsl$1 && !isInsideContainer() && !isInSsh && !app) {
    shouldUseWindowsInWsl = await canAccessPowerShell();
  }
  if (platform === "darwin") {
    command = "open";
    if (options.wait) {
      cliArguments.push("--wait-apps");
    }
    if (options.background) {
      cliArguments.push("--background");
    }
    if (options.newInstance) {
      cliArguments.push("--new");
    }
    if (app) {
      cliArguments.push("-a", app);
    }
  } else if (platform === "win32" || shouldUseWindowsInWsl) {
    command = await powerShellPath();
    cliArguments.push(...executePowerShell.argumentsPrefix);
    if (!isWsl$1) {
      childProcessOptions.windowsVerbatimArguments = true;
    }
    if (isWsl$1 && options.target) {
      options.target = await convertWslPathToWindows(options.target);
    }
    const encodedArguments = ["$ProgressPreference = 'SilentlyContinue';", "Start"];
    if (options.wait) {
      encodedArguments.push("-Wait");
    }
    if (app) {
      encodedArguments.push(executePowerShell.escapeArgument(app));
      if (options.target) {
        appArguments.push(options.target);
      }
    } else if (options.target) {
      encodedArguments.push(executePowerShell.escapeArgument(options.target));
    }
    if (appArguments.length > 0) {
      appArguments = appArguments.map((argument) => executePowerShell.escapeArgument(argument));
      encodedArguments.push("-ArgumentList", appArguments.join(","));
    }
    options.target = executePowerShell.encodeCommand(encodedArguments.join(" "));
    if (!options.wait) {
      childProcessOptions.stdio = "ignore";
    }
  } else {
    if (app) {
      command = app;
    } else {
      const isBundled = !__dirname$1 || __dirname$1 === "/";
      let exeLocalXdgOpen = false;
      try {
        await fs$1.access(localXdgOpenPath, constants.X_OK);
        exeLocalXdgOpen = true;
      } catch {
      }
      const useSystemXdgOpen = process$1.versions.electron ?? (platform === "android" || isBundled || !exeLocalXdgOpen);
      command = useSystemXdgOpen ? "xdg-open" : localXdgOpenPath;
    }
    if (appArguments.length > 0) {
      cliArguments.push(...appArguments);
    }
    if (!options.wait) {
      childProcessOptions.stdio = "ignore";
      childProcessOptions.detached = true;
    }
  }
  if (platform === "darwin" && appArguments.length > 0) {
    cliArguments.push("--args", ...appArguments);
  }
  if (options.target) {
    cliArguments.push(options.target);
  }
  const subprocess = childProcess.spawn(command, cliArguments, childProcessOptions);
  if (options.wait) {
    return new Promise((resolve, reject) => {
      subprocess.once("error", reject);
      subprocess.once("close", (exitCode) => {
        if (!options.allowNonzeroExitCode && exitCode !== 0) {
          reject(new Error(`Exited with code ${exitCode}`));
          return;
        }
        resolve(subprocess);
      });
    });
  }
  if (isFallbackAttempt) {
    return new Promise((resolve, reject) => {
      subprocess.once("error", reject);
      subprocess.once("spawn", () => {
        subprocess.once("close", (exitCode) => {
          subprocess.off("error", reject);
          if (exitCode !== 0) {
            reject(new Error(`Exited with code ${exitCode}`));
            return;
          }
          subprocess.unref();
          resolve(subprocess);
        });
      });
    });
  }
  subprocess.unref();
  return new Promise((resolve, reject) => {
    subprocess.once("error", reject);
    subprocess.once("spawn", () => {
      subprocess.off("error", reject);
      resolve(subprocess);
    });
  });
};
const open = (target, options) => {
  if (typeof target !== "string") {
    throw new TypeError("Expected a `target`");
  }
  return baseOpen({
    ...options,
    target
  });
};
function detectArchBinary(binary) {
  if (typeof binary === "string" || Array.isArray(binary)) {
    return binary;
  }
  const { [arch]: archBinary } = binary;
  if (!archBinary) {
    throw new Error(`${arch} is not supported`);
  }
  return archBinary;
}
function detectPlatformBinary({ [platform]: platformBinary }, { wsl } = {}) {
  if (wsl && isWsl$1) {
    return detectArchBinary(wsl);
  }
  if (!platformBinary) {
    throw new Error(`${platform} is not supported`);
  }
  return detectArchBinary(platformBinary);
}
const apps = {
  browser: "browser",
  browserPrivate: "browserPrivate"
};
defineLazyProperty(apps, "chrome", () => detectPlatformBinary({
  darwin: "google chrome",
  win32: "chrome",
  // `chromium-browser` is the older deb package name used by Ubuntu/Debian before snap.
  linux: ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]
}, {
  wsl: {
    ia32: "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    x64: ["/mnt/c/Program Files/Google/Chrome/Application/chrome.exe", "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"]
  }
}));
defineLazyProperty(apps, "brave", () => detectPlatformBinary({
  darwin: "brave browser",
  win32: "brave",
  linux: ["brave-browser", "brave"]
}, {
  wsl: {
    ia32: "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe",
    x64: ["/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe"]
  }
}));
defineLazyProperty(apps, "firefox", () => detectPlatformBinary({
  darwin: "firefox",
  win32: String.raw`C:\Program Files\Mozilla Firefox\firefox.exe`,
  linux: "firefox"
}, {
  wsl: "/mnt/c/Program Files/Mozilla Firefox/firefox.exe"
}));
defineLazyProperty(apps, "edge", () => detectPlatformBinary({
  darwin: "microsoft edge",
  win32: "msedge",
  linux: ["microsoft-edge", "microsoft-edge-dev"]
}, {
  wsl: "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
}));
defineLazyProperty(apps, "safari", () => detectPlatformBinary({
  darwin: "Safari"
}));
let keytar = null;
async function loadKeytar() {
  if (keytar !== null) return keytar;
  try {
    const module = await import("keytar");
    keytar = module.default || module;
    return keytar;
  } catch {
    return null;
  }
}
loadKeytar().catch(() => {
});
const KEYCHAIN_SERVICE = "octocode-cli";
const OCTOCODE_DIR = join(HOME, ".octocode");
const CREDENTIALS_FILE = join(OCTOCODE_DIR, "credentials.json");
const KEY_FILE = join(OCTOCODE_DIR, ".key");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
let _useSecureStorage = null;
function isSecureStorageAvailable() {
  if (_useSecureStorage !== null) {
    return _useSecureStorage;
  }
  _useSecureStorage = keytar !== null;
  return _useSecureStorage;
}
async function keytarStore(hostname, credentials) {
  if (!keytar) throw new Error("Keytar not available");
  const data = JSON.stringify(credentials);
  await keytar.setPassword(KEYCHAIN_SERVICE, hostname, data);
}
async function keytarGet(hostname) {
  if (!keytar) return null;
  try {
    const data = await keytar.getPassword(KEYCHAIN_SERVICE, hostname);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}
async function keytarDelete(hostname) {
  if (!keytar) return false;
  try {
    return await keytar.deletePassword(KEYCHAIN_SERVICE, hostname);
  } catch {
    return false;
  }
}
function getOrCreateKey() {
  ensureOctocodeDir();
  if (existsSync(KEY_FILE)) {
    return Buffer.from(readFileSync(KEY_FILE, "utf8"), "hex");
  }
  const key = randomBytes(32);
  writeFileSync(KEY_FILE, key.toString("hex"), { mode: 384 });
  return key;
}
function encrypt(data) {
  const key = getOrCreateKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}
function decrypt(encryptedData) {
  const key = getOrCreateKey();
  const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Invalid encrypted data format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
function ensureOctocodeDir() {
  if (!existsSync(OCTOCODE_DIR)) {
    mkdirSync(OCTOCODE_DIR, { recursive: true, mode: 448 });
  }
}
function readCredentialsStore() {
  ensureOctocodeDir();
  if (!existsSync(CREDENTIALS_FILE)) {
    return { version: 1, credentials: {} };
  }
  try {
    const encryptedContent = readFileSync(CREDENTIALS_FILE, "utf8");
    const decrypted = decrypt(encryptedContent);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error(
      "\n  ⚠ Warning: Could not read credentials file. You may need to login again."
    );
    console.error(`  File: ${CREDENTIALS_FILE}`);
    if (error instanceof Error && error.message) {
      console.error(`  Reason: ${error.message}
`);
    }
    return { version: 1, credentials: {} };
  }
}
function writeCredentialsStore(store) {
  ensureOctocodeDir();
  const encrypted = encrypt(JSON.stringify(store, null, 2));
  writeFileSync(CREDENTIALS_FILE, encrypted, { mode: 384 });
}
async function migrateLegacyCredentials() {
  if (!isSecureStorageAvailable()) return;
  if (!existsSync(CREDENTIALS_FILE)) return;
  try {
    const store = readCredentialsStore();
    const hostnames = Object.keys(store.credentials);
    if (hostnames.length === 0) return;
    for (const hostname of hostnames) {
      const existing = await keytarGet(hostname);
      if (!existing) {
        await keytarStore(hostname, store.credentials[hostname]);
      }
    }
    try {
      unlinkSync(CREDENTIALS_FILE);
      if (existsSync(KEY_FILE)) {
        unlinkSync(KEY_FILE);
      }
    } catch {
    }
  } catch {
  }
}
migrateLegacyCredentials().catch(() => {
});
function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}
function storeCredentials(credentials) {
  const hostname = normalizeHostname(credentials.hostname);
  const normalizedCredentials = {
    ...credentials,
    hostname,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (isSecureStorageAvailable()) {
    keytarStore(hostname, normalizedCredentials).catch(() => {
      const store = readCredentialsStore();
      store.credentials[hostname] = normalizedCredentials;
      writeCredentialsStore(store);
    });
  } else {
    const store = readCredentialsStore();
    store.credentials[hostname] = normalizedCredentials;
    writeCredentialsStore(store);
  }
}
function getCredentials(hostname = "github.com") {
  const normalizedHostname = normalizeHostname(hostname);
  if (!isSecureStorageAvailable()) {
    const store2 = readCredentialsStore();
    return store2.credentials[normalizedHostname] || null;
  }
  const store = readCredentialsStore();
  return store.credentials[normalizedHostname] || null;
}
function deleteCredentials(hostname = "github.com") {
  const normalizedHostname = normalizeHostname(hostname);
  if (isSecureStorageAvailable()) {
    keytarDelete(normalizedHostname).catch(() => {
    });
  }
  const store = readCredentialsStore();
  if (store.credentials[normalizedHostname]) {
    delete store.credentials[normalizedHostname];
    writeCredentialsStore(store);
    return true;
  }
  return isSecureStorageAvailable();
}
function getCredentialsFilePath() {
  if (isSecureStorageAvailable()) {
    return "System Keychain (secure)";
  }
  return CREDENTIALS_FILE;
}
function isTokenExpired(credentials) {
  if (!credentials.token.expiresAt) {
    return false;
  }
  const expiresAt = new Date(credentials.token.expiresAt);
  if (isNaN(expiresAt.getTime())) {
    return true;
  }
  const now = /* @__PURE__ */ new Date();
  return expiresAt.getTime() - now.getTime() < 5 * 60 * 1e3;
}
const DEFAULT_CLIENT_ID = "178c6fc778ccc68e1d6a";
const DEFAULT_SCOPES = ["repo", "read:org", "gist"];
const DEFAULT_HOSTNAME = "github.com";
function getApiBaseUrl(hostname) {
  if (hostname === "github.com" || hostname === DEFAULT_HOSTNAME) {
    return "https://api.github.com";
  }
  return `https://${hostname}/api/v3`;
}
async function getCurrentUser(token, hostname) {
  const baseUrl = getApiBaseUrl(hostname);
  const response = await request("GET /user", {
    headers: {
      authorization: `token ${token}`
    },
    baseUrl
  });
  return response.data.login;
}
async function login(options = {}) {
  const {
    hostname = DEFAULT_HOSTNAME,
    scopes = DEFAULT_SCOPES,
    gitProtocol = "https",
    clientId = DEFAULT_CLIENT_ID,
    onVerification,
    openBrowser = true
  } = options;
  try {
    const auth2 = createOAuthDeviceAuth({
      clientType: "oauth-app",
      clientId,
      scopes,
      onVerification: async (verification) => {
        if (onVerification) {
          onVerification(verification);
        }
        if (openBrowser) {
          try {
            await open(verification.verification_uri);
          } catch {
          }
        }
      },
      request: request.defaults({
        baseUrl: getApiBaseUrl(hostname)
      })
    });
    const tokenAuth = await auth2({ type: "oauth" });
    const username = await getCurrentUser(tokenAuth.token, hostname);
    const token = {
      token: tokenAuth.token,
      tokenType: "oauth",
      scopes: "scopes" in tokenAuth ? tokenAuth.scopes : void 0
    };
    if ("refreshToken" in tokenAuth && tokenAuth.refreshToken) {
      token.refreshToken = tokenAuth.refreshToken;
      token.expiresAt = "expiresAt" in tokenAuth ? tokenAuth.expiresAt : void 0;
      token.refreshTokenExpiresAt = "refreshTokenExpiresAt" in tokenAuth ? tokenAuth.refreshTokenExpiresAt : void 0;
    }
    const credentials = {
      hostname,
      username,
      token,
      gitProtocol,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    storeCredentials(credentials);
    return {
      success: true,
      username,
      hostname
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Authentication failed"
    };
  }
}
async function logout(hostname = DEFAULT_HOSTNAME) {
  const credentials = getCredentials(hostname);
  if (!credentials) {
    return {
      success: false,
      error: `Not logged in to ${hostname}`
    };
  }
  try {
    await deleteToken({
      clientType: "oauth-app",
      clientId: DEFAULT_CLIENT_ID,
      clientSecret: "",
      // We don't have this for public clients
      token: credentials.token.token,
      request: request.defaults({
        baseUrl: getApiBaseUrl(hostname)
      })
    });
  } catch {
  }
  deleteCredentials(hostname);
  return { success: true };
}
function getAuthStatus(hostname = DEFAULT_HOSTNAME) {
  const credentials = getCredentials(hostname);
  if (!credentials) {
    return {
      authenticated: false
    };
  }
  const tokenExpired = isTokenExpired(credentials);
  return {
    authenticated: !tokenExpired,
    hostname: credentials.hostname,
    username: credentials.username,
    tokenExpired
  };
}
function getStoragePath() {
  return getCredentialsFilePath();
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
function printInstallError$1(result) {
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
    printInstallError$1(result);
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
      await pressEnterToContinue$2();
      break;
    case "edit":
      await runEditConfigFlow();
      break;
    case "show-json":
      await showCurrentJsonConfig();
      break;
  }
}
async function pressEnterToContinue$2() {
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
const MCP_REGISTRY = [
  // === BROWSER AUTOMATION ===
  {
    id: "playwright-mcp",
    name: "Playwright MCP",
    description: "Official Microsoft Playwright MCP server for browser automation via accessibility snapshots",
    category: "browser-automation",
    repository: "https://github.com/microsoft/playwright-mcp",
    website: "https://playwright.dev",
    installationType: "npx",
    npmPackage: "@playwright/mcp",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"]
    },
    tags: ["browser", "automation", "testing", "microsoft", "official"]
  },
  {
    id: "firecrawl-mcp-server",
    name: "Firecrawl MCP",
    description: "Powerful web scraping and search for Claude, Cursor and LLM clients",
    category: "browser-automation",
    repository: "https://github.com/firecrawl/firecrawl-mcp-server",
    website: "https://firecrawl.dev",
    installationType: "npx",
    npmPackage: "firecrawl-mcp",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "firecrawl-mcp"]
    },
    requiredEnvVars: [
      {
        name: "FIRECRAWL_API_KEY",
        description: "Firecrawl API key",
        example: "fc-xxxxx"
      }
    ],
    tags: ["scraping", "web", "search", "official"]
  },
  {
    id: "browserbase-mcp",
    name: "Browserbase MCP",
    description: "Cloud browser automation for web navigation, data extraction, form filling",
    category: "browser-automation",
    repository: "https://github.com/browserbase/mcp-server-browserbase",
    website: "https://browserbase.com",
    installationType: "npx",
    npmPackage: "@browserbasehq/mcp-server-browserbase",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "@browserbasehq/mcp-server-browserbase"]
    },
    requiredEnvVars: [
      { name: "BROWSERBASE_API_KEY", description: "Browserbase API key" },
      { name: "BROWSERBASE_PROJECT_ID", description: "Browserbase project ID" }
    ],
    tags: ["browser", "cloud", "automation", "official"]
  },
  {
    id: "chrome-devtools-mcp",
    name: "Chrome DevTools MCP",
    description: "Chrome DevTools for coding agents - debugging and browser control",
    category: "browser-automation",
    repository: "https://github.com/ChromeDevTools/chrome-devtools-mcp",
    installationType: "npx",
    npmPackage: "chrome-devtools-mcp",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "chrome-devtools-mcp"]
    },
    tags: ["chrome", "devtools", "debugging", "official"]
  },
  // === VERSION CONTROL ===
  {
    id: "github-mcp-server",
    name: "GitHub MCP",
    description: "GitHub's official MCP Server for repository management, PRs, issues, and more",
    category: "version-control",
    repository: "https://github.com/github/github-mcp-server",
    website: "https://github.com",
    installationType: "docker",
    dockerImage: "ghcr.io/github/github-mcp-server",
    official: true,
    installConfig: {
      command: "docker",
      args: [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ]
    },
    requiredEnvVars: [
      {
        name: "GITHUB_PERSONAL_ACCESS_TOKEN",
        description: "GitHub Personal Access Token"
      }
    ],
    tags: ["github", "git", "repository", "official"]
  },
  // === DATABASES ===
  {
    id: "sqlite-mcp",
    name: "SQLite MCP",
    description: "SQLite database operations with built-in analysis features",
    category: "database",
    repository: "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite",
    installationType: "pip",
    pipPackage: "mcp-server-sqlite",
    official: true,
    installConfig: {
      command: "uvx",
      args: ["mcp-server-sqlite", "--db-path", "${DATABASE_PATH}"]
    },
    requiredEnvVars: [
      {
        name: "DATABASE_PATH",
        description: "Path to SQLite database file",
        example: "/path/to/database.db"
      }
    ],
    tags: ["database", "sqlite", "sql", "official"]
  },
  {
    id: "mysql-mcp",
    name: "MySQL MCP",
    description: "MySQL database integration with configurable access controls and schema inspection",
    category: "database",
    repository: "https://github.com/designcomputer/mysql_mcp_server",
    installationType: "pip",
    pipPackage: "mysql-mcp-server",
    installConfig: {
      command: "uvx",
      args: ["mysql-mcp-server"]
    },
    requiredEnvVars: [
      { name: "MYSQL_HOST", description: "MySQL host" },
      { name: "MYSQL_USER", description: "MySQL username" },
      { name: "MYSQL_PASSWORD", description: "MySQL password" },
      { name: "MYSQL_DATABASE", description: "MySQL database name" }
    ],
    tags: ["database", "mysql", "sql"]
  },
  {
    id: "mongodb-mcp",
    name: "MongoDB MCP",
    description: "MongoDB integration for querying and analyzing collections",
    category: "database",
    repository: "https://github.com/kiliczsh/mcp-mongo-server",
    installationType: "npx",
    npmPackage: "mcp-mongo-server",
    installConfig: {
      command: "npx",
      args: ["-y", "mcp-mongo-server"]
    },
    requiredEnvVars: [
      {
        name: "MONGODB_URI",
        description: "MongoDB connection URI",
        example: "mongodb://localhost:27017/mydb"
      }
    ],
    tags: ["database", "mongodb", "nosql"]
  },
  {
    id: "redis-mcp",
    name: "Redis MCP",
    description: "Natural language interface for managing and searching data in Redis",
    category: "database",
    repository: "https://github.com/redis/mcp-redis",
    website: "https://redis.io",
    installationType: "pip",
    pipPackage: "redis-mcp-server",
    official: true,
    installConfig: {
      command: "uvx",
      args: ["redis-mcp-server"]
    },
    requiredEnvVars: [
      {
        name: "REDIS_URL",
        description: "Redis connection URL",
        example: "redis://localhost:6379"
      }
    ],
    tags: ["database", "redis", "cache", "official"]
  },
  {
    id: "neon-mcp",
    name: "Neon MCP",
    description: "Neon Serverless Postgres - create and manage databases with natural language",
    category: "database",
    repository: "https://github.com/neondatabase/mcp-server-neon",
    website: "https://neon.tech",
    installationType: "npx",
    npmPackage: "@neondatabase/mcp-server-neon",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "@neondatabase/mcp-server-neon"]
    },
    requiredEnvVars: [{ name: "NEON_API_KEY", description: "Neon API key" }],
    tags: ["database", "postgres", "serverless", "official"]
  },
  {
    id: "qdrant-mcp",
    name: "Qdrant MCP",
    description: "Vector search engine for keeping and retrieving memories",
    category: "database",
    repository: "https://github.com/qdrant/mcp-server-qdrant",
    website: "https://qdrant.tech",
    installationType: "pip",
    pipPackage: "mcp-server-qdrant",
    official: true,
    installConfig: {
      command: "uvx",
      args: ["mcp-server-qdrant"]
    },
    requiredEnvVars: [
      { name: "QDRANT_URL", description: "Qdrant server URL" },
      { name: "QDRANT_API_KEY", description: "Qdrant API key (optional)" }
    ],
    tags: ["database", "vector", "search", "official"]
  },
  {
    id: "snowflake-mcp",
    name: "Snowflake MCP",
    description: "Snowflake data warehouse integration with read/write capabilities",
    category: "database",
    repository: "https://github.com/isaacwasserman/mcp-snowflake-server",
    website: "https://snowflake.com",
    installationType: "pip",
    pipPackage: "mcp-snowflake-server",
    installConfig: {
      command: "uvx",
      args: ["mcp-snowflake-server"]
    },
    requiredEnvVars: [
      {
        name: "SNOWFLAKE_ACCOUNT",
        description: "Snowflake account identifier"
      },
      { name: "SNOWFLAKE_USER", description: "Snowflake username" },
      { name: "SNOWFLAKE_PASSWORD", description: "Snowflake password" }
    ],
    tags: ["database", "snowflake", "data-warehouse"]
  },
  {
    id: "bigquery-mcp",
    name: "BigQuery MCP",
    description: "Google BigQuery integration for schema inspection and queries",
    category: "database",
    repository: "https://github.com/LucasHild/mcp-server-bigquery",
    website: "https://cloud.google.com/bigquery",
    installationType: "pip",
    pipPackage: "mcp-server-bigquery",
    installConfig: {
      command: "uvx",
      args: ["mcp-server-bigquery"]
    },
    requiredEnvVars: [
      {
        name: "GOOGLE_APPLICATION_CREDENTIALS",
        description: "Path to GCP service account JSON"
      }
    ],
    tags: ["database", "bigquery", "google", "analytics"]
  },
  // === CLOUD PLATFORMS ===
  {
    id: "cloudflare-mcp",
    name: "Cloudflare MCP",
    description: "Integration with Cloudflare Workers, KV, R2, and D1",
    category: "cloud-platform",
    repository: "https://github.com/cloudflare/mcp-server-cloudflare",
    website: "https://cloudflare.com",
    installationType: "npx",
    npmPackage: "@cloudflare/mcp-server-cloudflare",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "@cloudflare/mcp-server-cloudflare"]
    },
    requiredEnvVars: [
      { name: "CLOUDFLARE_API_TOKEN", description: "Cloudflare API Token" },
      { name: "CLOUDFLARE_ACCOUNT_ID", description: "Cloudflare Account ID" }
    ],
    tags: ["cloudflare", "cloud", "workers", "official"]
  },
  {
    id: "kubernetes-mcp",
    name: "Kubernetes MCP",
    description: "Kubernetes cluster operations through MCP",
    category: "cloud-platform",
    repository: "https://github.com/strowk/mcp-k8s-go",
    installationType: "binary",
    installConfig: {
      command: "mcp-k8s",
      args: []
    },
    tags: ["kubernetes", "k8s", "containers", "devops"]
  },
  {
    id: "docker-mcp",
    name: "Docker MCP",
    description: "Docker operations for container and compose stack management",
    category: "cloud-platform",
    repository: "https://github.com/sondt2709/docker-mcp",
    installationType: "npx",
    npmPackage: "docker-mcp",
    installConfig: {
      command: "npx",
      args: ["-y", "docker-mcp"]
    },
    tags: ["docker", "containers", "devops"]
  },
  // === FILE SYSTEMS ===
  {
    id: "filesystem-mcp",
    name: "Filesystem MCP",
    description: "Direct local file system access with configurable permissions",
    category: "file-system",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    installationType: "npx",
    npmPackage: "@modelcontextprotocol/server-filesystem",
    official: true,
    installConfig: {
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "${ALLOWED_DIRECTORIES}"
      ]
    },
    requiredEnvVars: [
      {
        name: "ALLOWED_DIRECTORIES",
        description: "Comma-separated list of allowed directories",
        example: "/home/user/projects,/tmp"
      }
    ],
    tags: ["filesystem", "files", "local", "official"]
  },
  // === SEARCH & WEB ===
  {
    id: "exa-mcp",
    name: "Exa Search MCP",
    description: "Exa AI Search API for real-time web information retrieval",
    category: "search-web",
    repository: "https://github.com/exa-labs/exa-mcp-server",
    website: "https://exa.ai",
    installationType: "npx",
    npmPackage: "exa-mcp-server",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "exa-mcp-server"]
    },
    requiredEnvVars: [{ name: "EXA_API_KEY", description: "Exa API key" }],
    tags: ["search", "exa", "ai", "official"]
  },
  {
    id: "tavily-mcp",
    name: "Tavily MCP",
    description: "Tavily AI search API for intelligent web search",
    category: "search-web",
    repository: "https://github.com/tavily-ai/tavily-mcp",
    website: "https://tavily.com",
    installationType: "npx",
    npmPackage: "tavily-mcp",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "tavily-mcp"]
    },
    requiredEnvVars: [
      { name: "TAVILY_API_KEY", description: "Tavily API key" }
    ],
    tags: ["search", "tavily", "ai", "official"]
  },
  // === COMMUNICATION ===
  {
    id: "slack-mcp",
    name: "Slack MCP",
    description: "Most powerful MCP server for Slack with Stdio and SSE transports",
    category: "communication",
    repository: "https://github.com/korotovsky/slack-mcp-server",
    website: "https://slack.com",
    installationType: "npx",
    npmPackage: "slack-mcp-server",
    installConfig: {
      command: "npx",
      args: ["-y", "slack-mcp-server"]
    },
    requiredEnvVars: [
      { name: "SLACK_BOT_TOKEN", description: "Slack Bot OAuth Token" }
    ],
    tags: ["slack", "chat", "team"]
  },
  {
    id: "discord-mcp",
    name: "Discord MCP",
    description: "Discord integration for AI assistants",
    category: "communication",
    repository: "https://github.com/olivierdebeufderijcker/discord-mcp",
    website: "https://discord.com",
    installationType: "npx",
    npmPackage: "discord-mcp",
    installConfig: {
      command: "npx",
      args: ["-y", "discord-mcp"]
    },
    requiredEnvVars: [
      { name: "DISCORD_TOKEN", description: "Discord Bot Token" }
    ],
    tags: ["discord", "chat", "community"]
  },
  {
    id: "gmail-mcp",
    name: "Gmail MCP",
    description: "Gmail integration via Inbox Zero for email management",
    category: "communication",
    repository: "https://github.com/elie222/inbox-zero",
    website: "https://getinboxzero.com",
    installationType: "pip",
    pipPackage: "inbox-zero-mcp",
    installConfig: {
      command: "uvx",
      args: ["inbox-zero-mcp"]
    },
    requiredEnvVars: [
      {
        name: "GOOGLE_APPLICATION_CREDENTIALS",
        description: "Path to Google credentials"
      }
    ],
    tags: ["email", "gmail", "google"]
  },
  {
    id: "linear-mcp",
    name: "Linear MCP",
    description: "Linear issue tracking integration",
    category: "communication",
    repository: "https://github.com/jerhadf/linear-mcp-server",
    website: "https://linear.app",
    installationType: "npx",
    npmPackage: "linear-mcp-server",
    installConfig: {
      command: "npx",
      args: ["-y", "linear-mcp-server"]
    },
    requiredEnvVars: [
      { name: "LINEAR_API_KEY", description: "Linear API key" }
    ],
    tags: ["linear", "issues", "project-management"]
  },
  {
    id: "atlassian-mcp",
    name: "Atlassian MCP",
    description: "Confluence and Jira integration for documentation and issue tracking",
    category: "communication",
    repository: "https://github.com/sooperset/mcp-atlassian",
    website: "https://atlassian.com",
    installationType: "pip",
    pipPackage: "mcp-atlassian",
    installConfig: {
      command: "uvx",
      args: ["mcp-atlassian"]
    },
    requiredEnvVars: [
      { name: "ATLASSIAN_URL", description: "Atlassian instance URL" },
      { name: "ATLASSIAN_EMAIL", description: "Atlassian email" },
      { name: "ATLASSIAN_API_TOKEN", description: "Atlassian API token" }
    ],
    tags: ["atlassian", "jira", "confluence"]
  },
  // === PRODUCTIVITY ===
  {
    id: "notion-mcp",
    name: "Notion MCP",
    description: "Notion API integration for managing personal todo lists and notes",
    category: "productivity",
    repository: "https://github.com/danhilse/notion_mcp",
    website: "https://notion.so",
    installationType: "pip",
    pipPackage: "notion-mcp",
    installConfig: {
      command: "uvx",
      args: ["notion-mcp"]
    },
    requiredEnvVars: [
      { name: "NOTION_API_KEY", description: "Notion Integration Token" }
    ],
    tags: ["notion", "notes", "productivity"]
  },
  {
    id: "obsidian-mcp",
    name: "Obsidian MCP",
    description: "Obsidian vault integration for file management, search, and manipulation",
    category: "productivity",
    repository: "https://github.com/MarkusPfundstein/mcp-obsidian",
    website: "https://obsidian.md",
    installationType: "npx",
    npmPackage: "mcp-obsidian",
    installConfig: {
      command: "npx",
      args: ["-y", "mcp-obsidian"]
    },
    requiredEnvVars: [
      { name: "OBSIDIAN_VAULT_PATH", description: "Path to Obsidian vault" }
    ],
    tags: ["obsidian", "notes", "markdown"]
  },
  {
    id: "todoist-mcp",
    name: "Todoist MCP",
    description: "Natural language task management with Todoist",
    category: "productivity",
    repository: "https://github.com/stevengonsalvez/todoist-mcp",
    website: "https://todoist.com",
    installationType: "npx",
    npmPackage: "todoist-mcp-server",
    installConfig: {
      command: "npx",
      args: ["-y", "todoist-mcp-server"]
    },
    requiredEnvVars: [
      { name: "TODOIST_API_TOKEN", description: "Todoist API token" }
    ],
    tags: ["todoist", "tasks", "productivity"]
  },
  {
    id: "google-workspace-mcp",
    name: "Google Workspace MCP",
    description: "Control Gmail, Calendar, Docs, Sheets, Slides, Chat, Drive and more",
    category: "productivity",
    repository: "https://github.com/taylorwilsdon/google_workspace_mcp",
    website: "https://workspace.google.com",
    installationType: "pip",
    pipPackage: "google-workspace-mcp",
    installConfig: {
      command: "uvx",
      args: ["google-workspace-mcp"]
    },
    requiredEnvVars: [
      {
        name: "GOOGLE_APPLICATION_CREDENTIALS",
        description: "Path to Google credentials"
      }
    ],
    tags: ["google", "workspace", "gmail", "docs"]
  },
  // === DEVELOPER TOOLS ===
  {
    id: "context7-mcp",
    name: "Context7 MCP",
    description: "Up-to-date code documentation for LLMs and AI code editors",
    category: "developer-tools",
    repository: "https://github.com/upstash/context7",
    website: "https://context7.com",
    installationType: "npx",
    npmPackage: "@upstash/context7-mcp",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"]
    },
    tags: ["documentation", "context", "code", "official"]
  },
  {
    id: "sentry-mcp",
    name: "Sentry MCP",
    description: "Sentry.io integration for error tracking and performance monitoring",
    category: "developer-tools",
    repository: "https://github.com/getsentry/sentry-mcp",
    website: "https://sentry.io",
    installationType: "npx",
    npmPackage: "@sentry/mcp-server",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "@sentry/mcp-server"]
    },
    requiredEnvVars: [
      { name: "SENTRY_AUTH_TOKEN", description: "Sentry Auth Token" },
      { name: "SENTRY_ORG", description: "Sentry Organization Slug" }
    ],
    tags: ["sentry", "errors", "monitoring", "official"]
  },
  {
    id: "mcp-memory-service",
    name: "Memory Service MCP",
    description: "Automatic context memory for Claude, VS Code, Cursor - stop re-explaining",
    category: "developer-tools",
    repository: "https://github.com/doobidoo/mcp-memory-service",
    installationType: "pip",
    pipPackage: "mcp-memory-service",
    installConfig: {
      command: "uvx",
      args: ["mcp-memory-service"]
    },
    tags: ["memory", "context", "persistence"]
  },
  {
    id: "serena-mcp",
    name: "Serena MCP",
    description: "Powerful coding agent with semantic retrieval and editing via language servers",
    category: "coding-agents",
    repository: "https://github.com/oraios/serena",
    installationType: "pip",
    pipPackage: "serena",
    installConfig: {
      command: "uvx",
      args: ["serena"]
    },
    tags: ["coding", "agent", "language-server"]
  },
  {
    id: "figma-mcp",
    name: "Figma MCP",
    description: "Get Figma design data in ready-to-implement format",
    category: "developer-tools",
    repository: "https://github.com/tianmuji/Figma-Context-MCP",
    website: "https://figma.com",
    installationType: "npx",
    npmPackage: "figma-context-mcp",
    installConfig: {
      command: "npx",
      args: ["-y", "figma-context-mcp"]
    },
    requiredEnvVars: [
      {
        name: "FIGMA_ACCESS_TOKEN",
        description: "Figma Personal Access Token"
      }
    ],
    tags: ["figma", "design", "ui"]
  },
  {
    id: "talk-to-figma-mcp",
    name: "Talk to Figma MCP",
    description: "Cursor + Figma integration for reading and modifying designs",
    category: "developer-tools",
    repository: "https://github.com/grab/cursor-talk-to-figma-mcp",
    website: "https://figma.com",
    installationType: "npx",
    npmPackage: "@anthropic-ai/talk-to-figma-mcp",
    installConfig: {
      command: "npx",
      args: ["-y", "@anthropic-ai/talk-to-figma-mcp"]
    },
    requiredEnvVars: [
      {
        name: "FIGMA_ACCESS_TOKEN",
        description: "Figma Personal Access Token"
      }
    ],
    tags: ["figma", "cursor", "design"]
  },
  {
    id: "mcp-language-server",
    name: "Language Server MCP",
    description: "Semantic tools like get definition, references, rename, diagnostics",
    category: "developer-tools",
    repository: "https://github.com/isaacphi/mcp-language-server",
    installationType: "binary",
    installConfig: {
      command: "mcp-language-server",
      args: []
    },
    tags: ["lsp", "language-server", "semantic"]
  },
  // === AI SERVICES ===
  {
    id: "openai-mcp",
    name: "OpenAI MCP",
    description: "Query OpenAI models directly from Claude using MCP protocol",
    category: "ai-services",
    repository: "https://github.com/pierrebrunelle/mcp-server-openai",
    website: "https://openai.com",
    installationType: "pip",
    pipPackage: "mcp-server-openai",
    installConfig: {
      command: "uvx",
      args: ["mcp-server-openai"]
    },
    requiredEnvVars: [
      { name: "OPENAI_API_KEY", description: "OpenAI API key" }
    ],
    tags: ["openai", "gpt", "llm"]
  },
  {
    id: "llamacloud-mcp",
    name: "LlamaCloud MCP",
    description: "Connect to managed indices on LlamaCloud",
    category: "ai-services",
    repository: "https://github.com/run-llama/mcp-server-llamacloud",
    website: "https://cloud.llamaindex.ai",
    installationType: "npx",
    npmPackage: "@llamaindex/mcp-server-llamacloud",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "@llamaindex/mcp-server-llamacloud"]
    },
    requiredEnvVars: [
      { name: "LLAMA_CLOUD_API_KEY", description: "LlamaCloud API key" }
    ],
    tags: ["llamaindex", "rag", "index", "official"]
  },
  {
    id: "huggingface-spaces-mcp",
    name: "HuggingFace Spaces MCP",
    description: "Use HuggingFace Spaces from your MCP Client - images, audio, text",
    category: "ai-services",
    repository: "https://github.com/evalstate/mcp-hfspace",
    website: "https://huggingface.co/spaces",
    installationType: "npx",
    npmPackage: "mcp-hfspace",
    installConfig: {
      command: "npx",
      args: ["-y", "mcp-hfspace"]
    },
    requiredEnvVars: [
      { name: "HF_TOKEN", description: "HuggingFace API token" }
    ],
    tags: ["huggingface", "spaces", "models"]
  },
  // === WORKFLOW AUTOMATION ===
  {
    id: "n8n-mcp",
    name: "n8n MCP",
    description: "Build n8n workflows using Claude Desktop, Cursor, or Windsurf",
    category: "workflow-automation",
    repository: "https://github.com/czlonkowski/n8n-mcp",
    website: "https://n8n.io",
    installationType: "npx",
    npmPackage: "n8n-mcp",
    installConfig: {
      command: "npx",
      args: ["-y", "n8n-mcp"]
    },
    requiredEnvVars: [
      { name: "N8N_API_URL", description: "n8n instance URL" },
      { name: "N8N_API_KEY", description: "n8n API key" }
    ],
    tags: ["n8n", "automation", "workflows"]
  },
  // === DATA VISUALIZATION ===
  {
    id: "vegalite-mcp",
    name: "VegaLite MCP",
    description: "Generate visualizations from data using VegaLite format",
    category: "data-visualization",
    repository: "https://github.com/isaacwasserman/mcp-vegalite-server",
    installationType: "pip",
    pipPackage: "mcp-vegalite-server",
    installConfig: {
      command: "uvx",
      args: ["mcp-vegalite-server"]
    },
    tags: ["visualization", "charts", "vegalite"]
  },
  {
    id: "echarts-mcp",
    name: "ECharts MCP",
    description: "Generate visual charts using Apache ECharts dynamically",
    category: "data-visualization",
    repository: "https://github.com/hustcc/mcp-echarts",
    website: "https://echarts.apache.org",
    installationType: "npx",
    npmPackage: "mcp-echarts",
    installConfig: {
      command: "npx",
      args: ["-y", "mcp-echarts"]
    },
    tags: ["visualization", "charts", "echarts"]
  },
  {
    id: "mermaid-mcp",
    name: "Mermaid MCP",
    description: "Generate Mermaid diagrams and charts dynamically",
    category: "data-visualization",
    repository: "https://github.com/hustcc/mcp-mermaid",
    website: "https://mermaid.js.org",
    installationType: "npx",
    npmPackage: "mcp-mermaid",
    installConfig: {
      command: "npx",
      args: ["-y", "mcp-mermaid"]
    },
    tags: ["diagrams", "mermaid", "flowcharts"]
  },
  // === MONITORING ===
  {
    id: "datadog-mcp",
    name: "Datadog MCP",
    description: "Datadog monitoring and observability integration",
    category: "monitoring",
    repository: "https://github.com/datadog/mcp-server-datadog",
    website: "https://datadoghq.com",
    installationType: "pip",
    pipPackage: "datadog-mcp",
    official: true,
    installConfig: {
      command: "uvx",
      args: ["datadog-mcp"]
    },
    requiredEnvVars: [
      { name: "DD_API_KEY", description: "Datadog API key" },
      { name: "DD_APP_KEY", description: "Datadog Application key" }
    ],
    tags: ["datadog", "monitoring", "observability", "official"]
  },
  // === FINANCE ===
  {
    id: "stripe-mcp",
    name: "Stripe MCP",
    description: "Official Stripe Agent Toolkit for payment integration",
    category: "finance",
    repository: "https://github.com/stripe/agent-toolkit",
    website: "https://stripe.com",
    installationType: "npx",
    npmPackage: "@stripe/agent-toolkit",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "@stripe/agent-toolkit", "mcp"]
    },
    requiredEnvVars: [
      { name: "STRIPE_SECRET_KEY", description: "Stripe Secret Key" }
    ],
    tags: ["stripe", "payments", "finance", "official"]
  },
  {
    id: "paypal-mcp",
    name: "PayPal MCP",
    description: "PayPal Agent Toolkit for payment integration",
    category: "finance",
    repository: "https://github.com/paypal/agent-toolkit",
    website: "https://paypal.com",
    installationType: "npx",
    npmPackage: "@paypal/agent-toolkit",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "@paypal/agent-toolkit"]
    },
    requiredEnvVars: [
      { name: "PAYPAL_CLIENT_ID", description: "PayPal Client ID" },
      { name: "PAYPAL_CLIENT_SECRET", description: "PayPal Client Secret" }
    ],
    tags: ["paypal", "payments", "finance", "official"]
  },
  // === SECURITY ===
  {
    id: "semgrep-mcp",
    name: "Semgrep MCP",
    description: "Scan code for security vulnerabilities using Semgrep",
    category: "security",
    repository: "https://github.com/semgrep/mcp",
    website: "https://semgrep.dev",
    installationType: "pip",
    pipPackage: "semgrep-mcp",
    official: true,
    installConfig: {
      command: "uvx",
      args: ["semgrep-mcp"]
    },
    tags: ["semgrep", "security", "sast", "official"]
  },
  {
    id: "osv-mcp",
    name: "OSV MCP",
    description: "Access Open Source Vulnerabilities database",
    category: "security",
    repository: "https://github.com/StacklokLabs/osv-mcp",
    website: "https://osv.dev",
    installationType: "binary",
    installConfig: {
      command: "osv-mcp",
      args: []
    },
    tags: ["osv", "vulnerabilities", "security"]
  },
  // === AGGREGATORS ===
  {
    id: "pipedream-mcp",
    name: "Pipedream MCP",
    description: "Connect with 2,500+ APIs with 8,000+ prebuilt tools",
    category: "aggregator",
    repository: "https://github.com/PipedreamHQ/pipedream/tree/master/modelcontextprotocol",
    website: "https://pipedream.com",
    installationType: "npx",
    npmPackage: "@pipedream/mcp",
    official: true,
    installConfig: {
      command: "npx",
      args: ["-y", "@pipedream/mcp"]
    },
    requiredEnvVars: [
      { name: "PIPEDREAM_API_KEY", description: "Pipedream API key" }
    ],
    tags: ["pipedream", "integrations", "apis", "official"]
  },
  {
    id: "mindsdb-mcp",
    name: "MindsDB MCP",
    description: "Connect and unify data across platforms as a single MCP server",
    category: "aggregator",
    repository: "https://github.com/mindsdb/mindsdb",
    website: "https://mindsdb.com",
    installationType: "pip",
    pipPackage: "mindsdb-mcp",
    official: true,
    installConfig: {
      command: "uvx",
      args: ["mindsdb-mcp"]
    },
    tags: ["mindsdb", "data", "ml", "official"]
  },
  // === FRAMEWORKS ===
  {
    id: "fastmcp",
    name: "FastMCP",
    description: "The fast, Pythonic way to build MCP servers and clients",
    category: "developer-tools",
    repository: "https://github.com/jlowin/fastmcp",
    installationType: "pip",
    pipPackage: "fastmcp",
    installConfig: {
      command: "pip",
      args: ["install", "fastmcp"]
    },
    tags: ["framework", "python", "sdk"]
  },
  {
    id: "mcp-use",
    name: "MCP Use",
    description: "Easiest way to interact with MCP servers with custom agents",
    category: "developer-tools",
    repository: "https://github.com/mcp-use/mcp-use",
    installationType: "pip",
    pipPackage: "mcp-use",
    installConfig: {
      command: "pip",
      args: ["install", "mcp-use"]
    },
    tags: ["framework", "agents", "python"]
  },
  // === GAMING ===
  {
    id: "unity-mcp",
    name: "Unity MCP",
    description: "MCP server for Unity Editor control and game development",
    category: "other",
    repository: "https://github.com/Artmann/unity-mcp",
    website: "https://unity.com",
    installationType: "npx",
    npmPackage: "unity-mcp",
    installConfig: {
      command: "npx",
      args: ["-y", "unity-mcp"]
    },
    tags: ["unity", "game-dev", "editor"]
  },
  // === RESEARCH ===
  {
    id: "arxiv-mcp",
    name: "ArXiv MCP",
    description: "Search ArXiv research papers",
    category: "other",
    repository: "https://github.com/blazickjp/arxiv-mcp-server",
    website: "https://arxiv.org",
    installationType: "pip",
    pipPackage: "arxiv-mcp-server",
    installConfig: {
      command: "uvx",
      args: ["arxiv-mcp-server"]
    },
    tags: ["arxiv", "research", "papers"]
  },
  {
    id: "gpt-researcher-mcp",
    name: "GPT Researcher MCP",
    description: "LLM agent for deep research on any topic with citations",
    category: "other",
    repository: "https://github.com/assafelovic/gpt-researcher",
    installationType: "pip",
    pipPackage: "gpt-researcher",
    installConfig: {
      command: "uvx",
      args: ["gpt-researcher-mcp"]
    },
    tags: ["research", "agent", "citations"]
  },
  // === OTHER POPULAR ===
  {
    id: "apple-shortcuts-mcp",
    name: "Apple Shortcuts MCP",
    description: "Integration with Apple Shortcuts on macOS",
    category: "other",
    repository: "https://github.com/recursechat/mcp-server-apple-shortcuts",
    installationType: "npx",
    npmPackage: "mcp-server-apple-shortcuts",
    installConfig: {
      command: "npx",
      args: ["-y", "mcp-server-apple-shortcuts"]
    },
    tags: ["apple", "shortcuts", "macos", "automation"]
  },
  {
    id: "octocode-mcp",
    name: "Octocode MCP",
    description: "AI-powered developer assistant for GitHub and NPM research",
    category: "developer-tools",
    repository: "https://github.com/bgauryy/octocode-mcp",
    installationType: "npx",
    npmPackage: "octocode-mcp",
    installConfig: {
      command: "npx",
      args: ["-y", "octocode-mcp"]
    },
    requiredEnvVars: [
      {
        name: "GITHUB_PERSONAL_ACCESS_TOKEN",
        description: "GitHub Personal Access Token"
      }
    ],
    tags: ["github", "npm", "research", "code"]
  }
];
function getMCPsByCategory(category) {
  return MCP_REGISTRY.filter((mcp) => mcp.category === category);
}
function searchMCPs$1(query) {
  const lowerQuery = query.toLowerCase();
  return MCP_REGISTRY.filter(
    (mcp) => mcp.name.toLowerCase().includes(lowerQuery) || mcp.description.toLowerCase().includes(lowerQuery) || mcp.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}
function getAllCategories() {
  return Array.from(new Set(MCP_REGISTRY.map((mcp) => mcp.category)));
}
function formatCategory(category) {
  return category.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function getCategoryIcon(category) {
  const icons = {
    "browser-automation": "🌐",
    database: "🗄️",
    "cloud-platform": "☁️",
    "developer-tools": "🛠️",
    "file-system": "📁",
    communication: "💬",
    "search-web": "🔍",
    "ai-services": "🤖",
    "workflow-automation": "⚡",
    "version-control": "📝",
    "data-visualization": "📊",
    "coding-agents": "🧑‍💻",
    security: "🔒",
    productivity: "📋",
    monitoring: "📈",
    finance: "💰",
    "social-media": "📱",
    aggregator: "🔗",
    other: "📦"
  };
  return icons[category] || "📦";
}
function formatMCPChoice(mcp) {
  let name = `${getCategoryIcon(mcp.category)} ${mcp.name}`;
  if (mcp.official) {
    name += ` ${c("green", "✓")}`;
  }
  name += ` - ${dim(mcp.description.slice(0, 45))}${mcp.description.length > 45 ? "..." : ""}`;
  return name;
}
async function selectTargetClient() {
  const currentClient = detectCurrentClient();
  console.log();
  console.log(c("blue", " ┌" + "─".repeat(60) + "┐"));
  console.log(
    c("blue", " │ ") + bold("Select Target Client") + " ".repeat(40) + c("blue", "│")
  );
  console.log(c("blue", " └" + "─".repeat(60) + "┘"));
  console.log();
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
  const choices = [];
  for (const clientId of clientOrder) {
    const client = MCP_CLIENTS[clientId];
    const isAvailable = clientConfigExists(clientId);
    let name = `${client.name} - ${dim(client.description)}`;
    if (isAvailable) {
      name += ` ${c("green", "○")}`;
    } else {
      name += ` ${c("dim", "✗")}`;
    }
    if (currentClient === clientId) {
      name = `${c("green", "★")} ${name} ${c("yellow", "(Current)")}`;
    }
    choices.push({
      name,
      value: clientId,
      disabled: !isAvailable ? "Not installed" : false
    });
  }
  choices.sort((a, b) => {
    if (a.disabled && !b.disabled) return 1;
    if (!a.disabled && b.disabled) return -1;
    if (currentClient === a.value) return -1;
    if (currentClient === b.value) return 1;
    return 0;
  });
  choices.push(new Separator());
  choices.push({
    name: `${c("cyan", "⚙")} Custom Path - ${dim("Specify your own config path")}`,
    value: "custom"
  });
  choices.push(new Separator());
  choices.push({
    name: `${c("dim", "← Back to main menu")}`,
    value: "back"
  });
  const selected = await select({
    message: "Where would you like to install the MCP?",
    choices,
    loop: false,
    pageSize: 15
  });
  if (selected === "back") return null;
  if (selected === "custom") {
    const customPath = await promptCustomPath();
    if (!customPath) return null;
    return { client: "custom", customPath };
  }
  return { client: selected };
}
async function promptCustomPath() {
  console.log();
  console.log(
    `  ${c("blue", "ℹ")} Enter the full path to your MCP config file`
  );
  console.log(`  ${dim("Leave empty to go back")}`);
  console.log();
  const customPath = await input({
    message: "Config path (or Enter to go back):",
    validate: (value) => {
      if (!value.trim()) return true;
      if (!value.endsWith(".json")) {
        return "Path must be a .json file";
      }
      return true;
    }
  });
  if (!customPath || !customPath.trim()) return null;
  if (customPath.startsWith("~")) {
    return customPath.replace("~", process.env.HOME || "");
  }
  return customPath;
}
async function selectBrowseMode() {
  console.log();
  const choices = [
    {
      name: `🔍 Search MCPs - ${dim("Find by name, description, or tags")}`,
      value: "search"
    },
    {
      name: `📂 Browse by Category - ${dim(`${getAllCategories().length} categories`)}`,
      value: "category"
    },
    {
      name: `⭐ Popular MCPs - ${dim("Top 20 most popular")}`,
      value: "popular"
    },
    {
      name: `📋 Full List (A-Z) - ${dim(`All ${MCP_REGISTRY.length} MCPs alphabetically`)}`,
      value: "all"
    },
    new Separator(),
    {
      name: `${c("dim", "← Back to client selection")}`,
      value: "back"
    }
  ];
  const choice = await select({
    message: "How would you like to find MCPs?",
    choices,
    loop: false
  });
  return choice;
}
async function searchMCPs() {
  console.log();
  console.log(
    `  ${c("blue", "ℹ")} Enter search terms (name, description, or tags)`
  );
  console.log(`  ${dim("Leave empty to go back")}`);
  console.log();
  const query = await input({
    message: "Search:"
  });
  if (!query || !query.trim()) return "back";
  const results = searchMCPs$1(query.trim());
  if (results.length === 0) {
    console.log();
    console.log(`  ${c("yellow", "⚠")} No MCPs found matching "${query}"`);
    console.log(`  ${dim("Try different keywords or browse by category")}`);
    console.log();
    return null;
  }
  console.log();
  console.log(
    `  ${c("green", "✓")} Found ${bold(String(results.length))} MCP${results.length > 1 ? "s" : ""}`
  );
  console.log();
  return await selectFromList(results, `Search: "${query}"`);
}
async function selectByCategory() {
  const categories = getAllCategories();
  const choices = categories.map((cat) => ({
    name: `${getCategoryIcon(cat)} ${formatCategory(cat)} (${getMCPsByCategory(cat).length})`,
    value: cat
  }));
  choices.sort((a, b) => {
    const countA = getMCPsByCategory(a.value).length;
    const countB = getMCPsByCategory(b.value).length;
    return countB - countA;
  });
  choices.push(new Separator());
  choices.push({
    name: `${c("dim", "← Back")}`,
    value: "back"
  });
  const category = await select({
    message: "Select a category:",
    choices,
    loop: false,
    pageSize: 15
  });
  if (category === "back") return "back";
  const mcps = getMCPsByCategory(category);
  return await selectFromList(mcps, formatCategory(category));
}
async function selectPopular() {
  const popular = MCP_REGISTRY.slice(0, 20);
  return await selectFromList(popular, "Popular MCPs");
}
async function selectAll() {
  const allMcps = [...MCP_REGISTRY].sort(
    (a, b) => a.name.localeCompare(b.name)
  );
  return await selectFromList(
    allMcps,
    `All MCPs (A-Z) - ${allMcps.length} total`
  );
}
async function selectFromList(mcps, title) {
  console.log();
  console.log(`  ${bold(title)}`);
  console.log();
  const choices = mcps.map((mcp) => ({
    name: formatMCPChoice(mcp),
    value: mcp
  }));
  choices.push(new Separator());
  choices.push({
    name: `${c("dim", "← Back")}`,
    value: "back"
  });
  const selected = await select({
    message: "Select an MCP to install:",
    choices,
    loop: false,
    pageSize: 15
  });
  return selected;
}
async function promptEnvVars(mcp) {
  const envVars = mcp.requiredEnvVars;
  if (!envVars || envVars.length === 0) {
    return {};
  }
  console.log();
  console.log(c("yellow", " ┌" + "─".repeat(60) + "┐"));
  console.log(
    c("yellow", " │ ") + `${c("yellow", "⚠")} ${bold("Environment Variables Required")}` + " ".repeat(26) + c("yellow", "│")
  );
  console.log(c("yellow", " └" + "─".repeat(60) + "┘"));
  console.log();
  console.log(
    `  ${dim("This MCP requires the following environment variables:")}`
  );
  console.log();
  for (const env of envVars) {
    console.log(`  ${c("cyan", env.name)}`);
    console.log(`    ${dim(env.description)}`);
    if (env.example) {
      console.log(`    ${dim("Example:")} ${c("dim", env.example)}`);
    }
    console.log();
  }
  const proceed = await select({
    message: "Would you like to configure these now?",
    choices: [
      {
        name: `${c("green", "✓")} Configure environment variables`,
        value: "configure"
      },
      {
        name: `${c("yellow", "○")} Skip - ${dim("Configure later manually")}`,
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
  if (proceed === "back") return "back";
  if (proceed === "skip") return {};
  const values = {};
  for (const env of envVars) {
    console.log();
    console.log(`  ${c("cyan", env.name)}: ${dim(env.description)}`);
    if (env.example) {
      console.log(`  ${dim("Example:")} ${env.example}`);
    }
    const value = await input({
      message: `${env.name}:`,
      validate: (val) => {
        if (!val.trim() && !env.name.includes("OPTIONAL")) {
          return `${env.name} is required`;
        }
        return true;
      }
    });
    if (value.trim()) {
      values[env.name] = value.trim();
    }
  }
  return values;
}
async function confirmInstall(mcp, client) {
  const clientInfo = MCP_CLIENTS[client];
  console.log();
  const choice = await select({
    message: `Install ${mcp.name} to ${clientInfo?.name || client}?`,
    choices: [
      {
        name: `${c("green", "✓")} Proceed with installation`,
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
function printMCPDetails(mcp) {
  console.log();
  console.log(c("blue", " ┌" + "─".repeat(60) + "┐"));
  console.log(
    c("blue", " │ ") + bold(mcp.name) + (mcp.official ? ` ${c("green", "✓ Official")}` : "") + " ".repeat(Math.max(0, 60 - mcp.name.length - (mcp.official ? 12 : 0))) + c("blue", "│")
  );
  console.log(c("blue", " └" + "─".repeat(60) + "┘"));
  console.log();
  console.log(`  ${dim("Description:")} ${mcp.description}`);
  console.log(`  ${dim("Category:")} ${c("cyan", mcp.category)}`);
  console.log(`  ${dim("Installation:")} ${c("yellow", mcp.installationType)}`);
  if (mcp.website) {
    console.log(`  ${dim("Website:")} ${c("blue", mcp.website)}`);
  }
  console.log(`  ${dim("Repository:")} ${c("blue", mcp.repository)}`);
  if (mcp.tags && mcp.tags.length > 0) {
    console.log(
      `  ${dim("Tags:")} ${mcp.tags.map((t) => c("dim", t)).join(", ")}`
    );
  }
  console.log();
}
function printInstallPreview(mcp, client, configPath, envValues) {
  const clientInfo = MCP_CLIENTS[client];
  console.log(c("blue", " ┌" + "─".repeat(60) + "┐"));
  console.log(
    c("blue", " │ ") + bold("Configuration Preview") + " ".repeat(39) + c("blue", "│")
  );
  console.log(c("blue", " └" + "─".repeat(60) + "┘"));
  console.log();
  const serverConfig = {
    command: mcp.installConfig.command,
    args: [...mcp.installConfig.args],
    ...Object.keys(envValues).length > 0 && { env: envValues }
  };
  console.log(`  ${dim("Server ID:")} ${c("cyan", mcp.id)}`);
  console.log(`  ${dim("Command:")} ${c("green", serverConfig.command)}`);
  console.log(`  ${dim("Args:")} ${c("yellow", serverConfig.args.join(" "))}`);
  if (Object.keys(envValues).length > 0) {
    console.log(`  ${dim("Environment Variables:")}`);
    for (const [key, value] of Object.entries(envValues)) {
      const displayValue = value.length > 30 ? value.slice(0, 27) + "..." : value;
      console.log(`    ${c("cyan", key)}: ${dim(displayValue)}`);
    }
  }
  console.log();
  console.log(`  ${bold("Target:")}`);
  console.log(`  ${dim("Client:")} ${clientInfo?.name || client}`);
  console.log(`  ${dim("Config:")} ${c("cyan", configPath)}`);
  console.log();
}
function printInstallSuccess(mcp, client, configPath, backupPath) {
  const clientInfo = MCP_CLIENTS[client];
  console.log();
  console.log(c("green", " ┌" + "─".repeat(60) + "┐"));
  console.log(
    c("green", " │ ") + `${c("green", "✓")} ${bold("MCP installed successfully!")}` + " ".repeat(30) + c("green", "│")
  );
  console.log(c("green", " └" + "─".repeat(60) + "┘"));
  console.log();
  console.log(`  ${bold("Installed:")} ${mcp.name}`);
  console.log(`  ${bold("To:")} ${clientInfo?.name || client}`);
  console.log(`  ${dim("Config:")} ${c("cyan", configPath)}`);
  if (backupPath) {
    console.log(`  ${dim("Backup:")} ${backupPath}`);
  }
  console.log();
  console.log(`  ${bold("Next steps:")}`);
  console.log(`  1. Restart ${clientInfo?.name || client}`);
  console.log(`  2. Look for ${c("cyan", mcp.id)} in MCP servers`);
  if (mcp.website) {
    console.log(`  3. Check ${c("blue", mcp.website)} for usage docs`);
  }
  console.log();
}
function printInstallError(error) {
  console.log();
  console.log(c("red", " ┌" + "─".repeat(60) + "┐"));
  console.log(
    c("red", " │ ") + `${c("red", "✗")} ${bold("Installation failed")}` + " ".repeat(38) + c("red", "│")
  );
  console.log(c("red", " └" + "─".repeat(60) + "┘"));
  console.log();
  console.log(`  ${c("red", "Error:")} ${error}`);
  console.log();
}
function buildServerConfig(mcp, envValues) {
  const config = {
    command: mcp.installConfig.command,
    args: [...mcp.installConfig.args]
  };
  const allEnv = {
    ...mcp.installConfig.env || {},
    ...envValues
  };
  if (Object.keys(allEnv).length > 0) {
    config.env = allEnv;
  }
  return config;
}
function installExternalMCP(mcp, client, customPath, envValues) {
  const configPath = client === "custom" && customPath ? customPath : getMCPConfigPath(client, customPath);
  let config = readMCPConfig(configPath) || { mcpServers: {} };
  const serverConfig = buildServerConfig(mcp, envValues);
  config = {
    ...config,
    mcpServers: {
      ...config.mcpServers,
      [mcp.id]: serverConfig
    }
  };
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
async function pressEnterToContinue$1() {
  console.log();
  await input({
    message: dim("Press Enter to continue..."),
    default: ""
  });
}
async function runExternalMCPFlow() {
  await loadInquirer();
  console.log();
  console.log(c("blue", "━".repeat(66)));
  console.log(` 🔌 ${bold("Install External MCP")}`);
  console.log(c("blue", "━".repeat(66)));
  console.log();
  console.log(`  ${dim("Browse and install from 70+ community MCP servers")}`);
  const state = {
    client: null,
    browseMode: null,
    selectedMCP: null,
    envValues: {}
  };
  let currentStep = "client";
  while (currentStep !== "done") {
    switch (currentStep) {
      // Step 1: Select target client (IDE)
      case "client": {
        const selection = await selectTargetClient();
        if (!selection) {
          return;
        }
        state.client = selection.client;
        state.customPath = selection.customPath;
        currentStep = "browse";
        break;
      }
      // Step 2: Select browse mode
      case "browse": {
        const mode = await selectBrowseMode();
        if (mode === "back" || mode === null) {
          currentStep = "client";
          break;
        }
        state.browseMode = mode;
        currentStep = "selectMCP";
        break;
      }
      // Step 3: Select MCP based on browse mode
      case "selectMCP": {
        let result = null;
        switch (state.browseMode) {
          case "search":
            result = await searchMCPs();
            break;
          case "category":
            result = await selectByCategory();
            break;
          case "popular":
            result = await selectPopular();
            break;
          case "all":
            result = await selectAll();
            break;
        }
        if (result === "back") {
          currentStep = "browse";
          break;
        }
        if (result === null) {
          currentStep = "browse";
          break;
        }
        state.selectedMCP = result;
        currentStep = "details";
        break;
      }
      // Step 4: Show MCP details
      case "details": {
        printMCPDetails(state.selectedMCP);
        const { select: select2, Separator: Separator2 } = await Promise.resolve().then(() => prompts);
        const choice = await select2({
          message: "What would you like to do?",
          choices: [
            {
              name: `${c("green", "✓")} Continue to install`,
              value: "continue"
            },
            new Separator2(),
            {
              name: `${c("dim", "← Back to MCP list")}`,
              value: "back"
            }
          ],
          loop: false
        });
        if (choice === "back") {
          currentStep = "selectMCP";
          break;
        }
        currentStep = "envVars";
        break;
      }
      // Step 5: Configure environment variables
      case "envVars": {
        const envResult = await promptEnvVars(state.selectedMCP);
        if (envResult === "back") {
          currentStep = "details";
          break;
        }
        if (envResult === null) {
          currentStep = "details";
          break;
        }
        state.envValues = envResult;
        currentStep = "confirm";
        break;
      }
      // Step 6: Confirm installation
      case "confirm": {
        const configPath = state.client === "custom" && state.customPath ? state.customPath : getMCPConfigPath(state.client, state.customPath);
        printInstallPreview(
          state.selectedMCP,
          state.client,
          configPath,
          state.envValues
        );
        const confirmation = await confirmInstall(
          state.selectedMCP,
          state.client
        );
        if (confirmation === "back") {
          currentStep = "envVars";
          break;
        }
        if (confirmation === "cancel") {
          console.log();
          console.log(`  ${dim("Installation cancelled.")}`);
          return;
        }
        currentStep = "install";
        break;
      }
      // Step 7: Perform installation
      case "install": {
        const spinner = new Spinner("Installing MCP...").start();
        await new Promise((resolve) => setTimeout(resolve, 500));
        const result = installExternalMCP(
          state.selectedMCP,
          state.client,
          state.customPath,
          state.envValues
        );
        if (result.success) {
          spinner.succeed("MCP installed successfully!");
          printInstallSuccess(
            state.selectedMCP,
            state.client,
            result.configPath,
            result.backupPath
          );
        } else {
          spinner.fail("Installation failed");
          printInstallError(result.error || "Unknown error");
        }
        await pressEnterToContinue$1();
        currentStep = "done";
        break;
      }
    }
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
    githubAuth: getAuthStatus()
  };
}
function getClientNames(clients) {
  return clients.map((c2) => MCP_CLIENTS[c2.client]?.name || c2.client).join(", ");
}
function buildSkillsMenuItem(skills) {
  if (!skills.sourceExists || !skills.hasSkills) {
    return {
      name: "📚 Manage Skills",
      value: "skills",
      description: dim("No skills available")
    };
  }
  if (skills.allInstalled) {
    return {
      name: `📚 Manage Skills ${c("green", "✓")}`,
      value: "skills",
      description: `${skills.installedCount} installed · Claude Code`
    };
  }
  if (skills.installedCount > 0) {
    return {
      name: "📚 Manage Skills",
      value: "skills",
      description: `${skills.installedCount}/${skills.skills.length} installed`
    };
  }
  return {
    name: "📚 Install Skills",
    value: "skills",
    description: "Add Octocode skills to Claude Code"
  };
}
function buildAuthMenuItem(auth2) {
  if (auth2.authenticated) {
    return {
      name: `🔑 GitHub Account ${c("green", "✓")}`,
      value: "auth",
      description: `@${auth2.username || "connected"}`
    };
  }
  return {
    name: "🔑 Connect GitHub",
    value: "auth",
    description: "Required for private repos"
  };
}
async function showMainMenu(state) {
  const statusParts = [];
  if (state.octocode.isInstalled) {
    const names = getClientNames(state.octocode.installedClients);
    statusParts.push(`${c("green", "✓")} ${c("cyan", names)}`);
  }
  if (state.githubAuth.authenticated) {
    statusParts.push(
      `${c("green", "✓")} @${c("cyan", state.githubAuth.username || "github")}`
    );
  } else {
    statusParts.push(`${c("yellow", "○")} ${dim("GitHub")}`);
  }
  if (statusParts.length > 0) {
    console.log(`  ${statusParts.join(dim("  ·  "))}`);
  }
  const choices = [];
  if (state.octocode.isInstalled) {
    choices.push({
      name: "⚙️  Settings",
      value: "conf",
      description: "Configure octocode-mcp options"
    });
    if (state.octocode.hasMoreToInstall) {
      const availableNames = getClientNames(state.octocode.availableClients);
      choices.push({
        name: "📦 Add to Client",
        value: "install",
        description: `Install to ${availableNames}`
      });
    }
  } else {
    choices.push({
      name: "📦 Install Octocode",
      value: "install",
      description: "Setup MCP server for your AI client"
    });
  }
  choices.push({
    name: "🔌 MCP Marketplace",
    value: "external-mcp",
    description: "70+ servers · Playwright, Postgres, Stripe..."
  });
  choices.push(buildAuthMenuItem(state.githubAuth));
  choices.push(buildSkillsMenuItem(state.skills));
  choices.push(
    new Separator()
  );
  choices.push({
    name: dim("Exit"),
    value: "exit"
  });
  console.log();
  const choice = await select({
    message: "What would you like to do?",
    choices,
    pageSize: 12,
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
  if (isWindows) {
    const appData = getAppDataPath();
    return path.join(appData, "Claude", "skills");
  }
  return path.join(HOME, ".claude", "skills");
}
async function pressEnterToContinue() {
  console.log();
  await input({
    message: dim("Press Enter to continue..."),
    default: ""
  });
}
async function showSkillsMenu(hasUninstalled, hasInstalled) {
  const choices = [];
  if (hasUninstalled) {
    choices.push({
      name: "📥 Install skills",
      value: "install",
      description: "Install Octocode skills to Claude Code"
    });
  }
  if (hasInstalled) {
    choices.push({
      name: "🗑️  Uninstall skills",
      value: "uninstall",
      description: "Remove installed Octocode skills"
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
async function uninstallSkills(info) {
  const { destDir, skillsStatus } = info;
  const installed = skillsStatus.filter((s) => s.installed);
  if (installed.length === 0) {
    console.log(`  ${c("yellow", "⚠")} No skills are installed.`);
    console.log();
    await pressEnterToContinue();
    return false;
  }
  console.log(`  ${bold("Skills to uninstall:")}`);
  console.log();
  for (const skill of installed) {
    console.log(`    ${c("yellow", "○")} ${skill.name}`);
  }
  console.log();
  console.log(`  ${bold("Installation path:")}`);
  console.log(`  ${c("cyan", destDir)}`);
  console.log();
  const choice = await select({
    message: `Uninstall ${installed.length} skill(s)?`,
    choices: [
      {
        name: `${c("red", "🗑️")} Yes, uninstall skills`,
        value: "uninstall"
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
  const spinner = new Spinner("Uninstalling skills...").start();
  let uninstalledCount = 0;
  const failed = [];
  for (const skill of installed) {
    if (removeDirectory(skill.destPath)) {
      uninstalledCount++;
    } else {
      failed.push(skill.name);
    }
  }
  if (failed.length === 0) {
    spinner.succeed("Skills uninstalled!");
  } else {
    spinner.warn("Some skills failed to uninstall");
  }
  console.log();
  if (uninstalledCount > 0) {
    console.log(
      `  ${c("green", "✓")} Uninstalled ${uninstalledCount} skill(s)`
    );
    console.log(`  ${dim("Location:")} ${c("cyan", destDir)}`);
  }
  if (failed.length > 0) {
    console.log(`  ${c("red", "✗")} Failed: ${failed.join(", ")}`);
  }
  console.log();
  await pressEnterToContinue();
  return true;
}
async function showAuthMenu(isAuthenticated, username) {
  const choices = [];
  if (isAuthenticated) {
    choices.push({
      name: "🔓 Logout from GitHub",
      value: "logout",
      description: `Currently logged in as ${username || "unknown"}`
    });
    choices.push({
      name: "🔄 Switch account",
      value: "switch",
      description: "Logout and login with a different account"
    });
  } else {
    choices.push({
      name: "🔐 Login to GitHub",
      value: "login",
      description: "Authenticate using browser"
    });
  }
  choices.push(
    new Separator()
  );
  choices.push({
    name: `${c("dim", "← Back to main menu")}`,
    value: "back"
  });
  const choice = await select({
    message: "GitHub Authentication:",
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
async function runLoginFlow() {
  console.log();
  console.log(`  ${bold("🔐 GitHub Authentication")}`);
  console.log();
  console.log(
    `  ${dim("This will open your browser to authenticate with GitHub.")}`
  );
  console.log();
  let verificationShown = false;
  const spinner = new Spinner("Connecting to GitHub...").start();
  const result = await login({
    onVerification: (verification) => {
      spinner.stop();
      verificationShown = true;
      console.log(
        `  ${c("yellow", "!")} First copy your one-time code: ${bold(verification.user_code)}`
      );
      console.log();
      console.log(
        `  ${bold("Press Enter")} to open ${c("cyan", verification.verification_uri)} in your browser...`
      );
      console.log();
      console.log(`  ${dim("Waiting for authentication...")}`);
    }
  });
  if (!verificationShown) {
    spinner.stop();
  }
  console.log();
  if (result.success) {
    console.log(`  ${c("green", "✓")} Authentication complete!`);
    console.log(
      `  ${c("green", "✓")} Logged in as ${c("cyan", result.username || "unknown")}`
    );
    console.log();
    console.log(`  ${dim("Credentials stored in:")} ${getStoragePath()}`);
  } else {
    console.log(
      `  ${c("red", "✗")} Authentication failed: ${result.error || "Unknown error"}`
    );
  }
  console.log();
  await pressEnterToContinue();
  return result.success;
}
async function runLogoutFlow() {
  const status = getAuthStatus();
  console.log();
  console.log(`  ${bold("🔓 GitHub Logout")}`);
  console.log(
    `  ${dim("Currently logged in as:")} ${c("cyan", status.username || "unknown")}`
  );
  console.log();
  const result = await logout();
  if (result.success) {
    console.log(`  ${c("green", "✓")} Successfully logged out`);
  } else {
    console.log(
      `  ${c("red", "✗")} Logout failed: ${result.error || "Unknown error"}`
    );
  }
  console.log();
  await pressEnterToContinue();
  return result.success;
}
async function runAuthFlow() {
  await loadInquirer();
  console.log();
  console.log(c("blue", "━".repeat(66)));
  console.log(`  🔐 ${bold("GitHub Authentication")}`);
  console.log(c("blue", "━".repeat(66)));
  console.log();
  let inAuthMenu = true;
  while (inAuthMenu) {
    const status = getAuthStatus();
    if (status.authenticated) {
      console.log(
        `  ${c("green", "✓")} Logged in as ${c("cyan", status.username || "unknown")}`
      );
      if (status.tokenExpired) {
        console.log(
          `  ${c("yellow", "⚠")} Token has expired - please login again`
        );
      }
    } else {
      console.log(`  ${c("yellow", "⚠")} Not authenticated`);
    }
    console.log(`  ${dim("Credentials:")} ${getStoragePath()}`);
    console.log();
    const choice = await showAuthMenu(status.authenticated, status.username);
    switch (choice) {
      case "login":
        await runLoginFlow();
        break;
      case "logout":
        await runLogoutFlow();
        break;
      case "switch":
        console.log();
        console.log(`  ${dim("Logging out...")}`);
        await logout();
        console.log(`  ${c("green", "✓")} Logged out`);
        console.log();
        await runLoginFlow();
        break;
      case "back":
      default:
        inAuthMenu = false;
        break;
    }
  }
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
    const hasUninstalled = info.notInstalled.length > 0;
    const hasInstalled = info.skillsStatus.filter((s) => s.installed).length > 0;
    const choice = await showSkillsMenu(hasUninstalled, hasInstalled);
    switch (choice) {
      case "install": {
        const installed = await installSkills(info);
        if (installed) {
          continue;
        }
        break;
      }
      case "uninstall": {
        const uninstalled = await uninstallSkills(info);
        if (uninstalled) {
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
    case "auth":
      await runAuthFlow();
      return true;
    case "skills":
      await runSkillsFlow();
      return true;
    case "conf":
      await runConfigOptionsFlow();
      return true;
    case "external-mcp":
      await runExternalMCPFlow();
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
const OPTIONS_WITH_VALUES = /* @__PURE__ */ new Set([
  "ide",
  "method",
  "output",
  "o",
  "hostname",
  "h",
  "git-protocol",
  "p"
]);
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
  usage: "octocode-cli install --ide <cursor|claude> --method <npx|direct>",
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
const loginCommand = {
  name: "login",
  aliases: ["l"],
  description: "Authenticate with GitHub",
  usage: "octocode-cli login [--hostname <host>] [--git-protocol <ssh|https>]",
  options: [
    {
      name: "hostname",
      short: "h",
      description: "GitHub Enterprise hostname (default: github.com)",
      hasValue: true
    },
    {
      name: "git-protocol",
      short: "p",
      description: "Git protocol to use (ssh or https)",
      hasValue: true
    }
  ],
  handler: async (args) => {
    const hostname = args.options["hostname"] || "github.com";
    const status = getAuthStatus(hostname);
    if (status.authenticated) {
      console.log();
      console.log(
        `  ${c("green", "✓")} Already authenticated as ${c("cyan", status.username || "unknown")}`
      );
      console.log();
      console.log(`  ${dim("To switch accounts, logout first:")}`);
      console.log(`    ${c("cyan", "→")} ${c("yellow", "octocode logout")}`);
      console.log();
      return;
    }
    console.log();
    console.log(`  ${bold("🔐 GitHub Authentication")}`);
    console.log();
    const gitProtocol = args.options["git-protocol"] || "https";
    let verificationShown = false;
    const spinner = new Spinner("Waiting for GitHub authentication...").start();
    const result = await login({
      hostname,
      gitProtocol,
      onVerification: (verification) => {
        spinner.stop();
        verificationShown = true;
        console.log(
          `  ${c("yellow", "!")} First copy your one-time code: ${bold(verification.user_code)}`
        );
        console.log();
        console.log(
          `  ${bold("Press Enter")} to open ${c("cyan", verification.verification_uri)} in your browser...`
        );
        console.log();
        console.log(`  ${dim("Waiting for authentication...")}`);
      }
    });
    if (!verificationShown) {
      spinner.stop();
    }
    console.log();
    if (result.success) {
      console.log(`  ${c("green", "✓")} Authentication complete!`);
      console.log(
        `  ${c("green", "✓")} Logged in as ${c("cyan", result.username || "unknown")}`
      );
      console.log();
      console.log(`  ${dim("Credentials stored in:")} ${getStoragePath()}`);
    } else {
      console.log(
        `  ${c("red", "✗")} Authentication failed: ${result.error || "Unknown error"}`
      );
      process.exitCode = 1;
    }
    console.log();
  }
};
const logoutCommand = {
  name: "logout",
  description: "Sign out from GitHub",
  usage: "octocode-cli logout [--hostname <host>]",
  options: [
    {
      name: "hostname",
      short: "h",
      description: "GitHub Enterprise hostname",
      hasValue: true
    }
  ],
  handler: async (args) => {
    const hostname = args.options["hostname"] || "github.com";
    const status = getAuthStatus(hostname);
    if (!status.authenticated) {
      console.log();
      console.log(
        `  ${c("yellow", "⚠")} Not currently authenticated to ${hostname}`
      );
      console.log();
      console.log(`  ${dim("To login:")}`);
      console.log(`    ${c("cyan", "→")} ${c("yellow", "octocode-cli login")}`);
      console.log();
      return;
    }
    console.log();
    console.log(`  ${bold("🔐 GitHub Logout")}`);
    console.log(
      `  ${dim("Currently authenticated as:")} ${c("cyan", status.username || "unknown")}`
    );
    console.log();
    const result = await logout(hostname);
    if (result.success) {
      console.log(
        `  ${c("green", "✓")} Successfully logged out from ${hostname}`
      );
    } else {
      console.log(
        `  ${c("red", "✗")} Logout failed: ${result.error || "Unknown error"}`
      );
      process.exitCode = 1;
    }
    console.log();
  }
};
const authCommand = {
  name: "auth",
  aliases: ["a", "gh"],
  description: "Manage GitHub authentication",
  usage: "octocode-cli auth [login|logout|status]",
  handler: async (args) => {
    const subcommand = args.args[0];
    if (subcommand === "login") {
      return loginCommand.handler(args);
    }
    if (subcommand === "logout") {
      return logoutCommand.handler(args);
    }
    if (subcommand === "status") {
      return showAuthStatus();
    }
    const status = getAuthStatus();
    await showAuthStatus();
    await loadInquirer();
    const choices = status.authenticated ? [
      { name: "🔓 Logout from GitHub", value: "logout" },
      { name: "🔄 Switch account (logout & login)", value: "switch" },
      { name: "← Back", value: "back" }
    ] : [
      { name: "🔐 Login to GitHub", value: "login" },
      { name: "← Back", value: "back" }
    ];
    const action = await select({
      message: "What would you like to do?",
      choices
    });
    if (action === "login") {
      await loginCommand.handler({ command: "login", args: [], options: {} });
    } else if (action === "logout") {
      await logout();
      console.log();
      console.log(`  ${c("green", "✓")} Successfully logged out`);
      console.log();
    } else if (action === "switch") {
      console.log();
      console.log(`  ${dim("Logging out...")}`);
      await logout();
      console.log(`  ${c("green", "✓")} Logged out`);
      console.log();
      console.log(`  ${dim("Starting new login...")}`);
      await loginCommand.handler({ command: "login", args: [], options: {} });
    }
  }
};
async function showAuthStatus(hostname = "github.com") {
  console.log();
  console.log(`  ${bold("🔐 GitHub Authentication")}`);
  console.log();
  const status = getAuthStatus(hostname);
  if (status.authenticated) {
    console.log(
      `  ${c("green", "✓")} Authenticated as ${c("cyan", status.username || "unknown")}`
    );
    if (status.tokenExpired) {
      console.log(
        `  ${c("yellow", "⚠")} Token has expired - please login again`
      );
    }
    console.log(`  ${dim("Host:")} ${status.hostname}`);
  } else {
    console.log(`  ${c("yellow", "⚠")} ${c("yellow", "Not authenticated")}`);
    console.log();
    console.log(`  ${bold("To authenticate:")}`);
    console.log(`    ${c("cyan", "→")} ${c("yellow", "octocode-cli login")}`);
  }
  console.log();
  console.log(`  ${dim("Credentials stored in:")} ${getStoragePath()}`);
  console.log();
}
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
  usage: "octocode-cli skills [install|list]",
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
const tokenCommand = {
  name: "token",
  aliases: ["t"],
  description: "Print the stored GitHub OAuth token",
  usage: "octocode-cli token [--hostname <host>]",
  options: [
    {
      name: "hostname",
      short: "h",
      description: "GitHub Enterprise hostname (default: github.com)",
      hasValue: true
    }
  ],
  handler: async (args) => {
    const hostname = args.options["hostname"] || "github.com";
    const credentials = getCredentials(hostname);
    if (!credentials) {
      console.log();
      console.log(`  ${c("yellow", "⚠")} Not authenticated to ${hostname}`);
      console.log();
      console.log(`  ${dim("To login:")}`);
      console.log(`    ${c("cyan", "→")} ${c("yellow", "octocode-cli login")}`);
      console.log();
      process.exitCode = 1;
      return;
    }
    console.log(credentials.token.token);
  }
};
const statusCommand = {
  name: "status",
  aliases: ["s"],
  description: "Show GitHub authentication status",
  usage: "octocode-cli status [--hostname <host>]",
  options: [
    {
      name: "hostname",
      short: "h",
      description: "GitHub Enterprise hostname (default: github.com)",
      hasValue: true
    }
  ],
  handler: async (args) => {
    const hostname = args.options["hostname"] || "github.com";
    const status = getAuthStatus(hostname);
    console.log();
    if (status.authenticated) {
      console.log(
        `  ${c("green", "✓")} Logged in as ${c("cyan", status.username || "unknown")}`
      );
      console.log(`  ${dim("Host:")} ${status.hostname}`);
      if (status.tokenExpired) {
        console.log(
          `  ${c("yellow", "⚠")} Token has expired - please login again`
        );
      }
    } else {
      console.log(`  ${c("yellow", "⚠")} Not logged in`);
      console.log();
      console.log(`  ${dim("To login:")}`);
      console.log(`    ${c("cyan", "→")} ${c("yellow", "octocode-cli login")}`);
    }
    console.log();
  }
};
const commands = [
  installCommand,
  authCommand,
  loginCommand,
  logoutCommand,
  skillsCommand,
  tokenCommand,
  statusCommand
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
    `    ${c("magenta", "auth")}        Manage GitHub authentication`
  );
  console.log(`    ${c("magenta", "login")}       Authenticate with GitHub`);
  console.log(`    ${c("magenta", "logout")}      Sign out from GitHub`);
  console.log(
    `    ${c("magenta", "status")}      Show GitHub authentication status`
  );
  console.log(
    `    ${c("magenta", "token")}       Print the stored GitHub OAuth token`
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
  console.log(`    ${c("yellow", "octocode-cli auth")}`);
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
function printEnvHeader() {
  console.log(c("blue", "━".repeat(66)));
  console.log(`  🔍 ${bold("Environment")}`);
  console.log(c("blue", "━".repeat(66)));
}
async function runInteractiveMode() {
  await loadInquirer();
  clearScreen();
  printWelcome();
  printEnvHeader();
  const envStatus = await checkNodeEnvironment();
  printNodeEnvironmentStatus(envStatus);
  if (hasEnvironmentIssues(envStatus)) {
    console.log();
    console.log(
      `  ${dim("💡")} ${dim("Run")} ${c("cyan", "npx node-doctor")} ${dim("for diagnostics")}`
    );
  }
  if (!envStatus.nodeInstalled) {
    console.log();
    console.log(
      `  ${c("red", "✗")} ${bold("Node.js is required to run octocode-mcp")}`
    );
    printNodeDoctorHint();
    printGoodbye();
    return;
  }
  printFooter();
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
