import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Checkpoints } from '../src/files/checkpoint.js';
import { registerCheckpoints } from '../src/files/checkpoint-command.js';
import { Subcommands } from '../src/shared/commands.js';
import { fakeCtx, fakePi } from './fake-pi.js';
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
