/** Load the optional history backend only when history is requested. */
export const runAwarenessHistoryOperation: typeof import('./history.js').runAwarenessHistoryOperation = async (...args) => {
  const history = await import('./history.js');
  return history.runAwarenessHistoryOperation(...args);
};

/** Shell convenience adapter; native hosts use executeAwarenessCommand. */
export async function execHistoryCli(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const { executeAwarenessCli } = await import('./command-cli.js');
  const result = await executeAwarenessCli(argv);
  return { code: result.exitCode, stdout: result.text ?? JSON.stringify(result.payload), stderr: result.diagnostics?.join('\n') ?? '' };
}
