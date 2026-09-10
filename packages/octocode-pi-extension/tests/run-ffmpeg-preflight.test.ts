import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../src/types.js';
const runtime = vi.hoisted(() => ({ runBinary: vi.fn() }));
vi.mock('../src/tools/ffmpeg-runtime.js', () => ({
  detectFfmpeg: () => ({ ok: true, ffmpeg: '/fixture/ffmpeg', ffprobe: '/fixture/ffprobe' }),
  runBinary: runtime.runBinary,
}));
import { registerRunFfmpegTool } from '../src/tools/run-ffmpeg-tool.js';
afterEach(() => vi.clearAllMocks());
function tool(): ToolDefinition {
  let registered: ToolDefinition | undefined;
  registerRunFfmpegTool({ registerTool: value => { registered = value; } }, new Set(), (pi, _names, value) => pi.registerTool?.(value));
  return registered!;
}
it('passes only supported default flags to ffprobe and captures its output', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ffprobe-contract-'));
  vi.stubEnv('OCTOCODE_HOME', cwd);
  runtime.runBinary.mockResolvedValue({ code: 0, stdout: Buffer.from('version fixture'), stderr: '', aborted: false });
  try {
    const result = await tool().execute('ffprobe-contract', { queries: [{ reasoning: 'inspect version', binary: 'ffprobe', args: ['-version'] }] }, undefined, undefined, { cwd });
    expect(result.isError).not.toBe(true);
    expect(runtime.runBinary).toHaveBeenCalledWith('/fixture/ffprobe', ['-hide_banner', '-version'], expect.objectContaining({ maxStdoutBytes: 32 * 1024 * 1024 }));
  } finally { vi.unstubAllEnvs(); fs.rmSync(cwd, { recursive: true, force: true }); }
});
it('validates every argv before any process starts', async () => {
  await expect(tool().execute('ffmpeg-invalid', { queries: [
    { reasoning: 'first command', args: ['-version'] },
    { reasoning: 'invalid argument', args: [42] },
  ] })).rejects.toThrow(/queries\[1\].*preflight/);
  expect(runtime.runBinary).not.toHaveBeenCalled();
});
