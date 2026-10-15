import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Checkpoints } from '../src/files/checkpoint.js';
import { registerCheckpoints } from '../src/files/checkpoint-command.js';
import { Subcommands } from '../src/shared/commands.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { sha256 } from '../src/shared/atomic.js';
import { tmp } from './helpers.js';

describe('/octocode rewind arguments', () => {
  it('rejects malformed counts before changing files or consuming checkpoints, including headless runs', async () => {
    const cwd = tmp();
    const file = path.join(cwd, 'a.txt');
    fs.writeFileSync(file, 'one');
    const checkpoints = new Checkpoints();
    checkpoints.open(tmp());
    checkpoints.beginTurn();
    const capture = await checkpoints.capture(file);
    fs.writeFileSync(file, 'two');
    await checkpoints.settle(file, capture, true);
    const fake = fakePi();
    const commands = new Subcommands();
    const forget = vi.fn();
    registerCheckpoints(fake.pi, checkpoints, forget, commands);
    const ctx = fakeCtx({ cwd, hasUI: false });
    const rewind = vi.spyOn(checkpoints, 'rewind');
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      for (const args of ['-1', '0', 'NaN', '2oops', '1.5', '1 2', 'Infinity', '9007199254740992']) {
        await commands.get('rewind')!.handler(args, ctx);
        expect(ctx.ui.notes.at(-1)?.message).toBe('Usage: /octocode rewind [turns] (positive integer)');
      }
      expect(rewind).not.toHaveBeenCalled();
      expect(fs.readFileSync(file, 'utf8')).toBe('two');
      expect(forget).not.toHaveBeenCalled();
      expect(fake.sent).toEqual([]);
      // The valid command still restores the untouched checkpoint and reports its result headlessly.
      await commands.get('rewind')!.handler(' 1 ', ctx);
      expect(rewind).toHaveBeenCalledExactlyOnceWith([1]);
      expect(fs.readFileSync(file, 'utf8')).toBe('one');
      expect(stderr).toHaveBeenLastCalledWith(expect.stringMatching(/Rewound 1 turn: restored 1 file/));
      await commands.get('rewind')!.handler('', ctx);
      expect(stderr).toHaveBeenLastCalledWith('No file changes to rewind on this branch.\n');
    } finally {
      rewind.mockRestore();
      stderr.mockRestore();
    }
  });
});

describe('/octocode rewind when an older change cannot be undone', () => {
  it('names the partly restored file as a warning, forgets it, and tells the model its content moved', async () => {
    const cwd = tmp();
    const file = path.join(cwd, 'a.txt');
    fs.writeFileSync(file, 'v0');
    const store = path.join(tmp(), 'cp');
    const checkpoints = new Checkpoints();
    checkpoints.open(store);
    for (const version of ['v1', 'v2']) {
      checkpoints.beginTurn();
      const capture = await checkpoints.capture(file);
      fs.writeFileSync(file, version);
      await checkpoints.settle(file, capture, true);
    }
    // The older change (v0 → v1) cannot be restored: its saved copy is corrupt. The newer one (v1 → v2) can.
    fs.writeFileSync(path.join(store, 'blobs', sha256('v0')), 'evil');
    const fake = fakePi();
    const commands = new Subcommands();
    const forget = vi.fn();
    registerCheckpoints(fake.pi, checkpoints, forget, commands);
    const ctx = fakeCtx({ cwd });
    await commands.get('rewind')!.handler('2', ctx);

    expect(fs.readFileSync(file, 'utf8')).toBe('v1');
    expect(forget).toHaveBeenCalledExactlyOnceWith(file);
    const note = ctx.ui.notes.at(-1)!;
    expect(note.type).toBe('warning');
    expect(note.message).toMatch(/Rewound 2 turns: restored 0 files\.\nPartly restored, an older change could not be undone \(its checkpoint is kept, rewind again to retry\): a\.txt\./);
    expect(note.message).not.toMatch(/Left alone/);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]!.message.customType).toBe('octocode-rewind');
    expect(fake.sent[0]!.message.content).toContain('Partly restored');
    expect(fake.sent[0]!.message.content).toContain('read them again before editing');
    // The failed entry stays so a later rewind can retry once the copy is repaired.
    expect(checkpoints.turns()).toEqual([1]);
  });
});
