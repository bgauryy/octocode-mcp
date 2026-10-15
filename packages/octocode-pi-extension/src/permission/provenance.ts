import type { ToolAnnotations, ToolCallEvent, ToolResultEvent } from '@earendil-works/pi-coding-agent';
import { canonicalPath, isWithin, readPaths, resolveToolPath, tildePath, workspaceRoot } from '../shared/home.js';
import { secretProblem } from '../shared/sanitize.js';
import { contentText, isRecord } from '../shared/util.js';
import { readOnlyMcp, runsLater } from './gate.js';
import { commandNames, SHELL_TOOLS } from './shell.js';

/**
 * Files that run when invoked: scripts by extension, anything under a `bin/` or `scripts/` folder, files make, just and
 * direnv run, and CI workflows. Untrusted text written there is an action waiting to happen, so it stays a sink; any
 * other workspace file just stores it.
 */
const EXECUTABLE = /\.(?:sh|bash|zsh|fish|ksh|ps1|psm1|bat|cmd|command)$|(?:^|\/)(?:bin|scripts)\/|(?:^|\/)(?:makefile|gnumakefile|justfile|\.envrc)$|(?:^|\/)\.github\/workflows\//i;
/** What a hit on a shell command adds: saving quoted material as data is fine, running it is the risk. */
const SHELL_HINT = '; to save quoted material, write it as data with the `file` tool, not a shell command';

/**
 * A CaMeL-inspired provenance tripwire (plan §3): tool outputs are tagged by where they came from, and a later call
 * whose arguments repeat them is flagged. `untrusted` output (web, browser, open-world MCP, network commands) reaching a
 * consequential argument (a shell command, file content, a mutating MCP call, a memory) and `private` output (reads
 * outside the workspace, secret-looking lines) reaching an egress argument (a URL, a network command) are hits.
 *
 * It is substring matching, so paraphrase, encoding or splitting across calls defeat it by design: a tripwire, not
 * a sandbox. The index holds 53-bit hashes only, never the text, lives in memory per session and is never written.
 */

/** Characters per shingle; a hit needs `RUN` consecutive ones (33 characters at the default). */
const SHINGLE = 32;
const RUN = 2;
const MAX_SHINGLES = 200_000;
const MAX_BYTES_PER_RESULT = 256 * 1024;
/** Sources (labels and times) kept; a shingle whose source was pruned no longer hits. */
const MAX_SOURCES = 4096;
const B1 = 0x01000193;
const B2 = 0x5bd1e995;
const POW1 = power(B1, SHINGLE);
const POW2 = power(B2, SHINGLE);

const NETWORK = new Set(['curl', 'wget', 'nc', 'ncat', 'netcat', 'socat', 'telnet', 'ftp', 'sftp', 'scp', 'ssh', 'rsync', 'http', 'https', 'xh', 'aria2c', 'lynx', 'w3m', 'invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm']);
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>`)\]}]+/gi;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
/** Secret-like tokens on a flagged line: 16+ word characters, or 12+ holding a letter and a digit (a key id, a token body). */
const TOKEN_PATTERN = /[A-Za-z0-9_-]{12,}/g;
/** Argument keys that are not an action: the model's own explanation of a call. */
const NOT_ACTION = new Set(['reasoning', 'oldText']);

type Kind = 'untrusted' | 'private';
interface Source {
  kind: Kind;
  /** The tool and where its output came from: `web https://…`, `read ~/…`, `bash curl https://…`. */
  label: string;
  secret: boolean;
  at: number;
}

interface ProvenanceOptions {
  /** The repository root reads are trusted under (default: the git toplevel of `cwd`). */
  workspaceRoot?: (cwd: string) => string | undefined;
  /** A tool's annotations (`pi.getAllTools()`); without them `mcp__*` tools count as open-world and not read-only. */
  annotations?: (toolName: string) => ToolAnnotations | undefined;
  maxShingles?: number;
  maxBytesPerResult?: number;
  now?: () => number;
}

interface ProvenanceHit {
  /** The dialog line: `contains text from web https://example.com/install (2 min ago)`. */
  why: string;
}

function power(base: number, exponent: number): number {
  let out = 1;
  for (let n = 0; n < exponent; n++) out = Math.imul(out, base);
  return out;
}

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** One 53-bit key per `SHINGLE`-character window of `text`, in order (two 32-bit rolling hashes combined). */
function shingles(text: string): number[] {
  const keys: number[] = [];
  let h1 = 0;
  let h2 = 0;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    h1 = (Math.imul(h1, B1) + code) | 0;
    h2 = (Math.imul(h2, B2) + code) | 0;
    if (at >= SHINGLE) {
      const out = text.charCodeAt(at - SHINGLE);
      h1 = (h1 - Math.imul(out, POW1)) | 0;
      h2 = (h2 - Math.imul(out, POW2)) | 0;
    }
    if (at >= SHINGLE - 1) keys.push((h1 >>> 0) * 0x200000 + (h2 >>> 11));
  }
  return keys;
}

/** The key of a whole atom (URL, host, e-mail, secret token); the prefix keeps it apart from any text window. */
const atomKey = (kind: string, value: string): number => shingles(`\u0001${kind}:${value}`.padEnd(SHINGLE, '\u0001')).at(-1)!;

/** Whole URLs, their hosts and e-mail addresses in `text`. */
function atoms(text: string): number[] {
  const keys: number[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;:!?]+$/, '');
    keys.push(atomKey('url', url));
    const host = hostOf(url);
    if (host) keys.push(atomKey('host', host));
  }
  for (const match of text.matchAll(EMAIL_PATTERN)) keys.push(atomKey('email', match[0].toLowerCase()));
  return keys;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

function tokens(text: string): number[] {
  return [...text.matchAll(TOKEN_PATTERN)].map((match) => match[0]).filter((token) => token.length >= 16 || (/\d/.test(token) && /[A-Za-z]/.test(token))).map((token) => atomKey('token', token));
}

function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;
}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/** The string leaves of a tool's arguments, minus keys that explain rather than act. */
function leaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) leaves(item, out);
  else if (isRecord(value)) for (const [key, item] of Object.entries(value)) if (!NOT_ACTION.has(key)) leaves(item, out);
  return out;
}

/** `text` cut to its first `maxBytes` UTF-8 bytes. */
function capBytes(text: string, maxBytes: number): string {
  if (text.length * 3 <= maxBytes) return text;
  const bytes = Buffer.from(text, 'utf8');
  return bytes.length <= maxBytes ? text : bytes.subarray(0, maxBytes).toString('utf8');
}

const isNetworkCommand = (command: string): boolean => commandNames(command).some((name) => NETWORK.has(name.toLowerCase()));

class Provenance {
  /** Hash → its slot in the ring below. */
  private readonly index = new Map<number, number>();
  /** Oldest-first eviction: `keys[slot]` is the hash written there, `ids[slot]` its source (0: an atom first seen in trusted output). */
  private keys: Float64Array | undefined;
  private ids: Int32Array | undefined;
  private head = 0;
  private readonly sources = new Map<number, Source>();
  private nextSource = 1;
  private readonly workspaceRoot: (cwd: string) => string | undefined;
  private readonly annotations: (toolName: string) => ToolAnnotations | undefined;
  private readonly maxShingles: number;
  private readonly maxBytes: number;
  private readonly now: () => number;

  constructor(options: ProvenanceOptions = {}) {
    this.workspaceRoot = options.workspaceRoot ?? workspaceRoot;
    this.annotations = options.annotations ?? (() => undefined);
    this.maxShingles = options.maxShingles ?? MAX_SHINGLES;
    this.maxBytes = options.maxBytesPerResult ?? MAX_BYTES_PER_RESULT;
    this.now = options.now ?? Date.now;
  }

  /** Indexes a tool result by its source (a `tool_result` handler; nested codemode results included). */
  record(event: ToolResultEvent, ctx: { cwd: string }): void {
    const text = capBytes(contentText(event.content), this.maxBytes);
    if (!text) return;
    const origin = this.origin(event, ctx.cwd);
    if (origin?.kind === 'untrusted') {
      // The source's own address was chosen before its content was read.
      for (const key of atoms(origin.label)) this.remember(key, 0, false);
      const id = this.addSource(origin.kind, origin.label, false);
      for (const key of atoms(text)) this.remember(key, id, false);
      for (const key of shingles(normalize(text))) this.remember(key, id, true);
    } else {
      for (const key of atoms(text)) this.remember(key, 0, false);
      if (origin) {
        const id = this.addSource(origin.kind, origin.label, false);
        for (const key of shingles(normalize(text))) this.remember(key, id, true);
      }
    }
    if (!secretProblem(text)) return;
    const secretId = this.addSource('private', event.toolName, true);
    for (const line of text.split('\n')) {
      if (!secretProblem(line)) continue;
      for (const key of tokens(line)) this.remember(key, secretId, true);
      for (const key of shingles(normalize(line))) this.remember(key, secretId, true);
    }
  }

  /** Why `event` should be asked about (untrusted text in a consequential argument, private text in egress), if at all. */
  check(event: ToolCallEvent, ctx: { cwd: string }): ProvenanceHit | undefined {
    if (this.index.size === 0) return undefined;
    const input = event.input as Record<string, unknown>;
    for (const value of this.consequential(event.toolName, input, ctx.cwd)) {
      const hit = this.untrustedIn(value);
      if (hit) return SHELL_TOOLS.has(event.toolName) ? { ...hit, why: `${hit.why}${SHELL_HINT}` } : hit;
    }
    for (const value of this.egress(event.toolName, input)) {
      const hit = this.privateIn(value);
      if (hit) return hit;
    }
    return undefined;
  }

  clear(): void {
    this.index.clear();
    this.sources.clear();
    this.keys = undefined;
    this.ids = undefined;
    this.head = 0;
  }

  /** Hashes held (shingles and atoms). */
  size(): number {
    return this.index.size;
  }

  private origin(event: ToolResultEvent, cwd: string): { kind: Kind; label: string } | undefined {
    const { toolName, input } = event;
    if (toolName === 'web') return { kind: 'untrusted', label: `web ${str(input['url']) ?? `search "${str(input['query']) ?? ''}"`}` };
    if (toolName === 'browser') return { kind: 'untrusted', label: `browser ${str(input['url']) ?? str(input['action']) ?? ''}`.trim() };
    if (toolName === 'externalAgent' && input['action'] === 'prompt') return { kind: 'untrusted', label: `externalAgent ${str(input['id']) ?? ''}`.trim() };
    if (toolName.startsWith('mcp__')) return this.annotations(toolName)?.openWorldHint === false ? undefined : { kind: 'untrusted', label: toolName };
    // Pi's built-in MCP resource reader: a server's text, like any open-world MCP result.
    if (toolName === 'read_mcp_resource') return { kind: 'untrusted', label: `${toolName} ${str(input['uri']) ?? ''}`.trim() };
    if (SHELL_TOOLS.has(toolName)) {
      const command = str(input['command']) ?? '';
      if (!isNetworkCommand(command)) return undefined;
      const name = commandNames(command).find((program) => NETWORK.has(program.toLowerCase()));
      const url = command.match(URL_PATTERN)?.[0];
      return { kind: 'untrusted', label: [toolName, name, url].filter(Boolean).join(' ') };
    }
    const target = toolName === 'read' ? readPaths(toolName, input, cwd)[0] : toolName === 'grep' ? resolveToolPath(cwd, str(input['path']) ?? '.') : undefined;
    if (!target) return undefined;
    const root = this.workspaceRoot(cwd);
    return root !== undefined && isWithin(canonicalPath(target), canonicalPath(root)) ? undefined : { kind: 'private', label: `${toolName} ${tildePath(target)}` };
  }

  /**
   * Arguments that act: shell commands, file paths, the content of files that run or configure later sessions (or lie
   * outside the workspace), mutating MCP calls, memory notes. Content written into an ordinary workspace file is data.
   */
  private consequential(toolName: string, input: Record<string, unknown>, cwd: string): string[] {
    if (SHELL_TOOLS.has(toolName)) return [str(input['command']) ?? ''];
    if (toolName === 'externalAgent') return input['action'] === 'connect' || input['action'] === 'prompt' ? leaves(input) : [];
    if (toolName === 'file' || toolName === 'edit' || toolName === 'write') {
      const changes = toolName === 'file' ? (Array.isArray(input['queries']) ? input['queries'] : []) : [input];
      return changes.flatMap((change) => {
        const target = isRecord(change) ? str(change['path']) : undefined;
        return target && this.storesData(target, cwd) ? [target] : leaves(change);
      });
    }
    if (toolName === 'memory') return input['op'] === 'set' ? leaves(input) : [];
    if (toolName.startsWith('mcp__')) return readOnlyMcp(this.annotations(toolName)) ? [] : leaves(input);
    return [];
  }

  /** `target` is an ordinary workspace file: inside the repository, not run or loaded by later sessions, not executable. */
  private storesData(target: string, cwd: string): boolean {
    const workspace = this.workspaceRoot(cwd);
    if (workspace === undefined) return false;
    const root = canonicalPath(workspace);
    const file = canonicalPath(resolveToolPath(cwd, target));
    return isWithin(file, root) && !runsLater(file, root) && !EXECUTABLE.test(file.slice(root.length));
  }

  /** Arguments that leave the machine: the web URL or search query, a browser navigation, a network command. */
  private egress(toolName: string, input: Record<string, unknown>): string[] {
    const url = str(input['url']);
    if (toolName === 'externalAgent' && input['action'] === 'prompt') return [str(input['text']) ?? ''];
    if (toolName === 'web') return [url, str(input['query'])].filter((value): value is string => value !== undefined);
    if (toolName === 'browser' && url && (input['action'] === 'navigate' || input['action'] === 'tab')) return [url];
    const command = SHELL_TOOLS.has(toolName) ? str(input['command']) : undefined;
    return command && isNetworkCommand(command) ? [command] : [];
  }

  private untrustedIn(value: string): ProvenanceHit | undefined {
    for (const key of atoms(value)) {
      const source = this.sourceOf(key, 'untrusted');
      if (source) return { why: `contains a URL, host or e-mail first seen in ${source.label} (${ago(this.now() - source.at)})` };
    }
    const keys = shingles(normalize(value));
    let run = 0;
    for (const key of keys) {
      const source = this.sourceOf(key, 'untrusted');
      run = source ? run + 1 : 0;
      if (source && run >= RUN) return { why: `contains text from ${source.label} (${ago(this.now() - source.at)})` };
    }
    return undefined;
  }

  private privateIn(value: string): ProvenanceHit | undefined {
    const forms = new Set([value, decoded(value)]);
    for (const form of forms) {
      for (const key of [...tokens(form), ...shingles(normalize(form))]) {
        const source = this.sourceOf(key, 'private');
        if (!source) continue;
        const when = ago(this.now() - source.at);
        return { why: source.secret ? `sends a secret seen in ${source.label} output (${when})` : `sends private text from ${source.label} (${when})` };
      }
    }
    return undefined;
  }

  private sourceOf(key: number, kind: Kind): Source | undefined {
    const slot = this.index.get(key);
    const id = slot === undefined ? 0 : this.ids![slot]!;
    const source = id ? this.sources.get(id) : undefined;
    return source?.kind === kind ? source : undefined;
  }

  private addSource(kind: Kind, label: string, secret: boolean): number {
    const id = this.nextSource++;
    this.sources.set(id, { kind, label, secret, at: this.now() });
    if (this.sources.size > MAX_SOURCES) this.sources.delete(this.sources.keys().next().value!);
    return id;
  }

  /**
   * Maps `key` to source `id` in the next ring slot, evicting the hash that slot held (the oldest). A shingle seen
   * again moves to the newest source and becomes youngest; an atom keeps the source it was first seen in.
   */
  private remember(key: number, id: number, refresh: boolean): void {
    if (!refresh && this.index.has(key)) return;
    const keys = (this.keys ??= new Float64Array(this.maxShingles));
    const ids = (this.ids ??= new Int32Array(this.maxShingles));
    const slot = this.head;
    this.head = (slot + 1) % this.maxShingles;
    // An empty slot holds id 0 and key 0; a stale slot (its hash since moved) no longer owns the hash.
    if (this.index.get(keys[slot]!) === slot) this.index.delete(keys[slot]!);
    keys[slot] = key;
    ids[slot] = id;
    this.index.set(key, slot);
  }
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/** The session's provenance index: `record` from `tool_result`, `check` in the permission gate, `clear` on `session_start`. */
export function createProvenance(options: ProvenanceOptions = {}): Provenance {
  return new Provenance(options);
}
