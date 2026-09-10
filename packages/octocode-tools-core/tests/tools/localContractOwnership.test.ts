import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DIRECT_TOOL_SPECIFICATIONS,
  localCompleteMetadata,
} from '@octocodeai/octocode-core/schema';
import { SYSTEM_PROMPT } from '@octocodeai/octocode-core/mcp';
import { ALL_TOOLS } from '../../src/tools/toolConfig.js';

const SOURCE_ROOT = path.resolve(import.meta.dirname, '../../src');
const CONTRACT_ROOT = path.join(SOURCE_ROOT, 'toolContract');

describe('tool-contract ownership', () => {
  it('does not keep a duplicate resources tree in tools-core', async () => {
    await expect(
      access(path.join(CONTRACT_ROOT, 'resources'))
    ).rejects.toThrow();
  });

  it('keeps execution policy local and imports executable schemas from core', async () => {
    const runtime = await readFile(
      path.join(SOURCE_ROOT, 'tools/local_ripgrep/queryWorkflow.ts'),
      'utf8'
    );

    expect(runtime).toContain("from '@octocodeai/octocode-core/schema'");
    for (const definition of DIRECT_TOOL_SPECIFICATIONS) {
      const runtimeTool = ALL_TOOLS.find(
        tool => tool.name === definition.name
      )!;
      expect(runtimeTool.direct.schema).toBe(definition.schema);
      expect(runtimeTool.direct.inputSchema).toBe(definition.inputSchema);
    }
  });

  it('uses core instructions and metadata without a local copy', async () => {
    expect(localCompleteMetadata.systemPrompt).toBe(SYSTEM_PROMPT);
    await expect(
      access(path.join(CONTRACT_ROOT, 'metadata.ts'))
    ).rejects.toThrow();
  });
});
