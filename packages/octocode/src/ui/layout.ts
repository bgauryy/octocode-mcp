import { dim } from '../utils/colors.js';

/** Quiet section divider sized to the current terminal pane. */
export function sectionDivider(): string {
  return dim(
    '─'.repeat(Math.max(0, Math.min(64, process.stdout.columns ?? 80)))
  );
}
