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
/** Sender id for messages typed by the user with `/agents tell`. */
export const USER_SENDER = 'user';
/** Sender id for messages from a local API client (`agents.tell`): not the user, and nobody to reply to. */
export const EXTERNAL_SENDER = 'external';
