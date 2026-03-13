declare module '@anthropic-ai/claude-agent-sdk' {
  export function query(input: {
    prompt: string;
    options: {
      model?: string;
      maxTurns?: number;
      mcpServers: Record<string, { command: string; args: string[] }>;
      permissionMode: 'bypassPermissions';
      allowDangerouslySkipPermissions: boolean;
    };
  }): AsyncIterable<unknown> & {
    mcpServerStatus?: () => Promise<unknown>;
  };
}
