/**
 * The addon ABI this package's JS expects (`NativeRuntime.abiVersion` must
 * match). Defined once in `runtime.cjs`; mirrors NATIVE_ABI_VERSION in
 * crates/runtime/src/lib.rs.
 */
export declare const NATIVE_ABI_VERSION: number;

/** Host options; the runtime rejects unknown keys. */
export interface NativeRuntimeOptions {
  /** Runtime surface, e.g. `mcp` (config `RuntimeSurface`). */
  surface?: string;
  cwd?: string;
  /** Explicit host environment; standalone surfaces fall back to process env. */
  env?: Record<string, string>;
  /** Per-request execution timeout in seconds. */
  timeoutSecs?: number;
}

/** Why a catalog tool is unavailable (absent when it is available). */
export type NativeUnavailableReason =
  | 'disabled'
  | 'toolsList'
  | 'cliOnly'
  | 'missingConfiguration';

/** A tool in the runtime catalog: name, one-line description and availability. */
export interface NativeCatalogTool {
  name: string;
  shortDescription: string;
  available: boolean;
  unavailableReason?: NativeUnavailableReason;
}

/** The runtime catalog: runtime truth, no agent-facing presentation. */
export interface NativeCatalog {
  /** Enforcement contract fingerprint. */
  fingerprint: string;
  tools: NativeCatalogTool[];
  /** Language labels whose LSP server resolves on this machine. */
  lspServers?: string[];
  /** Resolved switches for host schema presentation. */
  presentation?: {
    deferred?: string[];
    /** Selection is configured for at least one visible clasifyContext-capable read tool. */
    selection?: boolean;
  };
}

/**
 * Per-request options; the runtime rejects unknown keys.
 * A supplied `githubToken` is the request's only GitHub credential (no env,
 * stored, or `gh` fallback) and is never echoed. Without it the request
 * resolves credentials as before. Hosts serving many users always pass it.
 */
export interface NativeRequestOptions {
  githubToken?: string;
}

export declare class NativeRuntime {
  constructor(options?: NativeRuntimeOptions | null);
  readonly abiVersion: number;
  readonly closed: boolean;
  catalog(): NativeCatalog;
  /**
   * One MCP call: resolves with the `CallToolResult`, a rejected call
   * included (a typed tool error). Rejects only for a cancelled request or a
   * closing runtime.
   */
  executeMcp(
    requestId: string,
    tool: string,
    input: unknown,
    options?: NativeRequestOptions | null
  ): Promise<unknown>;
  cancel(requestId: string): boolean;
  close(): Promise<void>;
}

declare const runtimeBinding: {
  NativeRuntime: typeof NativeRuntime;
  NATIVE_ABI_VERSION: number;
};

export default runtimeBinding;
