import { McpClient, McpConnectionClosedError, StdioTransport, type CallToolResult, type Tool } from '@earendil-works/pi-mcp';
import { errorMessage } from '../shared/util.js';

/** How the server process starts. */
export interface Launch {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export type ServerState = 'idle' | 'connecting' | 'connected' | 'failed' | 'disconnected' | 'closed';

export interface ServerStatus {
  state: ServerState;
  /** Why the last connection failed or ended. */
  error?: string;
  serverName?: string;
  serverVersion?: string;
  tools: number;
  pid?: number;
  cwd?: string;
}

export interface ServerOptions {
  launch: (cwd: string) => Launch;
  /** Client name and version sent in `initialize`. */
  clientInfo: { name: string; version: string };
  /** Every (re)listing of the server's tools, with its instructions. */
  onTools: (tools: Tool[], instructions: string | undefined) => void;
  /** The first failure to connect since the last success or restart. */
  onFailure: (message: string) => void;
  /** Bound on `initialize`, `tools/list` and each `tools/call`. */
  requestTimeoutMs?: number;
}

const REQUEST_TIMEOUT_MS = 60_000;
const STDERR_TAIL_CHARS = 2_000;

/**
 * One stdio MCP server process and its client: the connection lifecycle, nothing about Pi. It connects once per
 * session folder, keeps the server's tools and instructions, follows `tools/list_changed`, and after the process dies
 * or a connect fails it reconnects once, on the next `ready()` or tool call, then reports a clear error until
 * `restart()`. `close()` ends the process tree.
 */
export class OctocodeServer {
  private state: ServerState = 'idle';
  private cwd: string | undefined;
  private client: McpClient | undefined;
  private transport: StdioTransport | undefined;
  private connecting: Promise<boolean> | undefined;
  /** The client of a connect in progress, so a stop can end its process before it finishes starting. */
  private starting: McpClient | undefined;
  private error: string | undefined;
  private tools: Tool[] = [];
  private instructionsText: string | undefined;
  /** Automatic reconnects left; one per failure episode, restored by a success or `restart()`. */
  private retries = 1;
  private reported = false;
  /** Bumped by every close, so a connect that finishes after one discards itself. */
  private generation = 0;
  private listRevision = 0;

  constructor(private readonly options: ServerOptions) {}

  get instructions(): string | undefined {
    return this.instructionsText;
  }

  status(): ServerStatus {
    const info = this.client?.serverInfo;
    return {
      state: this.state,
      ...(this.error ? { error: this.error } : {}),
      ...(info ? { serverName: info.name, serverVersion: info.version } : {}),
      tools: this.tools.length,
      ...(this.transport?.pid !== undefined && this.state === 'connected' ? { pid: this.transport.pid } : {}),
      ...(this.cwd ? { cwd: this.cwd } : {}),
    };
  }

  /** Connect for the session folder `cwd`; a new folder replaces the running server. */
  start(cwd: string): void {
    if (this.cwd !== cwd) {
      this.cwd = cwd;
      void this.stop();
      this.reset();
    }
    if (this.state === 'idle' || this.state === 'closed') void this.connect(cwd);
  }

  /** Stop the server and connect again for `cwd`, with the retry restored. */
  async restart(cwd: string): Promise<boolean> {
    await this.stop();
    this.cwd = cwd;
    this.reset();
    return this.connect(cwd);
  }

  async close(): Promise<void> {
    await this.stop();
    this.cwd = undefined;
  }

  /**
   * Whether the server is connected, waiting at most `waitMs` for a connect in progress. A failed or dead server is
   * retried once; a failure ends the wait at once.
   */
  async ready(waitMs = Number.POSITIVE_INFINITY, signal?: AbortSignal): Promise<boolean> {
    if (this.state === 'connected') return true;
    const attempt = this.connecting ?? this.reconnect();
    if (!attempt) return false;
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    const stop = new Promise<false>((resolve) => {
      if (Number.isFinite(waitMs)) timer = setTimeout(() => resolve(false), waitMs);
      if (signal) {
        onAbort = () => resolve(false);
        if (signal.aborted) resolve(false);
        else signal.addEventListener('abort', onAbort, { once: true });
      }
    });
    try {
      return await Promise.race([attempt, stop]);
    } finally {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  }

  /** `tools/call`, whole: no truncation. Reconnects once when the server has died. */
  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CallToolResult> {
    if (!(await this.ready(Number.POSITIVE_INFINITY, signal)) || !this.client) {
      signal?.throwIfAborted();
      throw new Error(`Octocode MCP server is not available${this.error ? `: ${this.error}` : ''}. Restart it with /octocode mcp restart.`);
    }
    try {
      return await this.client.callTool(name, args, { ...(signal ? { signal } : {}), timeoutMs: this.options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS });
    } catch (error) {
      if (error instanceof McpConnectionClosedError) throw new Error(`Octocode MCP server stopped during the call${this.error ? `: ${this.error}` : ''}. The next call starts it again.`);
      throw error;
    }
  }

  private reset(): void {
    this.retries = 1;
    this.reported = false;
    this.error = undefined;
    this.tools = [];
    this.instructionsText = undefined;
  }

  /** Starts the one automatic reconnect a failed or dead server gets; undefined when there is none left. */
  private reconnect(): Promise<boolean> | undefined {
    if (!this.cwd || this.state === 'idle' || this.state === 'closed' || this.retries <= 0) return undefined;
    this.retries--;
    return this.connect(this.cwd);
  }

  private connect(cwd: string): Promise<boolean> {
    const attempt: Promise<boolean> = this.open(cwd).finally(() => {
      if (this.connecting === attempt) this.connecting = undefined;
    });
    this.connecting = attempt;
    return attempt;
  }

  private async open(cwd: string): Promise<boolean> {
    const generation = ++this.generation;
    this.state = 'connecting';
    const timeoutMs = this.options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    const transport = new StdioTransport({ ...this.options.launch(cwd), stderr: 'pipe' });
    const client = new McpClient({ ...this.options.clientInfo, requestTimeoutMs: timeoutMs });
    this.starting = client;
    client.onClose(() => this.lost(client, transport));
    let listChangedDuringConnect = false;
    client.onNotification('notifications/tools/list_changed', () => {
      if (this.starting === client) listChangedDuringConnect = true;
      else if (this.client === client) void this.relist(client);
    });
    try {
      const init = await client.connect(transport);
      const tools = await client.listTools({ timeoutMs });
      if (generation !== this.generation) {
        await client.close();
        return false;
      }
      this.starting = undefined;
      this.client = client;
      this.transport = transport;
      this.tools = tools;
      this.instructionsText = init.instructions;
      this.state = 'connected';
      this.error = undefined;
      this.retries = 1;
      this.reported = false;
      this.options.onTools(tools, init.instructions);
      if (listChangedDuringConnect) await this.relist(client);
      return true;
    } catch (error) {
      await Promise.allSettled([client.close()]);
      if (generation !== this.generation) return false;
      this.starting = undefined;
      this.client = undefined;
      this.state = 'failed';
      this.error = this.describe(errorMessage(error), transport);
      if (!this.reported) {
        this.reported = true;
        this.options.onFailure(this.error);
      }
      return false;
    }
  }

  /** The server's tool list changed: list again and hand the new set on. */
  private async relist(client: McpClient): Promise<void> {
    const revision = ++this.listRevision;
    try {
      const tools = await client.listTools({ timeoutMs: this.options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS });
      if (client !== this.client || revision !== this.listRevision) return;
      this.tools = tools;
      this.options.onTools(tools, client.instructions);
    } catch {
      // The previous list stays; a call to a withdrawn tool gets the server's own error.
    }
  }

  /** The connection ended. Unplanned only when this client is still the current one. */
  private lost(client: McpClient, transport: StdioTransport): void {
    if (this.client !== client) return;
    this.client = undefined;
    this.state = 'disconnected';
    this.error = this.describe('the server process exited', transport);
  }

  private async stop(): Promise<void> {
    this.generation++;
    const clients = [this.client, this.starting];
    this.client = undefined;
    this.starting = undefined;
    this.transport = undefined;
    this.connecting = undefined;
    this.state = 'closed';
    await Promise.allSettled(clients.map((client) => client?.close()));
  }

  private describe(message: string, transport: StdioTransport): string {
    const tail = transport.stderr.trim().slice(-STDERR_TAIL_CHARS);
    return tail && !message.includes(tail) ? `${message}\n${tail}` : message;
  }
}
