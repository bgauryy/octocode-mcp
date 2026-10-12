import { describe, expect, it } from 'vitest';
import { catastrophicCommand } from '../src/files/bash-guard.js';

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
