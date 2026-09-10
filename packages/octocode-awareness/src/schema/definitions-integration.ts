import { z } from 'zod';
import { MEMORY_RECALL_MODES_V1 } from '../memory-hardening.js';
import { MEMORY_LABELS } from './common.js';

const text = z.string().trim().min(1);
const scope = { workspace: text.optional() };
const limit = z.number().int().min(1).max(50).optional();
const label = z.enum(MEMORY_LABELS).describe('Canonical memory label; put the descriptive summary in text.');
const artifact = text.max(256);
const file = z.union([text.max(1024), z.array(text.max(1024)).min(1).max(20)]);

/** Integration commands share one contract between native hosts and the CLI. */
export const integrationSchemas = {
  agent_presence: z.object({ ...scope, agent_id: text, status: z.enum(['ACTIVE', 'IDLE']).optional() }),
  verified_memory: z.object({ ...scope, label, text: text.max(4000), source_digest: text.max(512).describe('Caller-supplied digest of checked sources; not a test receipt.'), scope: z.enum(['project', 'artifact']).optional(), artifact: artifact.optional(), file: file.optional().describe('Selected workspace-local paths; plain paths or file:<path>. No automatic file capture.'), area: text.max(256).optional(), why: text.max(1000).optional(), constraint: text.max(1000).optional(), history_ref: text.max(512).optional().describe('Existing operation ID or history:<operation-id> in this workspace. Stores a pointer; fetch bytes with history read only when needed.'), supersedes: z.array(text.max(128)).max(200).optional().describe('ACTIVE memory store-verified IDs in the same workspace/artifact scope. Shared owner is awareness; agent-owned memory record IDs cannot be replaced here. Omit for independent evidence.'), verified_at: text.max(64).optional(), valid_until: text.max(64).optional(), importance: z.number().int().min(1).max(10).optional(), tags: text.optional() }),
  verified_recall: z.object({ ...scope, strict_scope: z.boolean().optional().describe('Restrict recall to this physical workspace; by default include existing linked Git worktrees, excluding unrelated clones.'), memory_id: text.optional().describe('Exact record ID; cannot be combined with query. Source, scope and expiry filters still apply.'), query: text.max(1000).optional().describe('Lexical mode matches a contiguous phrase. Use memory_id for an evidence pointer.'), label: label.optional(), source_digest: text.max(512).optional(), scope: z.enum(['project', 'artifact']).optional(), artifact: artifact.optional(), file: file.optional(), area: text.max(256).optional(), mode: z.enum(MEMORY_RECALL_MODES_V1).optional(), limit, offset: z.number().int().min(0).max(1000000000).optional(), revision: text.max(128).optional(), now: text.max(64).optional(), min_similarity: z.number().min(0).max(1).optional() }),
  memory_evaluate: z.object({ ...scope, corpus_json: text.optional(), now: text.optional(), limit, min_similarity: z.number().optional() }),
  memory_reindex: z.object({ ...scope, force: z.boolean().optional(), limit }),
  memory_prune: z.object({ ...scope, older_than: text, label: label.optional(), confirm: z.boolean().optional() }),
  handoff_add: z.object({ ...scope, agent_id: text, summary: text, file: z.array(text).optional() }),
  handoff_list: z.object({ ...scope, include_cleared: z.boolean().optional() }),
  handoff_clear: z.object({ ...scope, handoff_id: text }),
  guide: z.object({ json: z.boolean().optional() }),
  instructions_export: z.object({ format: z.enum(['prompt', 'agents-md', 'json']).optional() }),
  pre_edit: z.object({ ...scope, host: text.optional(), agent_id: text.optional(), event_json: z.union([text, z.record(z.string(), z.unknown())]).optional().describe('Native event object or serialized JSON. CLI can also read the event from stdin.') }),
  database_consolidate: z.object({ source: text, destination: text, unattributed_agent_id: text.optional(), dry_run: z.boolean().optional() }),
};
