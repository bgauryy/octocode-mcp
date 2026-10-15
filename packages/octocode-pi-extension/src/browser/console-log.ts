import path from 'node:path';
import { formatSize } from '@earendil-works/pi-coding-agent';
import { sessionOutputDir } from '../shared/home.js';
import { RotatingLog } from '../shared/rotating-log.js';
import { shortPath } from '../shared/format.js';
import { visibleControls } from '../shared/sanitize.js';
import { errorMessage } from '../shared/util.js';

/**
 * The browser session's console log: every console line (whole, not cut to the window's line length; controls shown as visible escapes) is appended to
 * `<session folder>/output/browser-console-<time>.log`, so what the in-memory window drops (the oldest lines, the lines of
 * a tab the session left) stays readable. The file rotates at `CONSOLE_LOG_BYTES` like a bash job log: the part before the
 * newest one moves to `<file>.1`, and a second rotation drops the oldest part, which `describe` says.
 */
const CONSOLE_LOG_BYTES = 4 * 1024 * 1024;
/** A line longer than this is cut in the file too (marked), so one line always fits the log whole. */
const LINE_CHARS = 1_000_000;

export class ConsoleLog {
  private readonly log: RotatingLog | undefined;
  private readonly openFailure: string | undefined;

  constructor(private readonly max = CONSOLE_LOG_BYTES, dir?: string) {
    try {
      this.log = new RotatingLog(path.join(dir ?? sessionOutputDir('output'), `browser-console-${Date.now()}-${process.pid}.log`), max, 'console output');
    } catch (error) {
      this.openFailure = errorMessage(error);
    }
  }

  get file(): string | undefined {
    return this.log?.file;
  }

  /** Appends one line, as one line of the file. Never throws. */
  append(line: string): void {
    const text = line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS)}… [${line.length - LINE_CHARS} more characters cut]` : line;
    this.log?.write(`${visibleControls(text)}\n`);
  }

  close(): void {
    this.log?.close();
  }

  /** Where the lines are and what the file holds, or why it holds less than every line. */
  describe(): string {
    const { log } = this;
    if (!log) return `the console log could not be created (${this.openFailure ?? 'unknown error'}), so dropped lines cannot be recovered`;
    const where = shortPath(log.file);
    const rotated = log.rotations > 0 ? `; the log is capped at ${formatSize(this.max)} and rotated${log.rotations > 1 ? ` ${log.rotations} times: ${where}.1 holds the part before this file, and lines before that were dropped and cannot be recovered` : `: ${where}.1 holds the part before this file`}` : '';
    const stopped = log.failure ? `; writing stopped after ${log.failure.bytes} bytes (${log.failure.error}), so later lines are not in it` : '';
    return `every console line is in ${where}${rotated}${stopped}`;
  }
}
