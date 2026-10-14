import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { catastrophicCommand } from '../src/permission/shell.js';
import { tmp } from './helpers.js';

describe('bash guard command substitutions', () => {
  it('blocks substitutions in unquoted heredoc bodies even when nothing pipes them to a shell', () => {
    for (const command of [
      'cat <<EOF\n$(rm -rf /)\nEOF',
      'cat <<EOF\nhello `rm -rf ~` world\nEOF',
      'cat > notes.md <<EOF\nline\n$(echo $(mkfs.ext4 /dev/sda))\nEOF',
      'cat <<-EOF\n\t$(shutdown -h now)\n\tEOF',
      'cat <<EOF\n$(cat <<INNER\n$(reboot)\nINNER\n)\nEOF',
      'cat <<A <<B\nfirst\nA\n$(rm -rf /)\nB',
      'cat <<EOF\n$(rm -rf /)',
      // Double quotes inside a heredoc body are literal; the substitution still runs.
      'cat <<EOF\n"$(rm -rf /)"\nEOF',
    ]) {
      expect(catastrophicCommand(command), command).toBeDefined();
    }
  });

  it('blocks substitutions inside double-quoted strings', () => {
    for (const command of ['echo "$(rm -rf ~)"', 'echo "x `rm -rf /` y"', 'git commit -m "$(shutdown -h now)"']) {
      expect(catastrophicCommand(command), command).toBeDefined();
    }
  });

  it('keeps literal text allowed: quoted heredoc delimiters, single quotes, escapes and harmless substitutions', () => {
    for (const command of [
      "cat <<'EOF'\n$(rm -rf /)\nEOF",
      'cat <<"EOF"\n$(rm -rf /)\nEOF',
      "cat <<-'EOF'\n\t`rm -rf ~`\n\tEOF",
      "echo '$(rm -rf /)'",
      "echo '`rm -rf ~`'",
      'cat <<EOF\n\\$(rm -rf /)\nEOF',
      'cat <<EOF\n$(date) and `whoami`\nEOF',
      'cat <<EOF\nrm -rf /\nEOF',
      'echo "$(date)"',
      'echo "\\$(rm -rf /)"',
    ]) {
      expect(catastrophicCommand(command), command).toBeUndefined();
    }
  });
});

describe('destructive commands resolved against the shell folder', () => {
  const home = () => {
    const dir = tmp('octocode-guard-home-');
    vi.stubEnv('HOME', dir);
    return dir;
  };

  it('flags relative targets that reach home or a folder holding it', () => {
    const dir = home();
    const sub = path.join(dir, 'proj');
    for (const [command, cwd] of [
      ['rm -rf ..', sub],
      ['rm -rf ../', sub],
      ['rm -rf *', dir],
      ['rm -rf .', dir],
      ['rm -rf ./', dir],
      ['cd ~ && rm -rf ./', sub],
      ['cd && rm -rf *', sub],
      ['cd .. && rm -rf .', sub],
      ['sh -c "cd ~ && rm -rf ."', sub],
      ['cd ~; find . -delete', sub],
      ['rm -rf ../..', path.join(sub, 'a')],
      ['rm -rf ..', path.dirname(dir)],
    ] as const) {
      expect(catastrophicCommand(command, cwd), `${command} in ${cwd}`).toBeDefined();
    }
  });

  it('leaves relative targets inside the project alone, and needs a folder to resolve them', () => {
    const dir = home();
    const sub = path.join(dir, 'proj');
    for (const [command, cwd] of [
      ['rm -rf *', sub],
      ['rm -rf ./dist', dir],
      ['rm -rf .', sub],
      ['rm -rf node_modules ../sibling', sub],
      ['cd proj && rm -rf .', dir],
      ['cd /tmp && rm -rf *', sub],
      // The folder is unknown after `cd $DIR` or `cd -`: variable tricks are out of scope.
      ['cd $DIR && rm -rf *', dir],
      ['cd - && rm -rf *', dir],
    ] as const) {
      expect(catastrophicCommand(command, cwd), `${command} in ${cwd}`).toBeUndefined();
    }
    expect(catastrophicCommand('rm -rf ..')).toBeUndefined();
  });

  it('flags chmod, chown and chgrp -R on protected roots only', () => {
    const dir = home();
    for (const command of ['chmod -R 000 /', 'chown -R root ~', 'chmod -R 777 /etc', 'chgrp --recursive staff /usr/local', `chmod -R go-rwx ${dir}/.ssh`, 'sudo chown -R me:me /']) {
      expect(catastrophicCommand(command), command).toBeDefined();
    }
    for (const command of ['chmod 000 /', 'chmod -R 755 ./dist', 'chown -R me ~/project', 'chmod -R +x /tmp/x']) {
      expect(catastrophicCommand(command, path.join(dir, 'proj')), command).toBeUndefined();
    }
  });

  it('flags writes to disk devices and removals under /usr, /etc and ~/.ssh', () => {
    home();
    for (const command of [
      '> /dev/sda',
      'echo x >/dev/nvme0n1',
      'cat image.iso > /dev/disk2',
      'cat image.iso >> /dev/sdb1',
      'dd if=image.iso of=/dev/sda bs=1m',
      'cat x | tee /dev/rdisk2',
      'cp image.iso /dev/sdc',
      'shred /dev/sda',
      'rm /etc/hosts',
      'rm -rf /usr/local/lib',
      'rmdir /etc/foo.d',
      'rm ~/.ssh/id_ed25519',
      'rm -rf $HOME/.ssh',
      'sudo rm /usr/bin/env',
      'find /etc -name "*.bak" -delete',
    ]) {
      expect(catastrophicCommand(command), command).toBeDefined();
    }
    for (const command of ['echo x > /dev/null', 'cat /dev/sda > disk.img', 'cp /dev/sda disk.img', 'dd if=/dev/sda of=disk.img', 'ls /etc', 'cat /etc/hosts', 'rm /tmp/x', 'rm -rf ~/projects/old']) {
      expect(catastrophicCommand(command), command).toBeUndefined();
    }
  });

  it('uses the platform home for `~`', () => {
    const dir = home();
    expect(os.homedir()).toBe(dir);
    expect(catastrophicCommand('rm -rf ~')).toBeDefined();
  });
});
