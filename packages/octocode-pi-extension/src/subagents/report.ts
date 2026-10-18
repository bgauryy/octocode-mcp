import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { formatSize, truncateHead } from '@earendil-works/pi-coding-agent';
import { shortPath } from '../shared/format.js';
import { visibleControls } from '../shared/sanitize.js';
import { capOutput, cutText } from '../shared/util.js';

export const REPORT_MAX_BYTES = 8 * 1024;
const REPORT_MAX_LINES = 200;
const SEPARATOR = '\n\n---\n\n';
const preview = (text: string) => capOutput(text, REPORT_MAX_BYTES, REPORT_MAX_LINES);

/** The outcome a subagent leads its final report with; the prompt tells it so, and the parent reads it back. */
export const REPORT_STATUSES = ['done', 'partial', 'blocked', 'failed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * The outcome word a report starts with, or undefined when it does not start with one (an unknown outcome, never a
 * failure). Case and light markup around the word (`**Blocked**:`, `done.`) do not matter.
 */
export function reportStatus(text: string | undefined): ReportStatus | undefined {
  const first = (text ?? '').trimStart().split(/\s/, 1)[0] ?? '';
  const word = first.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase();
  return REPORT_STATUSES.find((status) => status === word);
}

interface ReportHead {
  head: string;
  bytes: number;
  lines: number;
  firstLineBytes: number;
}

const emptyHead = (): ReportHead => ({ head: '', bytes: 0, lines: 1, firstLineBytes: 0 });

/** Keep enough raw text to cut a preview; totals describe the complete report on disk. */
function appendHead(before: ReportHead, section: string): ReportHead {
  const newline = section.indexOf('\n');
  return {
    // Four extra bytes retain an overflow code point, so a multibyte boundary cannot hide a cut.
    head: cutText(before.head + section, REPORT_MAX_BYTES + 4).split('\n').slice(0, REPORT_MAX_LINES + 1).join('\n'),
    bytes: before.bytes + Buffer.byteLength(section),
    lines: before.lines + (section.match(/\n/g)?.length ?? 0),
    firstLineBytes: before.firstLineBytes + (before.lines === 1 ? Buffer.byteLength(newline < 0 ? section : section.slice(0, newline)) : 0),
  };
}

function headPreview(report: ReportHead): string {
  const cut = truncateHead(report.head, { maxBytes: REPORT_MAX_BYTES, maxLines: REPORT_MAX_LINES });
  if (report.bytes <= REPORT_MAX_BYTES && report.lines <= REPORT_MAX_LINES) return report.head;
  if (cut.content === '') {
    const head = cutText(report.head, REPORT_MAX_BYTES);
    return `${head}\n\n[Output trimmed: the first line alone is ${formatSize(report.firstLineBytes)}; kept its first ${formatSize(Buffer.byteLength(head))} (${formatSize(report.bytes)} in all).]`;
  }
  return `${cut.content}\n\n[Output trimmed: ${cut.outputLines} of ${report.lines} lines (${formatSize(cut.outputBytes)} of ${formatSize(report.bytes)}).]`;
}

/**
 * A bounded preview and an incremental disk report. Retries replace the current section; incoming messages start a new
 * one. The preview is always cut from the whole uncut report, so follow-ups never stack truncation notices.
 */
export class ReportTracker {
  /** Bounded raw heads and exact totals; retries restore the state before the current section. */
  private full = emptyHead();
  private before = emptyHead();
  private text = '';
  private lastText = '';
  private signature = '';
  private sections = 0;
  private sectionStart = 0;
  private fresh = true;
  private failure: string | undefined;
  private file: string | undefined;
  private partialFile: string | undefined;
  private spillFailed = false;

  constructor(private readonly scratch?: string) {}

  incoming(role: unknown): void {
    if (role === 'user' || role === 'custom') this.fresh = true;
  }

  answer(raw: string | undefined, stopReason: unknown, errorMessage?: unknown): void {
    const failed = stopReason === 'error' || stopReason === 'aborted' || stopReason === 'length';
    this.failure = failed ? visibleControls(String(errorMessage ?? (stopReason === 'length' ? 'Model output limit reached; the report is incomplete' : stopReason))) : undefined;
    if (!raw) return;
    const text = visibleControls(raw);
    this.lastText = preview(text);
    if (stopReason === 'toolUse' || failed) {
      this.partialFile = undefined;
      if (this.sections === 0 && this.lastText !== text && this.scratch) {
        try {
          const file = path.join(this.scratch, 'partial-report.md');
          fs.writeFileSync(file, text);
          this.partialFile = file;
        } catch { /* Keep the bounded partial answer when disk is unavailable. */ }
      }
      return;
    }
    const signature = createHash('sha512').update(text).digest('hex');
    const append = this.fresh || this.sections === 0;
    if (append && signature === this.signature) {
      this.fresh = false;
      return;
    }
    if (append) {
      this.before = this.full;
      this.sectionStart = this.full.bytes;
      this.sections++;
    }
    const section = `${this.sections > 1 ? SEPARATOR : ''}${text}`;
    const whole = appendHead(this.before, section);
    const capped = headPreview(whole);
    try {
      if (this.file) {
        if (!append) fs.truncateSync(this.file, this.sectionStart);
        fs.appendFileSync(this.file, section);
      } else if (!this.spillFailed && (whole.bytes > REPORT_MAX_BYTES || whole.lines > REPORT_MAX_LINES) && this.scratch) {
        const file = path.join(this.scratch, 'report.md');
        fs.writeFileSync(file, this.before.head + section);
        this.file = file;
      }
    } catch {
      // A disk failure must not discard the bounded answer or advertise an incomplete report.
      this.file = undefined;
      this.spillFailed = true;
    }
    this.full = whole;
    this.text = capped;
    this.signature = signature;
    this.fresh = false;
  }

  /**
   * The report as returned to the caller: `text` is `body` plus, when the whole text is saved in a file, the `pointer`
   * line naming it. A caller that shortens `body` keeps the pointer.
   */
  result(): { text: string; body: string; pointer?: string; error?: string; answered: boolean } {
    if (this.sections === 0) {
      const pointer = this.partialFile ? `Full partial report: ${shortPath(this.partialFile)} (read only the parts you need).` : undefined;
      return {
        text: `${this.lastText}${pointer ? `\n${pointer}` : ''}`,
        body: this.lastText,
        ...(pointer ? { pointer } : {}),
        answered: false,
        ...(this.failure ? { error: this.failure } : {}),
      };
    }
    const body = this.failure ? `${this.text}${SEPARATOR}(A later follow-up turn failed: ${this.failure})` : this.text;
    const pointer = this.file ? `Full report: ${shortPath(this.file)} (read only the parts you need).` : undefined;
    return { text: `${body}${pointer ? `\n${pointer}` : ''}`, body, ...(pointer ? { pointer } : {}), answered: true };
  }
}
