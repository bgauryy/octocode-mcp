export interface MessageEnvelope {
  channel: 'internal' | 'external';
  direction: 'outbound' | 'inbound';
  from: string;
  to: string;
  text: string;
  id?: string;
  replyTo?: string;
}
export const INTERNAL_MESSAGE_TYPE = 'octocode-agent-message';
export const EXTERNAL_MESSAGE_TYPE = 'octocode-external-message';
