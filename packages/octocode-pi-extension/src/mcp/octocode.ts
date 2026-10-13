import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI, type ExtensionContext, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { MCP_ENV, MCP_WAIT_ENV, envFlag, envInt } from '../shared/env.js';
import { octocodeHome } from '../shared/home.js';
import { sanitizeTerminalText } from '../shared/sanitize.js';
import type { Tool } from '@earendil-works/pi-mcp';
import { OctocodeServer, type Launch, type ServerStatus } from './client.js';
import { octocodeToolDefinition } from './tools.js';

/**
 * Octocode MCP (local code, LSP, GitHub and package registry research) runs on this extension's own MCP client
 * (`OctocodeServer`): it starts the `octocode-mcp` server at `session_start`, registers every tool the server lists as
 * `mcp__octocode__<name>` and keeps the server's instructions for the prompt. A server named `octocode` in Pi's
 * `mcp.json` (`~/.pi/agent/mcp.json`, `.pi/mcp.json`) takes precedence, which is how users override or disable it: then
 * Pi's MCP owns the server and this extension starts nothing.
 */
export const OCTOCODE_SERVER = 'octocode';

/** Octocode tools are named `mcp__<server>__<tool>`, as Pi names tools of an MCP server it runs. */
export const OCTOCODE_TOOL_PREFIX = `mcp__${OCTOCODE_SERVER}__`;

/**
 * The octocode-mcp releases this extension runs: 20.2.0 or a later 20.x, the first with the tool contract it expects.
 * The package.json dependency has the same range, so installing or updating the extension fetches the newest
 * compatible server; in this monorepo `dev setup` resolves it to the workspace build (`packages/octocode-mcp`).
 */
export const OCTOCODE_MCP_SPEC = 'octocode-mcp@^20.2.0';

/** Whether `name` is an Octocode MCP tool. */
export const isOctocodeTool = (name: string): boolean => name.startsWith(OCTOCODE_TOOL_PREFIX);

/** The server process: the installed octocode-mcp bin under this Node, else the newest npm release through npx. */
export function octocodeLaunch(cwd: string, env: NodeJS.ProcessEnv = process.env, entry = octocodeMcpEntry()): Launch {
  // Octocode reads only under the home directory unless told otherwise: allow the workspace and the Octocode home.
  // Tokens (GITHUB_TOKEN, …) need no forwarding: the server inherits this process's environment.
  const allowed = [...new Set([cwd, octocodeHome(env)])].join(',');
  const command = entry ? { command: process.execPath, args: [entry] } : { command: 'npx', args: ['-y', OCTOCODE_MCP_SPEC] };
  return { ...command, cwd, env: { WORKSPACE_ROOT: cwd, ALLOWED_PATHS: allowed } };
}

/** The longest the first prompt waits for the server to connect, in seconds. */
const DEFAULT_CONNECT_WAIT_SECONDS = 10;

/** Whether the Octocode MCP server is switched on for this process (`OCTOCODE_MCP=0` turns it off). */
export const octocodeMcpEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => envFlag(env, MCP_ENV, true);

/**
 * The `octocode` entry of Pi's `mcp.json` (global, then the trusted project's replacement or settings override), which
 * takes precedence over the registration; undefined when neither file defines one. Unreadable files count as absent.
 */
export function configuredOctocodeServer(cwd: string, projectTrusted: boolean, agentDir = getAgentDir()): { enabled?: unknown } | undefined {
  let entry: Record<string, unknown> | undefined;
  for (const file of [path.join(agentDir, 'mcp.json'), ...(projectTrusted ? [path.join(cwd, CONFIG_DIR_NAME, 'mcp.json')] : [])]) {
    try {
      const servers = (JSON.parse(fs.readFileSync(file, 'utf8')) as { mcpServers?: Record<string, unknown> }).mcpServers;
      const found = servers && typeof servers === 'object' ? servers[OCTOCODE_SERVER] : undefined;
      if (found && typeof found === 'object' && !Array.isArray(found)) {
        const config = found as Record<string, unknown>;
        // Pi project entries without a transport override only enabled/exposure/toolExposure of the global server.
        if (file !== path.join(agentDir, 'mcp.json') && config['command'] === undefined && config['url'] === undefined && config['type'] === undefined) {
          if (entry && Object.keys(config).every((key) => ['enabled', 'exposure', 'toolExposure'].includes(key))) entry = { ...entry, ...config };
        } else entry = config;
      }
    } catch {
      // Missing or malformed: Pi reports a malformed file itself.
    }
  }
  return entry;
}

/** Who runs the `octocode` server: the user (an `octocode` entry in `mcp.json`, through Pi's MCP), this extension, or nobody. */
export type OctocodeOwner = { by: 'user'; enabled: boolean } | { by: 'extension' } | { by: 'off' };

/**
 * The Octocode server for a session, on this extension's MCP client: started at `session_start`, its tools registered
 * with Pi, its instructions kept for the prompt, closed at `session_shutdown`.
 */
export class OctocodeMcp {
  private readonly server: OctocodeServer;
  /** What is registered with Pi under each tool name; Pi cannot unregister, so a withdrawn tool is registered hidden. */
  private readonly registered = new Map<string, { tool: Tool; definition: ToolDefinition }>();
  private ctx: ExtensionContext | undefined;
  /** Who ran the server when the session started. */
  private owned: OctocodeOwner = { by: 'off' };

  private readonly env: NodeJS.ProcessEnv;

  constructor(
    private readonly pi: Pick<ExtensionAPI, 'registerTool'>,
    options: { env?: NodeJS.ProcessEnv; version?: string; launch?: (cwd: string) => Launch } = {},
  ) {
    this.env = options.env ?? process.env;
    this.server = new OctocodeServer({
      launch: options.launch ?? ((cwd) => octocodeLaunch(cwd, this.env)),
      clientInfo: { name: 'octocode-pi-extension', version: options.version ?? '0' },
      onTools: (tools, instructions) => this.register(tools, instructions),
      onFailure: (message) => this.notifyFailure(message),
    });
  }

  /** The user's `mcp.json` entry wins; else this extension runs the server unless `OCTOCODE_MCP=0`. */
  owner(ctx: Pick<ExtensionContext, 'cwd' | 'isProjectTrusted'>): OctocodeOwner {
    const configured = configuredOctocodeServer(ctx.cwd, ctx.isProjectTrusted?.() ?? false);
    if (configured) return { by: 'user', enabled: configured.enabled !== false };
    return { by: octocodeMcpEnabled(this.env) ? 'extension' : 'off' };
  }

  /** Starts the server for this session's folder (without waiting), or stops it when the session has none to run. */
  async start(ctx: ExtensionContext): Promise<void> {
    this.ctx = ctx;
    this.owned = this.owner(ctx);
    if (this.owned.by === 'extension') this.server.start(ctx.cwd);
    else await this.server.close();
  }

  /** Waits for the server to connect, at most `OCTOCODE_MCP_WAIT_SECONDS` (default 10); false when it is not connected. */
  ready(ctx: ExtensionContext): Promise<boolean> {
    this.ctx = ctx;
    return this.server.ready(envInt(this.env, MCP_WAIT_ENV, DEFAULT_CONNECT_WAIT_SECONDS, { min: 0 }) * 1000, ctx.signal);
  }

  /** The server's `initialize` instructions (how its tools work together), sanitized: the server's text is not trusted. */
  get instructions(): string | undefined {
    const text = this.server.instructions;
    return text ? sanitizeTerminalText(text).trim() || undefined : undefined;
  }

  /** Stops the server and starts it again for this session, whatever state it was in. */
  async restart(ctx: ExtensionContext): Promise<ServerStatus> {
    this.ctx = ctx;
    await this.server.restart(ctx.cwd);
    return this.server.status();
  }

  status(): ServerStatus {
    return this.server.status();
  }

  /** `/octocode mcp`: what runs the server and how it is doing; the first line is the summary. */
  describe(): string {
    const owner = this.owned;
    if (owner.by === 'user') return `Octocode MCP: your own \`octocode\` server from mcp.json (${owner.enabled ? "Pi's MCP, see /mcp" : 'disabled there'})`;
    if (owner.by === 'off') return `Octocode MCP: off (${MCP_ENV}=0)`;
    const status = this.server.status();
    const server = status.serverName ? `${status.serverName} ${status.serverVersion ?? ''}`.trim() : 'octocode-mcp';
    switch (status.state) {
      case 'connected':
        return `Octocode MCP: connected (${server}, ${status.tools} tools, pid ${status.pid ?? '?'})`;
      case 'connecting':
        return 'Octocode MCP: connecting…';
      case 'failed':
        return `Octocode MCP: failed to start: ${status.error ?? 'unknown error'}\nRetry with /octocode mcp restart.`;
      case 'disconnected':
        return `Octocode MCP: stopped: ${status.error ?? 'the server exited'}\nThe next tool call starts it again once; or run /octocode mcp restart.`;
      default:
        return 'Octocode MCP: not started';
    }
  }

  /** Stops the server and its process tree. */
  async close(): Promise<void> {
    this.ctx = undefined;
    await this.server.close();
  }

  /** Registers every listed tool with Pi, and withdraws the ones the server no longer lists. */
  private register(tools: readonly Tool[], instructions: string | undefined): void {
    const namespace = { name: OCTOCODE_TOOL_PREFIX.replace(/__$/, ''), ...(instructions ? { instructions: sanitizeTerminalText(instructions).trim() } : {}) };
    const listed = new Set<string>();
    for (const tool of tools) {
      const name = `${OCTOCODE_TOOL_PREFIX}${tool.name}`;
      listed.add(name);
      const previous = this.registered.get(name);
      // Pi rebuilds the complete registry per registration. A reconnect or an unrelated tool change needs no rebuild.
      if (previous && isDeepStrictEqual(previous.tool, tool) && isDeepStrictEqual(previous.definition.namespace, namespace)) continue;
      const definition = octocodeToolDefinition(tool, { prefix: OCTOCODE_TOOL_PREFIX, namespace, call: (name, args, signal) => this.server.call(name, args, signal) });
      this.registered.set(definition.name, { tool, definition });
      this.pi.registerTool(definition);
    }
    for (const [name, { definition }] of this.registered) {
      if (listed.has(name)) continue;
      this.registered.delete(name);
      this.pi.registerTool({ ...definition, exposure: 'hidden' });
    }
  }

  private notifyFailure(message: string): void {
    const ctx = this.ctx;
    if (!ctx?.hasUI) return;
    try {
      ctx.ui.notify(`Octocode MCP failed to start: ${message}\nThe model has no Octocode tools this session. See /octocode mcp.`, 'warning');
    } catch {
      // The session ended before the server gave up.
    }
  }
}

/**
 * Wires the Octocode server to the session: its client starts at `session_start` (`OctocodeMcp.start` decides whether
 * this extension or the user's `mcp.json` runs it) and closes at `session_shutdown`.
 */
export function registerOctocodeMcp(pi: ExtensionAPI, version?: string): OctocodeMcp {
  const mcp = new OctocodeMcp(pi, { ...(version ? { version } : {}) });
  pi.on('session_start', async (_event, ctx) => mcp.start(ctx));
  pi.on('session_shutdown', async () => mcp.close());
  return mcp;
}

/** Absolute path of the bundled octocode-mcp bin (its `exports` hide package.json, so walk up from the entry). */
function octocodeMcpEntry(): string | undefined {
  try {
    let dir = path.dirname(fileURLToPath(import.meta.resolve('octocode-mcp')));
    for (let depth = 0; depth < 4; depth++, dir = path.dirname(dir)) {
      const manifestPath = path.join(dir, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { name?: string; bin?: string | Record<string, string> };
      if (manifest.name !== 'octocode-mcp') continue;
      const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.['octocode-mcp'];
      return bin ? path.join(dir, bin) : undefined;
    }
  } catch {
    // Not installed next to the extension.
  }
  return undefined;
}
