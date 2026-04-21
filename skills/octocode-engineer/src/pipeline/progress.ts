import { EventEmitter } from 'node:events';

export type ProgressPhase =
  | 'startup'
  | 'cache-check'
  | 'discovery'
  | 'parse'
  | 'dependencies'
  | 'semantic'
  | 'detect'
  | 'graph'
  | 'report'
  | 'write'
  | 'done';

export interface ProgressEvent {
  phase: ProgressPhase;
  message: string;
  progress?: number;
  detail?: string;
}

class ScanBus extends EventEmitter {
  progress(phase: ProgressPhase, message: string, detail?: string): void {
    this.emit('progress', { phase, message, detail } satisfies ProgressEvent);
  }

  summary(message: string): void {
    this.emit('summary', message);
  }

  error(message: string, detail?: string): void {
    this.emit('error', { message, detail });
  }

  reset(): void {
    this.removeAllListeners();
  }
}

export const bus = new ScanBus();

let consoleFeedbackAttached = false;

export function attachConsoleFeedback(): void {
  if (consoleFeedbackAttached) return;
  consoleFeedbackAttached = true;
  bus.on('progress', (event: ProgressEvent) => {
    if (event.detail) {
      process.stderr.write(`[${event.phase}] ${event.message}: ${event.detail}\n`);
    } else {
      process.stderr.write(`[${event.phase}] ${event.message}\n`);
    }
  });
}
