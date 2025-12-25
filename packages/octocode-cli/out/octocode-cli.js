#!/usr/bin/env node
import fs from "node:fs";
import os, { homedir } from "node:os";
import path from "node:path";
import { spawnSync, execSync } from "node:child_process";
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
const notLoadedError = () => {
  throw new Error("Inquirer not loaded. Call loadInquirer() first.");
};
let select = notLoadedError;
let confirm = notLoadedError;
let input = notLoadedError;
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
    Separator = inquirer.Separator;
    loaded = true;
  } catch {
    console.error("\n  ❌ Missing dependency: @inquirer/prompts");
    console.error("  Please install it first:\n");
    console.error("    npm install @inquirer/prompts\n");
    process.exit(1);
  }
}
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
  console.log(dim("      Install and configure octocode-mcp"));
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
function getOctocodeServerConfig(method) {
  switch (method) {
    case "direct":
      return {
        command: "bash",
        args: [
          "-c",
          "curl -sL https://octocodeai.com/octocode/latest/index.js -o /tmp/index.js && node /tmp/index.js"
        ]
      };
    case "npx":
      return {
        command: "npx",
        args: ["octocode-mcp@latest"]
      };
    default:
      throw new Error(`Unknown install method: ${method}`);
  }
}
function getOctocodeServerConfigWindows(method) {
  if (method === "direct") {
    return {
      command: "powershell",
      args: [
        "-Command",
        "Invoke-WebRequest -Uri 'https://octocodeai.com/octocode/latest/index.js' -OutFile $env:TEMP\\index.js; node $env:TEMP\\index.js"
      ]
    };
  }
  return getOctocodeServerConfig(method);
}
function mergeOctocodeConfig(config, method) {
  const serverConfig = isWindows ? getOctocodeServerConfigWindows(method) : getOctocodeServerConfig(method);
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
async function selectMCPClient() {
  const currentClient = detectCurrentClient();
  const choices = [];
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
  for (const clientId of clientOrder) {
    const client = MCP_CLIENTS[clientId];
    const status = getClientInstallStatus(clientId);
    const statusIndicator = getClientStatusIndicator(status);
    const isAvailable = clientConfigExists(clientId);
    let name = `${client.name} - ${dim(client.description)}`;
    name += ` ${statusIndicator}`;
    if (currentClient === clientId) {
      name = `${c("green", "★")} ${name} ${c("yellow", "(Current)")}`;
    }
    choices.push({
      name,
      value: clientId,
      disabled: !isAvailable ? "Not installed" : void 0
    });
  }
  choices.sort((a, b) => {
    if (a.disabled && !b.disabled) return 1;
    if (!a.disabled && b.disabled) return -1;
    const aStatus = getClientInstallStatus(a.value);
    const bStatus = getClientInstallStatus(b.value);
    if (currentClient === a.value) return -1;
    if (currentClient === b.value) return 1;
    if (aStatus.octocodeInstalled && !bStatus.octocodeInstalled) return -1;
    if (!aStatus.octocodeInstalled && bStatus.octocodeInstalled) return 1;
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
    message: "Select MCP client to configure:",
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
    message: "MCP config path:",
    validate: (value) => {
      if (!value.trim()) {
        return "Path is required";
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
  if (!customPath) return null;
  return expandPath(customPath);
}
async function selectInstallMethod() {
  const selected = await select({
    message: "Select installation method:",
    choices: [
      {
        name: `${INSTALL_METHOD_INFO.npx.name} - ${dim(INSTALL_METHOD_INFO.npx.description)}`,
        value: "npx",
        description: INSTALL_METHOD_INFO.npx.pros.join(", ")
      },
      {
        name: `${INSTALL_METHOD_INFO.direct.name} - ${dim(INSTALL_METHOD_INFO.direct.description)}`,
        value: "direct",
        description: INSTALL_METHOD_INFO.direct.pros.join(", ")
      },
      { type: "separator", separator: "" },
      {
        name: `${c("dim", "← Back")}`,
        value: "back"
      }
    ]
  });
  if (selected === "back") return null;
  return selected;
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
async function showGitHubAuthGuidance() {
  await loadInquirer();
  console.log();
  console.log(c("blue", "━".repeat(66)));
  console.log(`  🔐 ${bold("GitHub CLI Authentication")}`);
  console.log(c("blue", "━".repeat(66)));
  console.log();
  const status = checkGitHubAuth();
  if (!status.installed) {
    console.log(
      `  ${c("red", "✗")} GitHub CLI (gh) is ${c("red", "not installed")}`
    );
    console.log();
    console.log(`  ${bold("Why do you need GitHub CLI?")}`);
    console.log(`    ${dim("Octocode uses GitHub CLI for authentication.")}`);
    console.log(
      `    ${dim("This provides secure access to GitHub repositories.")}`
    );
    console.log();
    console.log(`  ${bold("To install:")}`);
    console.log(`    ${c("cyan", "→")} Visit: ${c("underscore", GH_CLI_URL)}`);
    console.log();
    console.log(`  ${dim("macOS:")}     ${c("yellow", "brew install gh")}`);
    console.log(
      `  ${dim("Windows:")}   ${c("yellow", "winget install GitHub.cli")}`
    );
    console.log(`  ${dim("Linux:")}     ${c("yellow", "See " + GH_CLI_URL)}`);
    console.log();
    await promptContinue();
    return;
  }
  const version = getGitHubCLIVersion();
  console.log(
    `  ${c("green", "✓")} GitHub CLI is ${c("green", "installed")}` + (version ? dim(` (v${version})`) : "")
  );
  if (status.authenticated) {
    console.log(
      `  ${c("green", "✓")} Authenticated as ${c("cyan", status.username || "unknown")}`
    );
    console.log();
    console.log(
      `  ${c("green", "✓")} ${bold("You're all set!")} Octocode can access GitHub.`
    );
  } else {
    console.log(`  ${c("yellow", "⚠")} ${c("yellow", "Not authenticated")}`);
    console.log();
    console.log(`  ${bold("To authenticate:")}`);
    console.log(
      `    ${c("cyan", "→")} Run: ${c("yellow", getAuthLoginCommand())}`
    );
    console.log();
    console.log(
      `  ${dim("This will open a browser to authenticate with GitHub.")}`
    );
    console.log(`  ${dim("Follow the prompts to complete authentication.")}`);
  }
  console.log();
  await promptContinue();
}
async function promptContinue() {
  await select({
    message: "Press Enter to continue...",
    choices: [{ name: "→ Continue", value: "continue" }]
  });
}
function printConfigPreview(config) {
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
      c("dim", "          ") + c("green", `"${truncated}"`) + (isLast ? "" : c("dim", ","))
    );
  });
  console.log(c("dim", "        ]"));
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
function printExistingMCPConfig(config) {
  const servers = config.mcpServers || {};
  const serverNames = Object.keys(servers);
  if (serverNames.length === 0) {
    return;
  }
  const boxWidth = 62;
  console.log();
  console.log(c("cyan", "  ┌" + "─".repeat(boxWidth) + "┐"));
  for (const name of serverNames) {
    const server = servers[name];
    if (!server) continue;
    const command = server.command;
    const args = server.args.join(" ");
    const fullCommand = `${command} ${args}`;
    const maxContentWidth = boxWidth - 4;
    const displayName = c("magenta", name);
    const separator = dim(": ");
    const nameLen = name.length;
    const availableForCommand = maxContentWidth - nameLen - 2;
    const truncatedCommand = fullCommand.length > availableForCommand ? fullCommand.slice(0, availableForCommand - 3) + "..." : fullCommand;
    const line = `${displayName}${separator}${dim(truncatedCommand)}`;
    const visibleLen = name.length + 2 + truncatedCommand.length;
    const padding = Math.max(0, boxWidth - visibleLen);
    console.log(
      c("cyan", "  │ ") + line + " ".repeat(padding) + c("cyan", " │")
    );
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
  const { client, method, customPath, force = false } = options;
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
function getInstallPreviewForClient(client, method, customPath) {
  const configPath = client === "custom" && customPath ? customPath : getMCPConfigPath(client, customPath);
  const existing = checkExistingClientInstallation(client, customPath);
  const existingConfig = readMCPConfig(configPath);
  const serverConfig = isWindows ? getOctocodeServerConfigWindows(method) : getOctocodeServerConfig(method);
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
  const selection = await selectMCPClient();
  if (!selection) return;
  const { client, customPath } = selection;
  const clientInfo = MCP_CLIENTS[client];
  const configPath = customPath || getMCPConfigPath(client);
  const existingConfig = readMCPConfig(configPath);
  if (existingConfig && existingConfig.mcpServers && Object.keys(existingConfig.mcpServers).length > 0) {
    console.log();
    console.log(`  ${bold("Current MCP Configuration:")}`);
    printExistingMCPConfig(existingConfig);
  }
  const method = await selectInstallMethod();
  if (!method) return;
  const preview = getInstallPreviewForClient(client, method, customPath);
  console.log();
  console.log(`  ${dim("📁 Config file:")} ${c("cyan", preview.configPath)}`);
  if (preview.action === "override") {
    console.log();
    console.log(c("yellow", "  ┌" + "─".repeat(60) + "┐"));
    console.log(
      c("yellow", "  │ ") + `${c("yellow", "⚠")} ${bold("Octocode is already configured!")}` + " ".repeat(28) + c("yellow", "│")
    );
    console.log(c("yellow", "  │") + " ".repeat(60) + c("yellow", "│"));
    console.log(
      c("yellow", "  │ ") + `Current method: ${bold(preview.existingMethod || "unknown")}` + " ".repeat(60 - 18 - (preview.existingMethod?.length || 7)) + c("yellow", "│")
    );
    console.log(c("yellow", "  └" + "─".repeat(60) + "┘"));
    const overwrite = await confirm({
      message: `${c("yellow", "OVERRIDE")} existing configuration?`,
      default: false
    });
    if (!overwrite) {
      console.log(`  ${dim("Configuration unchanged.")}`);
      return;
    }
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
  console.log(`    ${dim("Client:")}   ${clientInfo.name}`);
  console.log(`    ${dim("Method:")}   ${INSTALL_METHOD_INFO[method].name}`);
  console.log(`    ${dim("Config:")}   ${preview.configPath}`);
  console.log(
    `    ${dim("Action:")}   ${preview.action === "override" ? c("yellow", "OVERRIDE") : preview.action === "add" ? c("green", "ADD") : c("green", "CREATE")}`
  );
  console.log();
  const proceed = await confirm({
    message: "Proceed with configuration?",
    default: true
  });
  if (!proceed) {
    console.log(`  ${dim("Configuration cancelled.")}`);
    return;
  }
  const spinner = new Spinner("Configuring octocode-mcp...").start();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const result = installOctocodeForClient({
    client,
    method,
    customPath,
    force: preview.action === "override"
  });
  if (result.success) {
    spinner.succeed("Octocode configured successfully!");
    printInstallSuccessForClient(result, client);
  } else {
    spinner.fail("Configuration failed");
    printInstallError(result);
  }
}
function printInstallSuccessForClient(result, client) {
  const clientInfo = MCP_CLIENTS[client];
  console.log();
  console.log(c("green", "  ┌" + "─".repeat(60) + "┐"));
  console.log(
    c("green", "  │ ") + `${c("green", "✓")} ${bold("Octocode installed successfully!")}` + " ".repeat(26) + c("green", "│")
  );
  console.log(c("green", "  └" + "─".repeat(60) + "┘"));
  console.log();
  console.log(`  ${dim("Config saved to:")} ${result.configPath}`);
  if (result.backupPath) {
    console.log(`  ${dim("Backup saved to:")} ${result.backupPath}`);
  }
  console.log();
  console.log(`  ${bold("Next steps:")}`);
  console.log(`    1. Restart ${clientInfo?.name || client}`);
  console.log(`    2. Look for ${c("cyan", "octocode")} in MCP servers`);
  console.log();
}
function printNodeEnvironmentStatus(status) {
  console.log();
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
  console.log();
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
  console.log();
  console.log(
    `  ${dim("For deeper diagnostics:")} ${c("cyan", "npx node-doctor")}`
  );
  console.log();
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
async function showMainMenu() {
  console.log();
  const choice = await select({
    message: "What would you like to do?",
    choices: [
      {
        name: "📦 Configure octocode-mcp",
        value: "install",
        description: "Configure MCP server for Cursor or Claude Desktop"
      },
      {
        name: "🔐 Check GitHub authentication",
        value: "gh-auth",
        description: "Verify GitHub CLI is installed and authenticated"
      },
      new Separator(),
      {
        name: "🚪 Exit",
        value: "exit",
        description: "Quit the application"
      },
      new Separator(" "),
      new Separator(
        c("magenta", `  ─── 🔍🐙 ${bold("https://octocode.ai")} ───`)
      )
    ],
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
async function handleMenuChoice(choice) {
  switch (choice) {
    case "install":
      await runInstallFlow();
      return true;
    case "gh-auth":
      await showGitHubAuthGuidance();
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
    const choice = await showMainMenu();
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
const commands = [installCommand, authCommand];
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
