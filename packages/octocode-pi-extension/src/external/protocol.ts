import { Type, type Static } from 'typebox';
import { Check } from 'typebox/value';

export const ExternalParamsSchema = Type.Object({
  action: Type.Union([Type.Literal('list'), Type.Literal('connect'), Type.Literal('prompt'), Type.Literal('cancel'), Type.Literal('disconnect')]),
  id: Type.Optional(Type.String()),
  transport: Type.Optional(Type.Union([Type.Literal('acp'), Type.Literal('pi')])),
  vendor: Type.Optional(Type.String()),
  command: Type.Optional(Type.String()),
  args: Type.Optional(Type.Array(Type.String())),
  instanceId: Type.Optional(Type.String()),
  cwd: Type.Optional(Type.String()),
  sessionId: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Integer()),
}, { additionalProperties: false });

export type ExternalParams = Static<typeof ExternalParamsSchema>;

export function parseExternalParams(value: unknown): ExternalParams {
  if (!Check(ExternalParamsSchema, value)) throw new Error('Invalid externalAgent input; use the published externalAgent schema.');
  const input = value as ExternalParams;
  for (const [name, field] of Object.entries(input)) {
    if (typeof field === 'string' && !field.trim()) throw new Error(`${name} must be non-empty.`);
  }
  if (input.vendor && input.vendor.length > 64) throw new Error('vendor must have at most 64 characters.');
  if (input.timeoutMs !== undefined && (input.timeoutMs < 1000 || input.timeoutMs > 600000)) throw new Error('timeoutMs must be from 1000 to 600000.');
  const fields = input.action === 'list' ? ['action']
    : input.action === 'connect' ? input.transport === 'pi' ? ['action', 'id', 'transport', 'instanceId', 'cwd'] : ['action', 'id', 'transport', 'vendor', 'command', 'args', 'cwd', 'sessionId', 'timeoutMs']
      : input.action === 'prompt' ? ['action', 'id', 'text', 'timeoutMs'] : ['action', 'id'];
  const unused = Object.keys(input).filter((key) => !fields.includes(key));
  if (unused.length) throw new Error(`${input.action} does not accept: ${unused.join(', ')}.`);
  if (input.action === 'connect') {
    if (!input.transport) throw new Error('connect requires transport.');
    if (input.transport === 'acp' && (!input.command || !input.vendor)) throw new Error('ACP connect requires command and the real host vendor.');
    if (input.transport === 'pi' && !input.instanceId) throw new Error('Pi connect requires an exact discovered instanceId.');
  } else if (input.action !== 'list' && !input.id) throw new Error(`${input.action} requires id.`);
  if (input.action === 'prompt' && !input.text) throw new Error('prompt requires text.');
  return input;
}

export interface ExternalInfo {
  id: string;
  transport: 'acp' | 'pi';
  vendor: string;
  cwd: string;
  sessionId: string;
  busy: boolean;
}

export interface ExternalReply {
  text: string;
  stopReason?: string;
  updates?: unknown[];
}

export interface ExternalBackend {
  readonly sessionId: string;
  readonly cwd: string;
  prompt(text: string, options: { timeoutMs: number; signal?: AbortSignal; key?: string }): Promise<ExternalReply>;
  cancel(): Promise<void>;
  close(): Promise<void>;
}
