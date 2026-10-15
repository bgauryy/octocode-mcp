import fs from 'node:fs';
import path from 'node:path';
import { PRIVATE_FILE_MODE } from './home.js';
import { errorMessage } from './util.js';

/**
 * A size-capped log one process writes (so rotation can neither lose nor reorder text): once the log would pass `max`
 * bytes it moves to `<file>.1`, replacing the previous one, and a new log starts with a note naming it. Writes never
 * throw: a log that cannot be written (disk full, quota, a vanished folder) records the first error and its size, then
 * stops recording; callers say so, so a tail that ends early is not taken for the last output. `what` names the content
 * in the rotation note ("output", "lines").
 */
export class RotatingLog {
  private fd: number | undefined;
  private size = 0;
  /** How many times the log moved to `<file>.1`: the first keeps the earlier text there, each later one drops what `.1` held. */
  rotations = 0;
  /** Bytes of the rotation note at the head of the current log: a log holding only the note has nothing to move. */
  private header = 0;
  /** The first write error and the size of the log when it happened; the log writes nothing after it. */
  failure: { bytes: number; error: string } | undefined;

  constructor(
    readonly file: string,
    private readonly max: number,
    private readonly what = 'output',
  ) {
    this.fd = fs.openSync(file, 'a', PRIVATE_FILE_MODE);
  }

  write(data: string | Buffer): void {
    if (this.fd === undefined) return;
    const chunk = typeof data === 'string' ? Buffer.from(data) : data;
    try {
      let rest = chunk;
      while (rest.length > 0) {
        const room = this.max - this.size;
        if (rest.length <= room) {
          this.append(rest);
          break;
        }
        // Fill the log up to its last whole line that fits; a line longer than an empty log is cut at the cap, not inside a character.
        const fits = room > 0 ? rest.subarray(0, room).lastIndexOf(0x0a) + 1 : 0;
        const take = fits > 0 ? fits : this.size > this.header ? 0 : characterStart(rest, Math.max(room, 1));
        if (take > 0) this.append(rest.subarray(0, take));
        rest = rest.subarray(take);
        if (rest.length > 0) this.rotate();
      }
    } catch (error) {
      this.failure ??= { bytes: this.size, error: errorMessage(error) };
      this.close();
    }
  }

  close(): void {
    if (this.fd === undefined) return;
    try {
      fs.closeSync(this.fd);
    } catch {
      // Already closed.
    }
    this.fd = undefined;
  }

  private append(chunk: Buffer): void {
    for (let offset = 0; offset < chunk.length; ) {
      const written = fs.writeSync(this.fd!, chunk, offset);
      offset += written;
      this.size += written;
    }
  }

  private rotate(): void {
    fs.closeSync(this.fd!);
    this.fd = undefined;
    fs.renameSync(this.file, `${this.file}.1`);
    this.fd = fs.openSync(this.file, 'a', PRIVATE_FILE_MODE);
    this.size = 0;
    this.rotations++;
    const older = this.rotations > 1 ? `; older ${this.what} was dropped` : '';
    const note = Buffer.from(`[earlier ${this.what} is in ${path.basename(this.file)}.1${older}]\n`);
    this.append(note);
    this.header = note.length;
  }
}

/**
 * The cut at or before `at` that does not split a UTF-8 character: the start of the character `at` falls inside. When
 * that would leave nothing (the cap is smaller than one character), `at` itself.
 */
function characterStart(data: Buffer, at: number): number {
  let start = at;
  // A character has at most three continuation bytes; more means the bytes are not UTF-8 text, which is cut at the cap.
  while (start > 0 && start < data.length && at - start < 3 && (data[start]! & 0xc0) === 0x80) start--;
  return start > 0 && (data[start]! & 0xc0) !== 0x80 ? start : at;
}
